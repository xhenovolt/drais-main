/**
 * GET   /api/finance/clearance?term_id=&class_id=  — entry-clearance per learner.
 * POST  /api/finance/clearance                     — request a bursar exception.
 * PATCH /api/finance/clearance                      — approve/reject an exception.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getCurrentTerm } from '@/lib/terms';
import {
  loadClearance, requestClearanceException, setClearanceExceptionStatus,
  type ClearanceStatus,
} from '@/lib/finance/feeRules';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const sp = req.nextUrl.searchParams;
    let termId = sp.get('term_id') ? Number(sp.get('term_id')) : null;
    if (!termId) { const t = await getCurrentTerm(session.schoolId); termId = t ? Number((t as any).id) : null; }
    if (!termId) return NextResponse.json({ error: 'No current term' }, { status: 400 });
    const classId = sp.get('class_id') ? Number(sp.get('class_id')) : null;

    const rows = await loadClearance(session.schoolId, termId, classId);
    const summary: Record<ClearanceStatus, number> = {
      cleared: 0, partially_cleared: 0, not_cleared: 0, blocked: 0, exception_requested: 0, exception_approved: 0,
    };
    for (const r of rows) summary[r.status] = (summary[r.status] || 0) + 1;
    return NextResponse.json({ success: true, term_id: termId, count: rows.length, summary, rows });
  } catch (e: any) {
    console.error('[finance/clearance GET]', e);
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.student_id) return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
  try {
    const id = await requestClearanceException(session.schoolId, b, session.userId);
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b?.id || !['approved', 'rejected', 'blocked'].includes(b.status)) {
    return NextResponse.json({ error: 'id and a valid status are required' }, { status: 400 });
  }
  try {
    await setClearanceExceptionStatus(session.schoolId, Number(b.id), b.status, session.userId);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
