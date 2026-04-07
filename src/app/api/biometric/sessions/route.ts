/**
 * POST /api/biometric/sessions
 *
 * Create an enrollment session. Called by local-enroll / relay-enroll when
 * an admin clicks the "Enroll Fingerprint" button for a specific student.
 *
 * Body: { device_sn: string, student_id: number, finger?: number }
 * Returns: { session_id: number, expires_at: string }
 *
 * PATCH /api/biometric/sessions
 *
 * Close a session (mark as COMPLETED or FAILED).
 * Body: { session_id: number, status: 'COMPLETED' | 'FAILED' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

// ─── POST: create session ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { device_sn, student_id } = body;
  if (!device_sn) {
    return NextResponse.json({ error: 'device_sn required' }, { status: 400 });
  }

  const schoolId = session.schoolId;
  const initiatedBy = session.userId;

  try {
    const result = await query(
      `INSERT INTO enrollment_sessions
         (school_id, device_sn, initiated_by, student_id, status, expires_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [schoolId, device_sn, initiatedBy, student_id ?? null],
    );
    const sessionId = (result as any).insertId;

    // Expire any older ACTIVE sessions for this school/device pair
    await query(
      `UPDATE enrollment_sessions
       SET status = 'EXPIRED'
       WHERE school_id = ? AND device_sn = ? AND status = 'ACTIVE'
         AND id != ? AND expires_at < NOW()`,
      [schoolId, device_sn, sessionId],
    ).catch(() => {});

    const rows = await query(
      `SELECT expires_at FROM enrollment_sessions WHERE id = ? LIMIT 1`,
      [sessionId],
    );

    return NextResponse.json({
      session_id: sessionId,
      expires_at: rows?.[0]?.expires_at ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: `DB error: ${e.message}` }, { status: 500 });
  }
}

// ─── PATCH: close session ────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { session_id, status } = body;
  if (!session_id || !['COMPLETED', 'FAILED', 'EXPIRED'].includes(status)) {
    return NextResponse.json(
      { error: 'session_id and valid status (COMPLETED|FAILED|EXPIRED) required' },
      { status: 400 },
    );
  }

  try {
    await query(
      `UPDATE enrollment_sessions
       SET status = ?, completed_at = NOW()
       WHERE id = ? AND school_id = ?`,
      [status, session_id, session.schoolId],
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: `DB error: ${e.message}` }, { status: 500 });
  }
}
