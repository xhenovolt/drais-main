/**
 * GET  /api/biometric/orphans          — list unclaimed orphan templates
 * POST /api/biometric/orphans/claim    — claim one and promote to mapping
 *
 * PHASE BIO-4 admin surface for the orphan-fingerprint queue.
 *
 * An orphan row is created whenever processFingerprint receives a
 * template for a PIN that has no zk_user_mapping entry. Before this
 * commit those bytes were silently dropped. They are now queued in
 * `fingerprint_orphans` for review. This route lets the admin:
 *
 *   - list every unclaimed row scoped to the active school
 *   - claim a specific orphan by binding it to a student_id (or
 *     staff_id), which:
 *       1. INSERTs the zk_user_mapping row that should have existed
 *       2. INSERTs the student_fingerprints row for the bound student
 *          (staff side stays template-less until the staff
 *          fingerprint table lands in a later phase)
 *       3. marks the orphan claimed_at + claimed_by
 *
 * After a claim, every subsequent scan from that PIN on that device
 * resolves correctly through the normal resolveUser path.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { fuzzyCandidates } from '@/lib/biometric/name-fuzzy';
import {
  recordTemplate,
  queueDistributionsForSchool,
  lookupActiveEnrollment,
} from '@/lib/biometric/template-service';

const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'];

export const runtime = 'nodejs';

interface OrphanRow {
  id:             number;
  school_id:      number | null;
  device_sn:      string;
  device_user_id: string;
  finger_id:      string;
  template_size:  number | null;
  valid_flag:     string | null;
  captured_at:    string;
}

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Best-effort. If the table doesn't exist yet (first deploy + no
  // orphan has ever been captured), return an empty list rather than
  // 500ing on a missing-table.
  let rows: OrphanRow[] = [];
  try {
    rows = (await query(
      `SELECT id, school_id, device_sn, device_user_id, finger_id,
              template_size, valid_flag, captured_at
         FROM fingerprint_orphans
        WHERE claimed_at IS NULL
          AND (school_id = ? OR school_id IS NULL)
        ORDER BY captured_at DESC
        LIMIT 200`,
      [session.schoolId],
    )) as OrphanRow[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/doesn.?t exist|no such table/i.test(msg)) {
      return NextResponse.json({ success: true, orphans: [], note: 'No orphan captures yet.' });
    }
    throw e;
  }

  // PHASE BIO-8 — attach device-known names + top fuzzy candidates
  // per orphan so the reviewing operator sees suggested matches
  // instead of just (deviceSn, PIN, fingerId).
  const enriched = await Promise.all(rows.map(async r => {
    let deviceKnownName: string | null = null;
    try {
      const dudRows = (await query(
        `SELECT device_name
           FROM device_user_directory
          WHERE device_sn = ? AND device_user_id = ?
          LIMIT 1`,
        [r.device_sn, r.device_user_id],
      )) as Array<{ device_name: string }>;
      deviceKnownName = dudRows[0]?.device_name ?? null;
    } catch { /* table not present yet */ }

    const candidates = deviceKnownName
      ? await fuzzyCandidates(deviceKnownName, session.schoolId)
      : [];

    return {
      id:              r.id,
      deviceSn:        r.device_sn,
      deviceUserId:    r.device_user_id,
      fingerId:        r.finger_id,
      fingerName:      fingerName(r.finger_id),
      templateSize:    r.template_size,
      capturedAt:      r.captured_at,
      deviceKnownName,
      suggestedMatches: candidates,
    };
  }));

  return NextResponse.json({ success: true, orphans: enriched });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { orphan_id?: number; student_id?: number; staff_id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const orphanId = Number(body.orphan_id);
  const studentId = body.student_id != null ? Number(body.student_id) : null;
  const staffId   = body.staff_id   != null ? Number(body.staff_id)   : null;
  if (!orphanId)                          return NextResponse.json({ error: 'orphan_id required' }, { status: 400 });
  if (!studentId && !staffId)             return NextResponse.json({ error: 'student_id or staff_id required' }, { status: 400 });
  if (studentId && staffId)               return NextResponse.json({ error: 'pass student_id OR staff_id, not both' }, { status: 400 });

  // 1. Load the orphan, school-scoped.
  const orphanRows = (await query(
    `SELECT id, school_id, device_sn, device_user_id, finger_id,
            template_size, template_data, claimed_at
       FROM fingerprint_orphans
      WHERE id = ?
      LIMIT 1`,
    [orphanId],
  )) as Array<{
    id: number; school_id: number | null;
    device_sn: string; device_user_id: string; finger_id: string;
    template_size: number | null; template_data: string;
    claimed_at: string | null;
  }>;
  if (orphanRows.length === 0) {
    return NextResponse.json({ error: 'Orphan not found' }, { status: 404 });
  }
  const orphan = orphanRows[0];
  if (orphan.school_id !== null && orphan.school_id !== session.schoolId) {
    return NextResponse.json({ error: 'Orphan not in your school' }, { status: 404 });
  }
  if (orphan.claimed_at !== null) {
    return NextResponse.json({ error: 'Orphan already claimed' }, { status: 409 });
  }

  // 2. Confirm the chosen person belongs to the same school.
  if (studentId) {
    const ok = (await query(
      `SELECT id FROM students WHERE id = ? AND school_id = ? LIMIT 1`,
      [studentId, session.schoolId],
    )) as Array<{ id: number }>;
    if (ok.length === 0) return NextResponse.json({ error: 'Student not in your school' }, { status: 404 });
  } else if (staffId) {
    const ok = (await query(
      `SELECT id FROM staff WHERE id = ? AND school_id = ? LIMIT 1`,
      [staffId, session.schoolId],
    )) as Array<{ id: number }>;
    if (ok.length === 0) return NextResponse.json({ error: 'Staff not in your school' }, { status: 404 });
  }

  // 3. Write the zk_user_mapping row that the scan-time resolveUser
  //    would have wanted. INSERT with ON DUPLICATE KEY UPDATE so a
  //    pre-existing orphan-only mapping (created by manual-upload's
  //    placeholder student row) gets rebound to the correct identity.
  await query(
    `INSERT INTO zk_user_mapping
       (school_id, device_user_id, user_type, student_id, staff_id, device_sn)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       user_type  = VALUES(user_type),
       student_id = VALUES(student_id),
       staff_id   = VALUES(staff_id),
       updated_at = CURRENT_TIMESTAMP`,
    [
      session.schoolId,
      orphan.device_user_id,
      studentId ? 'student' : 'staff',
      studentId,
      staffId,
      orphan.device_sn,
    ],
  );

  // 4. If a student was chosen, also write the student_fingerprints
  //    row using the orphan's template bytes. Staff fingerprint
  //    storage doesn't have a table today (see audit Phase 1) — the
  //    mapping suffices for staff attribution at scan time.
  if (studentId) {
    const fidNum = parseInt(orphan.finger_id, 10) || 0;
    const fingerPosition = FINGER_NAMES[fidNum % 5] || 'unknown';
    const hand = fidNum < 5 ? 'right' : 'left';
    const deviceRow = (await query(
      `SELECT id FROM devices WHERE sn = ? LIMIT 1`,
      [orphan.device_sn],
    )) as Array<{ id: number }>;
    const deviceId = deviceRow[0]?.id ?? null;
    await query(
      `INSERT INTO student_fingerprints
         (school_id, student_id, device_id, finger_position, hand, template_data,
          template_format, quality_score, enrollment_timestamp, is_active, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ZK_ADMS', ?, CURRENT_TIMESTAMP, 1, 'active')
       ON DUPLICATE KEY UPDATE
         template_data = VALUES(template_data),
         quality_score = VALUES(quality_score),
         enrollment_timestamp = CURRENT_TIMESTAMP,
         is_active = 1,
         status = 'active'`,
      [
        session.schoolId,
        studentId,
        deviceId,
        fingerPosition,
        hand,
        orphan.template_data,
        orphan.template_size ?? 0,
      ],
    );
  }

  // 5. Mark the orphan claimed.
  await query(
    `UPDATE fingerprint_orphans
        SET claimed_at         = NOW(),
            claimed_by         = ?,
            claimed_student_id = ?,
            claimed_staff_id   = ?
      WHERE id = ?`,
    [(session as { userId?: number }).userId ?? null, studentId, staffId, orphanId],
  );

  // PHASE 4 — promote the orphan's bytes into the canonical
  // biometric_templates table and queue distribution to sibling
  // devices. The legacy student_fingerprints write above remains the
  // reader contract; this step is what eventually lets the learner be
  // recognised on every device of the school without re-enrolling per
  // device (F6).
  let templateId: number | null = null;
  let distributionsQueued = 0;
  try {
    const pinValue = parseInt(orphan.device_user_id, 10) || 0;
    const enrollment = await lookupActiveEnrollment(session.schoolId, pinValue);
    if (enrollment) {
      const fingerIndex = parseInt(orphan.finger_id, 10) || 0;
      const t = await recordTemplate({
        enrollmentId: enrollment.enrollmentId,
        fingerIndex,
        templateBytes: orphan.template_data,
        templateSize: orphan.template_size,
        capturedDeviceSn: orphan.device_sn,
      });
      templateId = t.templateId;
      if (templateId) {
        distributionsQueued = await queueDistributionsForSchool(
          templateId, session.schoolId, orphan.device_sn,
        );
      }
    }
  } catch (err) {
    // Non-fatal: the orphan is already claimed and the legacy
    // student_fingerprints row already written. Surface the failure
    // so ops can replay via the admin redistribute route.
    console.warn('[orphans/claim] template promotion failed', err);
  }

  return NextResponse.json({
    success: true,
    claimed: {
      orphanId,
      deviceSn:     orphan.device_sn,
      deviceUserId: orphan.device_user_id,
      fingerId:     orphan.finger_id,
      assignedTo:   studentId ? { type: 'student', id: studentId } : { type: 'staff', id: staffId },
      templateId,
      distributionsQueued,
    },
  });
}

function fingerName(fingerId: string): string {
  const n = parseInt(fingerId, 10) || 0;
  const finger = FINGER_NAMES[n % 5] || 'unknown';
  const hand = n < 5 ? 'right' : 'left';
  return `${hand} ${finger}`;
}
