/**
 * GET  /api/finance/fee-rules/adjustments?student_id= — learner fee adjustments.
 * POST /api/finance/fee-rules/adjustments — create (pending) an adjustment.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { listAdjustments, createAdjustment } from '@/lib/finance/feeRules';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
  const studentId = Number(new URL(req.url).searchParams.get('student_id')) || undefined;
  return NextResponse.json({ success: true, adjustments: await listAdjustments(session.schoolId, studentId) });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }
  const b = await req.json().catch(() => null);
  if (!b?.student_id || !b?.adjustment_type) return NextResponse.json({ error: 'student_id and adjustment_type are required' }, { status: 400 });
  if (!['waiver', 'percent_discount', 'fixed_discount', 'override'].includes(b.adjustment_type)) {
    return NextResponse.json({ error: 'invalid adjustment_type' }, { status: 400 });
  }
  try {
    const id = await createAdjustment(session.schoolId, b, session.userId);
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e: any) { return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 }); }
}
