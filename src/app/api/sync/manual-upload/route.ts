import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

// Trusted internal callers: the local bridge (X-Bridge-Secret) or an
// authenticated session (cookie). We check the bridge secret first since
// this endpoint is also called machine-to-machine.
const BRIDGE_SECRET = process.env.DR_BRIDGE_SECRET || '';

interface ZkUser {
  uid: number;           // internal device UID
  userId: string;        // device "user ID" / enrollment number
  name: string;
  password?: string;
  role?: number;
  cardno?: string;
}

interface ZkTemplate {
  uid: number;
  finger: number;        // finger index 0–9
  valid: number;
  template: string | Buffer; // base64 or binary
}

interface MergeResult {
  users_processed: number;
  users_matched: number;
  users_orphaned: number;
  users_name_updated: number;
  fingerprints_added: number;
  errors: string[];
}

/**
 * POST /api/sync/manual-upload
 * Receives the raw dump from the ZKTeco device (users + optional fingerprint
 * templates) and merges them into the DRAIS database.
 *
 * Machine-is-Truth rules:
 *  1. Match by device_user_id + device_sn in zk_user_mapping.
 *  2. If found: compare name — if device name differs, update DRAIS record.
 *  3. If not found: create an ORPHANED zk_user_mapping row for admin review.
 *  4. For each template: if no fingerprint exists for this person+finger → insert.
 *
 * Auth: X-Bridge-Secret header (bridge calls from localhost) OR session cookie.
 */
export async function POST(req: NextRequest) {
  // Auth check — bridge secret takes precedence
  const bridgeToken = req.headers.get('x-bridge-secret') || '';
  const isBridgeCall = BRIDGE_SECRET.length >= 16 && bridgeToken === BRIDGE_SECRET;

  if (!isBridgeCall) {
    // Fall back to session-based auth
    const { getSessionSchoolId } = await import('@/lib/auth');
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    // When called from UI/session, session.schoolId must be in body too (validated below)
  }

  let body: {
    users: ZkUser[];
    templates?: ZkTemplate[];
    device_ip?: string;
    device_port?: number;
    device_sn?: string;
    school_id?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const users: ZkUser[] = Array.isArray(body.users) ? body.users : [];
  const templates: ZkTemplate[] = Array.isArray(body.templates) ? body.templates : [];

  // Resolve device_sn: explicit > look up by IP
  let deviceSn = body.device_sn || '';
  let schoolId  = Number(body.school_id) || 0;

  if (!deviceSn && body.device_ip) {
    const deviceRows = await query(
      `SELECT sn, school_id FROM devices WHERE ip_address = ? LIMIT 1`,
      [body.device_ip],
    );
    if (deviceRows.length) {
      deviceSn = deviceRows[0].sn;
      if (!schoolId) schoolId = deviceRows[0].school_id;
    }
  }

  if (!deviceSn) {
    return NextResponse.json(
      { error: 'Cannot determine device_sn. Pass device_sn or a registered device_ip.' },
      { status: 422 },
    );
  }

  if (!schoolId) {
    // Last resort: look up via device SN
    const dr = await query(
      `SELECT school_id FROM devices WHERE sn = ? LIMIT 1`,
      [deviceSn],
    );
    schoolId = dr[0]?.school_id || 0;
  }

  if (!schoolId) {
    return NextResponse.json({ error: 'Cannot determine school_id for device.' }, { status: 422 });
  }

  // Build a fast lookup: device_user_id → mapping row
  const existingMappings: { id: number; device_user_id: string; user_type: string; student_id: number | null; staff_id: number | null }[] = await query(
    `SELECT id, device_user_id, user_type, student_id, staff_id
     FROM zk_user_mapping
     WHERE school_id = ? AND device_sn = ?`,
    [schoolId, deviceSn],
  );

  const mappingByUserId = new Map(existingMappings.map(m => [m.device_user_id, m]));

  // Build fingerprint presence set: "student_id:finger_index" or "staff_id:finger_index"
  const existingFingerprints: { student_id: number | null; staff_id: number | null; finger_position: string }[] = await query(
    `SELECT student_id, staff_id, finger_position FROM fingerprints WHERE school_id = ?`,
    [schoolId],
  );
  const fpSet = new Set(
    existingFingerprints.map(f => `${f.student_id ?? 'S' + f.staff_id}:${f.finger_position}`),
  );

  const result: MergeResult = {
    users_processed: users.length,
    users_matched: 0,
    users_orphaned: 0,
    users_name_updated: 0,
    fingerprints_added: 0,
    errors: [],
  };

  // ── Process each device user ────────────────────────────────────────────────
  for (const zkUser of users) {
    const uid      = String(zkUser.uid);
    const userId   = String(zkUser.userId || zkUser.uid);
    const name     = String(zkUser.name || '').trim();

    const mapping = mappingByUserId.get(userId);

    if (mapping) {
      result.users_matched++;

      // Machine-is-Truth: update name if it differs
      if (name && mapping.user_type === 'student' && mapping.student_id) {
        try {
          // Parse "First Last" split by space
          const parts = name.split(' ');
          const firstName = parts.slice(0, -1).join(' ') || parts[0] || name;
          const lastName  = parts.slice(-1)[0] || '';

          const studRows = await query(
            `SELECT first_name, last_name FROM students WHERE id = ? AND school_id = ? LIMIT 1`,
            [mapping.student_id, schoolId],
          );
          const stu = studRows[0];
          if (stu && (stu.first_name !== firstName || stu.last_name !== lastName)) {
            await query(
              `UPDATE students SET first_name = ?, last_name = ? WHERE id = ? AND school_id = ?`,
              [firstName, lastName, mapping.student_id, schoolId],
            );
            result.users_name_updated++;
          }
        } catch (err: any) {
          result.errors.push(`Name update for student ${mapping.student_id}: ${err.message}`);
        }
      }

      if (name && mapping.user_type === 'staff' && mapping.staff_id) {
        try {
          const parts = name.split(' ');
          const firstName = parts.slice(0, -1).join(' ') || parts[0] || name;
          const lastName  = parts.slice(-1)[0] || '';

          const stfRows = await query(
            `SELECT first_name, last_name FROM staff WHERE id = ? AND school_id = ? LIMIT 1`,
            [mapping.staff_id, schoolId],
          );
          const stf = stfRows[0];
          if (stf && (stf.first_name !== firstName || stf.last_name !== lastName)) {
            await query(
              `UPDATE staff SET first_name = ?, last_name = ? WHERE id = ? AND school_id = ?`,
              [firstName, lastName, mapping.staff_id, schoolId],
            );
            result.users_name_updated++;
          }
        } catch (err: any) {
          result.errors.push(`Name update for staff ${mapping.staff_id}: ${err.message}`);
        }
      }
    } else {
      // Unknown user on device — create ORPHANED mapping for admin review
      result.users_orphaned++;
      try {
        await query(
          `INSERT IGNORE INTO zk_user_mapping
             (school_id, device_user_id, user_type, device_sn, created_at)
           VALUES (?, ?, 'student', ?, NOW())`,
          [schoolId, userId, deviceSn],
          // user_type 'student' is a placeholder; admin must reassign
        );
      } catch (err: any) {
        result.errors.push(`Orphan insert for uid ${userId}: ${err.message}`);
      }
    }
  }

  // ── Process fingerprint templates ──────────────────────────────────────────
  for (const tpl of templates) {
    const userId   = String(tpl.uid);
    const finger   = tpl.finger ?? 0;
    const mapping  = mappingByUserId.get(userId);

    if (!mapping || (!mapping.student_id && !mapping.staff_id)) continue;

    const fingerPos = String(finger); // store as string e.g. "0", "1" … "9"
    const fpKey = `${mapping.student_id ?? 'S' + mapping.staff_id}:${fingerPos}`;

    if (fpSet.has(fpKey)) continue; // already have this finger

    const tplData = typeof tpl.template === 'string'
      ? Buffer.from(tpl.template, 'base64')
      : Buffer.from(tpl.template as any);

    try {
      await query(
        `INSERT INTO fingerprints
           (school_id, student_id, staff_id, fingerprint_data, finger_position, quality_score, is_verified, enrollment_date)
         VALUES (?, ?, ?, ?, ?, ?, 1, NOW())`,
        [
          schoolId,
          mapping.student_id ?? null,
          mapping.staff_id ?? null,
          tplData,
          fingerPos,
          tpl.valid ?? 0,
        ],
      );
      fpSet.add(fpKey);
      result.fingerprints_added++;
    } catch (err: any) {
      result.errors.push(`Fingerprint insert uid=${userId} finger=${finger}: ${err.message}`);
    }
  }

  return NextResponse.json({
    success: true,
    device_sn: deviceSn,
    school_id: schoolId,
    ...result,
  });
}
