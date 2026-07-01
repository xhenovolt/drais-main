/** GET /api/passouts/reports?type=out_today|overdue|by_reason|by_officer|denied|visitation|unknown_cards */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { passoutReport, type ReportType } from '@/lib/passouts/store';

export const runtime = 'nodejs';

const TYPES: ReportType[] = ['out_today', 'overdue', 'by_reason', 'by_officer', 'denied', 'visitation', 'unknown_cards'];

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'passouts.reports.view', session.isSuperAdmin); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
  const type = req.nextUrl.searchParams.get('type') as ReportType;
  if (!TYPES.includes(type)) return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
  try {
    return NextResponse.json({ success: true, type, ...(await passoutReport(session.schoolId, type)) });
  } catch (e: any) {
    console.error('[passouts/reports]', e);
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
