import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { logAudit, AuditAction } from '@/lib/audit';

/**
 * ZKTeco ADMS (Push Protocol) Handler
 * ────────────────────────────────────
 * All device traffic arrives via rewrite:
 *   /iclock/* → /api/zk-handler
 *
 * Protocol rules:
 *   - Always respond 200 text/plain
 *   - Even on errors → return "OK" (device disconnects permanently otherwise)
 *   - One command per GET response max
 */

export const runtime = 'nodejs';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Always return text/plain. Device expects this format — NEVER return JSON. */
function textResponse(body: string = 'OK', status: number = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

/**
 * Parse ZKTeco ADMS body.
 * Format varies by firmware but commonly:
 *   - Tab-separated key=value pairs on a single line
 *   - Or newline-separated rows of tab-separated key=value
 *
 * Examples:
 *   USERID=101\tCHECKTIME=2026-03-30 10:00:00\tLOGID=1
 *   101\t2026-03-30 10:00:00\t0\t1\t\t0\t0\t0\t0
 */
function parseZKBody(raw: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  if (!raw || !raw.trim()) return records;

  const lines = raw.trim().split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Key=Value format (standard ADMS)
    if (trimmed.includes('=')) {
      const record: Record<string, string> = {};
      const parts = trimmed.split('\t');
      for (const part of parts) {
        const eqIdx = part.indexOf('=');
        if (eqIdx > 0) {
          const key = part.substring(0, eqIdx).trim().toUpperCase();
          const value = part.substring(eqIdx + 1).trim();
          record[key] = value;
        }
      }
      if (Object.keys(record).length > 0) records.push(record);
    } else {
      // Positional format: userid \t timestamp \t status \t verify \t workcode \t ...
      const cols = trimmed.split('\t');
      if (cols.length >= 2) {
        records.push({
          USERID: cols[0]?.trim() || '',
          CHECKTIME: cols[1]?.trim() || '',
          VERIFYTYPE: cols[2]?.trim() || '',
          INOUTMODE: cols[3]?.trim() || '',
          WORKCODE: cols[4]?.trim() || '',
          LOGID: cols[5]?.trim() || '',
        });
      }
    }
  }

  return records;
}

/** Extract device serial number from request. */
function getSerialNumber(req: NextRequest): string | null {
  const url = new URL(req.url);
  return url.searchParams.get('SN') || url.searchParams.get('sn') || null;
}

/** Get client IP for logging. */
function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** Structured log to stdout (JSON for Vercel log drain). */
function zkLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  data: Record<string, unknown>,
) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    type: 'ZK_ADMS',
    event,
    ...data,
  };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

// ─── Database Operations (all wrapped in try/catch — NEVER crash) ─────────

/** Log raw HTTP traffic to zk_raw_logs. */
async function saveRawLog(
  deviceSn: string,
  method: string,
  queryString: string,
  body: string | null,
  parsedData: unknown,
  sourceIp: string,
  userAgent: string,
): Promise<number | null> {
  try {
    const result = await query(
      `INSERT INTO zk_raw_logs (device_sn, http_method, query_string, raw_body, parsed_data, source_ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [deviceSn, method, queryString, body, JSON.stringify(parsedData), sourceIp, userAgent],
    );
    return (result as any)?.insertId ?? null;
  } catch (err) {
    zkLog('error', 'RAW_LOG_SAVE_FAILED', { deviceSn, error: String(err) });
    return null;
  }
}

/** Register device or update heartbeat on first/every GET. */
async function upsertDevice(
  sn: string,
  ip: string,
  options: string | null,
  pushVer: string | null,
): Promise<void> {
  try {
    await query(
      `INSERT INTO zk_devices (serial_number, ip_address, options, push_version, last_heartbeat, status)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'active')
       ON DUPLICATE KEY UPDATE
         ip_address = VALUES(ip_address),
         options = COALESCE(VALUES(options), options),
         push_version = COALESCE(VALUES(push_version), push_version),
         last_heartbeat = CURRENT_TIMESTAMP,
         status = 'active',
         updated_at = CURRENT_TIMESTAMP`,
      [sn, ip, options, pushVer],
    );
  } catch (err) {
    zkLog('error', 'DEVICE_UPSERT_FAILED', { sn, error: String(err) });
  }

  // ── Also upsert into unified `devices` table for real-time monitoring ──
  try {
    await query(
      `INSERT INTO devices (sn, last_seen, ip_address, is_online)
       VALUES (?, NOW(), ?, TRUE)
       ON DUPLICATE KEY UPDATE
         last_seen = NOW(),
         ip_address = VALUES(ip_address),
         is_online = TRUE`,
      [sn, ip],
    );
  } catch (err) {
    zkLog('error', 'DEVICES_TABLE_UPSERT_FAILED', { sn, error: String(err) });
  }
}

/** Fetch the highest-priority pending command for a device. */
async function getPendingCommand(
  sn: string,
): Promise<{ id: number; command: string } | null> {
  try {
    const rows = await query(
      `SELECT id, command FROM zk_device_commands
       WHERE device_sn = ? AND status = 'pending'
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
         AND retry_count < max_retries
       ORDER BY priority DESC, id ASC
       LIMIT 1`,
      [sn],
    );
    if (!rows || rows.length === 0) return null;
    return { id: rows[0].id, command: rows[0].command };
  } catch (err) {
    zkLog('error', 'COMMAND_FETCH_FAILED', { sn, error: String(err) });
    return null;
  }
}

/** Mark a command as sent after delivery. */
async function markCommandSent(commandId: number): Promise<void> {
  try {
    await query(
      `UPDATE zk_device_commands
       SET status = 'sent', sent_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [commandId],
    );
  } catch (err) {
    zkLog('error', 'COMMAND_MARK_SENT_FAILED', { commandId, error: String(err) });
  }
}

/** Save a parsed attendance punch. */
async function saveAttendancePunch(
  deviceSn: string,
  record: Record<string, string>,
  rawLogId: number | null,
): Promise<void> {
  const userId = record.USERID;
  const checkTime = record.CHECKTIME;
  if (!userId || !checkTime) return;

  try {
    // Check user mapping
    const mapping = await query(
      `SELECT user_type, student_id, staff_id FROM zk_user_mapping
       WHERE device_user_id = ? AND (device_sn = ? OR device_sn IS NULL)
       LIMIT 1`,
      [userId, deviceSn],
    );

    const studentId = mapping?.[0]?.student_id ?? null;
    const staffId = mapping?.[0]?.staff_id ?? null;
    const matched = mapping && mapping.length > 0 ? 1 : 0;

    await query(
      `INSERT INTO zk_attendance_logs
         (device_sn, device_user_id, student_id, staff_id, check_time,
          verify_type, io_mode, log_id, work_code, matched, raw_log_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deviceSn,
        userId,
        studentId,
        staffId,
        checkTime,
        record.VERIFYTYPE ? parseInt(record.VERIFYTYPE, 10) || null : null,
        record.INOUTMODE ? parseInt(record.INOUTMODE, 10) || null : null,
        record.LOGID || null,
        record.WORKCODE || null,
        matched,
        rawLogId,
      ],
    );

    zkLog('info', 'PUNCH_SAVED', {
      deviceSn,
      userId,
      checkTime,
      matched: !!matched,
      studentId,
      staffId,
    });
  } catch (err) {
    zkLog('error', 'PUNCH_SAVE_FAILED', {
      deviceSn,
      userId,
      checkTime,
      error: String(err),
    });
  }
}

// ─── HTTP Handlers ────────────────────────────────────────────────────────────

/**
 * GET /iclock/cdata  (or /iclock/getrequest)
 *
 * Purpose: Device handshake + heartbeat + command delivery
 *
 * The device sends GET periodically (configurable interval, typically 60s).
 * Query params include: SN, options, pushver, language, ...
 *
 * Response:
 *   - "OK"        → no commands pending
 *   - "C:id:cmd"  → deliver one command
 */
export async function GET(req: NextRequest) {
  const sn = getSerialNumber(req);
  const url = new URL(req.url);
  const qs = url.search;
  const ip = getClientIP(req);
  const ua = req.headers.get('user-agent') || '';
  const options = url.searchParams.get('options');
  const pushVer = url.searchParams.get('pushver');

  try {
    zkLog('info', 'HEARTBEAT', { sn, ip, qs });

    if (!sn) {
      zkLog('warn', 'NO_SERIAL_NUMBER', { ip, qs });
      return textResponse('OK');
    }

    // Fire-and-forget: log raw traffic + upsert device
    const rawLogPromise = saveRawLog(sn, 'GET', qs, null, null, ip, ua);
    const upsertPromise = upsertDevice(sn, ip, options, pushVer);

    // Check command queue
    const pending = await getPendingCommand(sn);

    // Await background writes (don't block response but ensure they complete)
    await Promise.allSettled([rawLogPromise, upsertPromise]);

    if (pending) {
      zkLog('info', 'COMMAND_DELIVERED', {
        sn,
        commandId: pending.id,
        command: pending.command.substring(0, 100),
      });
      await markCommandSent(pending.id);
      return textResponse(`C:${pending.id}:${pending.command}`);
    }

    return textResponse('OK');
  } catch (err) {
    zkLog('error', 'GET_HANDLER_ERROR', { sn, error: String(err) });
    return textResponse('OK'); // NEVER break protocol
  }
}

/**
 * POST /iclock/cdata
 *
 * Purpose: Device pushes attendance logs (punches)
 *
 * Body formats:
 *   Key=Value tab-separated:
 *     USERID=101\tCHECKTIME=2026-03-30 10:00:00\tVERIFYTYPE=1\tINOUTMODE=0
 *
 *   Positional tab-separated:
 *     101\t2026-03-30 10:00:00\t1\t0\t\t0
 *
 *   Can contain multiple lines (bulk push).
 */
export async function POST(req: NextRequest) {
  const sn = getSerialNumber(req);
  const url = new URL(req.url);
  const qs = url.search;
  const ip = getClientIP(req);
  const ua = req.headers.get('user-agent') || '';

  let rawBody = '';

  try {
    rawBody = await req.text();

    zkLog('info', 'DATA_RECEIVED', {
      sn,
      ip,
      bodyLength: rawBody.length,
      bodyPreview: rawBody.substring(0, 200),
    });

    if (!sn) {
      zkLog('warn', 'POST_NO_SERIAL', { ip, bodyPreview: rawBody.substring(0, 100) });
      return textResponse('OK');
    }

    const records = parseZKBody(rawBody);

    zkLog('info', 'DATA_PARSED', {
      sn,
      recordCount: records.length,
      records: records.slice(0, 3), // Log first 3 for debugging
    });

    // Save raw log first
    const rawLogId = await saveRawLog(sn, 'POST', qs, rawBody, records, ip, ua);

    // Process each attendance record
    const savePromises = records.map(record =>
      saveAttendancePunch(sn, record, rawLogId),
    );

    await Promise.allSettled(savePromises);

    // Update device last_activity
    try {
      await query(
        `UPDATE zk_devices SET last_activity = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE serial_number = ?`,
        [sn],
      );
    } catch {
      // Non-critical
    }

    zkLog('info', 'DATA_PROCESSED', {
      sn,
      recordCount: records.length,
    });

    return textResponse('OK');
  } catch (err) {
    zkLog('error', 'POST_HANDLER_ERROR', {
      sn,
      error: String(err),
      bodyLength: rawBody.length,
    });
    return textResponse('OK'); // NEVER break protocol
  }
}
