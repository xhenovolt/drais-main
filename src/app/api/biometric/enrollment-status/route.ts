/**
 * Biometric enrollment status (hardening Parts 4 & 5 — expose what exists).
 *
 * GET ?person_id=&role=  → the person's enrollment: PIN, card, and every
 *     enrolled finger (multi-finger is already supported by
 *     biometric_templates.finger_index). Read-only.
 * POST { action:'set_card', enrollment_id, card_number }
 *      { action:'remove_finger', enrollment_id, finger_index }
 * Both are DATA operations (no device needed) and are audited.
 * Adding a NEW finger requires a physical capture on the enrollment station
 * — the UI routes there; we never fake a template.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';

export const runtime = 'nodejs';

export const FINGER_NAMES = [
  'Left little', 'Left ring', 'Left middle', 'Left index', 'Left thumb',
  'Right thumb', 'Right index', 'Right middle', 'Right ring', 'Right little',
];

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const personId = Number(sp.get('person_id'));
  if (!Number.isFinite(personId)) return NextResponse.json({ error: 'person_id required' }, { status: 400 });

  const enr = (await query(
    `SELECT id, pin_value, card_number, role_type, role_ref_id, status, origin_device_sn, enrolled_at
       FROM biometric_enrollments
      WHERE school_id = ? AND person_id = ? AND status IN ('active','pending_capture')
      ORDER BY id DESC LIMIT 1`,
    [session.schoolId, personId],
  )) as any[];
  if (!enr[0]) return NextResponse.json({ success: true, enrolled: false });

  const fingers = (await query(
    `SELECT bt.finger_index, bt.quality_score, bt.captured_device_sn, bt.captured_at, bt.template_size,
            bt.id AS template_id,
            SUM(td.status = 'loaded') AS on_devices,
            SUM(td.status = 'queued') AS pending_devices,
            COUNT(td.id) AS total_targets
       FROM biometric_templates bt
       LEFT JOIN template_distributions td ON td.template_id = bt.id
      WHERE bt.enrollment_id = ?
      GROUP BY bt.id, bt.finger_index, bt.quality_score, bt.captured_device_sn, bt.captured_at, bt.template_size
      ORDER BY bt.finger_index ASC`,
    [enr[0].id],
  ).catch(() => [])) as any[];

  return NextResponse.json({
    success: true, enrolled: true,
    enrollment: {
      id: enr[0].id, pin: enr[0].pin_value, card_number: enr[0].card_number,
      role_type: enr[0].role_type, status: enr[0].status,
      origin_device_sn: enr[0].origin_device_sn, enrolled_at: enr[0].enrolled_at,
    },
    fingers: fingers.map(f => ({
      finger_index: Number(f.finger_index),
      name: FINGER_NAMES[Number(f.finger_index)] || `Finger ${f.finger_index}`,
      quality: f.quality_score, device: f.captured_device_sn, captured_at: f.captured_at,
      // Central-store sync state (Part 6): on how many devices this template
      // is loaded vs still queued. Push itself is gated on device validation.
      sync: { on_devices: Number(f.on_devices || 0), pending: Number(f.pending_devices || 0), targets: Number(f.total_targets || 0) },
    })),
    methods: {
      fingerprint: fingers.length > 0,
      card: !!enr[0].card_number,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'attendance.manage', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const b = await req.json().catch(() => null);
  const enrollmentId = Number(b?.enrollment_id);
  if (!Number.isFinite(enrollmentId)) return NextResponse.json({ error: 'enrollment_id required' }, { status: 400 });

  // Scope-check the enrollment belongs to this school.
  const own = (await query(`SELECT id, pin_value, origin_device_sn FROM biometric_enrollments WHERE id = ? AND school_id = ? LIMIT 1`, [enrollmentId, session.schoolId])) as any[];
  if (!own[0]) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });

  const { recordMappingHistory } = await import('@/lib/biometric/enrollment-service');

  if (b.action === 'set_card') {
    const card = String(b.card_number || '').trim() || null;
    await query(`UPDATE biometric_enrollments SET card_number = ?, updated_by = ?, updated_at = NOW() WHERE id = ? AND school_id = ?`,
      [card, session.userId, enrollmentId, session.schoolId]);
    await recordMappingHistory({
      schoolId: session.schoolId, enrollmentId, deviceSn: own[0].origin_device_sn, pin: own[0].pin_value,
      action: 'card_set' as any, reason: card ? `card ${card} assigned` : 'card cleared', actorUserId: session.userId,
    }).catch(() => {});
    return NextResponse.json({ success: true, card_number: card });
  }

  if (b.action === 'remove_finger') {
    const fi = Number(b.finger_index);
    if (!Number.isFinite(fi)) return NextResponse.json({ error: 'finger_index required' }, { status: 400 });
    const del = (await query(`DELETE FROM biometric_templates WHERE enrollment_id = ? AND finger_index = ?`, [enrollmentId, fi])) as any;
    await recordMappingHistory({
      schoolId: session.schoolId, enrollmentId, deviceSn: own[0].origin_device_sn, pin: own[0].pin_value,
      action: 'finger_removed' as any, reason: `finger ${fi} template removed`, actorUserId: session.userId,
    }).catch(() => {});
    return NextResponse.json({ success: true, removed: Number(del?.affectedRows || 0) });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
