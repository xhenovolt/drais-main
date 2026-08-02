/**
 * GET /api/control-center/backup/history — all schools' backup history,
 * super-admin only. ?school_id= narrows to one school.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, canManage } from '@/lib/control/auth';
import { listBackups } from '@/lib/backup/orchestrator';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: 'Super admin role required' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const schoolIdParam = searchParams.get('school_id');
  const schoolId = schoolIdParam && /^\d+$/.test(schoolIdParam) ? Number(schoolIdParam) : null;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

  const { records, total } = await listBackups(schoolId, { page, limit });
  return NextResponse.json({ success: true, records, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
}
