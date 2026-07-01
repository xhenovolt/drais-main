/**
 * GET   /api/passouts/devices  — list devices with their gate flag.
 * PATCH /api/passouts/devices  — { sn, passout_enabled } toggle a gate device.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'passouts.gate.verify', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  const rows = await query(
    `SELECT sn, device_name, device_type, is_online, passout_enabled
       FROM devices WHERE school_id = ? AND deleted_at IS NULL ORDER BY device_name, sn`,
    [session.schoolId],
  );
  return NextResponse.json({ success: true, rows });
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'passouts.slip.approve', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  const b = await req.json().catch(() => ({}));
  if (!b?.sn) return NextResponse.json({ error: 'sn is required' }, { status: 400 });
  await query(
    `UPDATE devices SET passout_enabled = ? WHERE sn = ? AND school_id = ?`,
    [b.passout_enabled ? 1 : 0, b.sn, session.schoolId],
  );
  return NextResponse.json({ success: true });
}
