/**
 * DRAIS — JETON Control API
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS NOT A PUBLIC API. This is a private control channel for JETON.
 *
 * Entry point:  /api/control?action=<action>
 * Auth:         x-api-key + x-api-secret headers (env: CONTROL_API_KEY / CONTROL_API_SECRET)
 * Rate limit:   60 req/min per IP
 * IP whitelist: set CONTROL_ALLOWED_IPS (comma-separated) to restrict access
 *
 * Supported actions (GET):
 *   ping           — heartbeat check
 *   getSchools     — list all schools (safe fields only)
 *   getAuditLogs   — last 100 control audit entries
 *
 * Supported actions (POST, JSON body):
 *   suspendSchool  { school_id }  — set school status → suspended
 *   activateSchool { school_id }  — set school status → active
 *
 * Every action is logged to audit_logs with source = JETON.
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { query } from '@/lib/db';

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 8 — Rate limiter (in-memory, per IP)
// ─────────────────────────────────────────────────────────────────────────────
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX        = 60;
const RATE_LIMIT_WINDOW_MS  = 60_000;

function checkRateLimit(ip: string): boolean {
  const now   = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 11 — IP whitelist (activated by setting CONTROL_ALLOWED_IPS)
// ─────────────────────────────────────────────────────────────────────────────
function checkIpWhitelist(ip: string): void {
  const raw = process.env.CONTROL_ALLOWED_IPS;
  if (!raw) return; // Not configured → disabled

  const list = raw.split(',').map(x => x.trim()).filter(Boolean);
  if (list.length > 0 && !list.includes(ip)) {
    throw new Error('Forbidden: IP not whitelisted');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2 — Authentication
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Constant-time string comparison — prevents timing attacks.
 * Returns false immediately if lengths differ (no extra info leaks because
 * the attacker already knows whether the length matches by the response time
 * of a fixed-length comparison anyway; length reveals nothing useful here).
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function validateControlAccess(req: NextRequest): void {
  const apiKey    = req.headers.get('x-api-key')    ?? '';
  const apiSecret = req.headers.get('x-api-secret') ?? '';

  const expectedKey    = process.env.CONTROL_API_KEY    ?? '';
  const expectedSecret = process.env.CONTROL_API_SECRET ?? '';

  if (!expectedKey || !expectedSecret) {
    // Misconfigured server — refuse all requests
    throw new Error('Control API not configured on server');
  }

  if (!safeCompare(apiKey, expectedKey) || !safeCompare(apiSecret, expectedSecret)) {
    throw new Error('Unauthorized');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 9 — Audit logger (never blocks control operations)
// ─────────────────────────────────────────────────────────────────────────────
async function logControlAction(
  actionType: string,
  schoolId: number,
  entityId: number | null,
  details: Record<string, unknown>,
  ip: string,
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs
         (school_id, user_id, action_type, entity_type, entity_id, new_value, ip_address, user_agent)
       VALUES (?, NULL, ?, 'CONTROL', ?, ?, ?, 'JETON-CONTROL')`,
      [
        schoolId,
        actionType,
        entityId,
        JSON.stringify({ source: 'JETON', ...details }),
        ip,
      ],
    );
  } catch (err) {
    // Audit failure must NEVER break the control operation
    console.error('[Control/Audit] Failed to write log for action:', actionType, err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 — Action handlers
// ─────────────────────────────────────────────────────────────────────────────

/** PING — heartbeat */
async function handlePing(): Promise<NextResponse> {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}

/** GET SCHOOLS — Phase 4: safe fields only */
async function handleGetSchools(ip: string): Promise<NextResponse> {
  const rows = await query(
    `SELECT id, name, external_id, status, created_at
     FROM schools
     WHERE deleted_at IS NULL
     ORDER BY created_at DESC`,
    [],
  );

  await logControlAction('CONTROL_GET_SCHOOLS', 0, null, {}, ip);

  return NextResponse.json({ schools: rows });
}

/** SUSPEND SCHOOL — Phase 5 */
async function handleSuspendSchool(req: NextRequest, ip: string): Promise<NextResponse> {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed — suspendSchool requires POST' }, { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const schoolId = Number(body?.school_id);
  if (!schoolId || !Number.isInteger(schoolId) || schoolId <= 0) {
    return NextResponse.json(
      { error: 'school_id is required and must be a positive integer' },
      { status: 400 },
    );
  }

  const existing = await query(
    `SELECT id, name, status FROM schools WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [schoolId],
  );

  if (!existing.length) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

  if (existing[0].status === 'suspended') {
    return NextResponse.json(
      { warning: 'School is already suspended', school_id: schoolId, status: 'suspended' },
      { status: 200 },
    );
  }

  // SAFE update — only changes status, no cascade, no data deletion
  await query(
    `UPDATE schools SET status = 'suspended', updated_at = NOW() WHERE id = ?`,
    [schoolId],
  );

  await logControlAction(
    'CONTROL_SUSPEND',
    schoolId,
    schoolId,
    { school_id: schoolId, school_name: existing[0].name, previous_status: existing[0].status },
    ip,
  );

  return NextResponse.json({ success: true, school_id: schoolId, status: 'suspended' });
}

/** ACTIVATE SCHOOL — Phase 5 */
async function handleActivateSchool(req: NextRequest, ip: string): Promise<NextResponse> {
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method not allowed — activateSchool requires POST' }, { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const schoolId = Number(body?.school_id);
  if (!schoolId || !Number.isInteger(schoolId) || schoolId <= 0) {
    return NextResponse.json(
      { error: 'school_id is required and must be a positive integer' },
      { status: 400 },
    );
  }

  const existing = await query(
    `SELECT id, name, status FROM schools WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [schoolId],
  );

  if (!existing.length) {
    return NextResponse.json({ error: 'School not found' }, { status: 404 });
  }

  if (existing[0].status === 'active') {
    return NextResponse.json(
      { warning: 'School is already active', school_id: schoolId, status: 'active' },
      { status: 200 },
    );
  }

  await query(
    `UPDATE schools SET status = 'active', updated_at = NOW() WHERE id = ?`,
    [schoolId],
  );

  await logControlAction(
    'CONTROL_ACTIVATE',
    schoolId,
    schoolId,
    { school_id: schoolId, school_name: existing[0].name, previous_status: existing[0].status },
    ip,
  );

  return NextResponse.json({ success: true, school_id: schoolId, status: 'active' });
}

/** GET AUDIT LOGS — Phase 7: safe fields only, last 100 control entries */
async function handleAuditLogs(ip: string): Promise<NextResponse> {
  const rows = await query(
    `SELECT action_type AS action, user_id, entity_id AS target_id, ip_address, created_at
     FROM audit_logs
     WHERE action_type LIKE 'CONTROL_%'
     ORDER BY created_at DESC
     LIMIT 100`,
    [],
  );

  await logControlAction('CONTROL_READ_AUDIT_LOGS', 0, null, {}, ip);

  return NextResponse.json({ logs: rows });
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1 — Main handler (single entry point)
// ─────────────────────────────────────────────────────────────────────────────
async function handler(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);

  // ── Phase 8: Rate limiting ─────────────────────────────────────────────────
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // ── Phase 11: IP whitelist (optional) ─────────────────────────────────────
  try {
    checkIpWhitelist(ip);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }

  // ── Phase 2: Authentication ────────────────────────────────────────────────
  try {
    validateControlAccess(req);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }

  // ── Phase 3: Action router ─────────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  // ── Phase 10: Error handling ───────────────────────────────────────────────
  try {
    switch (action) {
      case 'ping':
        return await handlePing();

      case 'getSchools':
        return await handleGetSchools(ip);

      case 'suspendSchool':
        return await handleSuspendSchool(req, ip);

      case 'activateSchool':
        return await handleActivateSchool(req, ip);

      case 'getAuditLogs':
        return await handleAuditLogs(ip);

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[Control] Unhandled error — action:', action, err);
    return NextResponse.json(
      { error: err.message ?? 'Internal server error' },
      { status: 500 },
    );
  }
}

// Export to Next.js App Router — both GET and POST route through the same handler
export const GET  = handler;
export const POST = handler;
