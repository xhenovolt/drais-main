/**
 * Biometric template sync (Part 6 — outbound central-identity distribution).
 *
 * GET  ?device_sn=            → per-device sync status (loaded/queued counts),
 *                              reconciling acknowledged pushes first.
 * POST { device_sn, person_id? } → MANUALLY push stored fingerprint templates
 *                              to a device (a person's, or all enrollments).
 *                              Manual by design — no silent fleet push. Audited.
 *
 * Requires attendance.devices.manage (or attendance.manage). A FINGERTMP
 * command only adds/updates a finger on the target; it never deletes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { syncTemplatesToDevice, reconcileTemplateDistributions } from '@/lib/biometric/template-distribution';

export const runtime = 'nodejs';

async function authorize(session: any) {
  try { await requirePermission(session.userId, session.schoolId, 'attendance.devices.manage', session.isSuperAdmin); return true; }
  catch {
    if (session.isSuperAdmin) return true;
    try { await requirePermission(session.userId, session.schoolId, 'attendance.manage', session.isSuperAdmin); return true; } catch { return false; }
  }
}

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const deviceSn = new URL(req.url).searchParams.get('device_sn');

  const devices = (await query(
    `SELECT sn, device_name, is_online FROM devices WHERE school_id = ? AND deleted_at IS NULL`,
    [session.schoolId],
  )) as any[];

  const status = [];
  for (const d of devices) {
    await reconcileTemplateDistributions(session.schoolId, d.sn).catch(() => {});
    const c = (await query(
      `SELECT SUM(td.status='loaded') loaded, SUM(td.status='queued') queued, SUM(td.status='failed') failed
         FROM template_distributions td JOIN biometric_templates bt ON bt.id = td.template_id
         JOIN biometric_enrollments be ON be.id = bt.enrollment_id
        WHERE be.school_id = ? AND td.device_sn = ?`,
      [session.schoolId, d.sn],
    ).catch(() => [{}])) as any[];
    status.push({
      sn: d.sn, device_name: d.device_name, is_online: Number(d.is_online) === 1,
      loaded: Number(c[0]?.loaded || 0), queued: Number(c[0]?.queued || 0), failed: Number(c[0]?.failed || 0),
    });
  }
  return NextResponse.json({ success: true, devices: status, filtered: deviceSn || null });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!(await authorize(session))) return NextResponse.json({ error: 'Device management permission required' }, { status: 403 });

  const b = await req.json().catch(() => null);
  if (!b?.device_sn) return NextResponse.json({ error: 'device_sn is required' }, { status: 400 });

  // Scope-check the device belongs to this school.
  const own = (await query(`SELECT sn FROM devices WHERE sn = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`, [String(b.device_sn), session.schoolId])) as any[];
  if (!own[0]) return NextResponse.json({ error: 'Device not found for this school' }, { status: 404 });

  try {
    const res = await syncTemplatesToDevice({
      schoolId: session.schoolId, deviceSn: String(b.device_sn),
      personId: b.person_id ? Number(b.person_id) : null, actorUserId: session.userId,
    });
    return NextResponse.json({ success: true, ...res });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Sync failed' }, { status: 500 });
  }
}
