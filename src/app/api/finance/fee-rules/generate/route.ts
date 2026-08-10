/**
 * POST /api/finance/fee-rules/generate — bulk-generate bills from rules.
 * Body: { term_id, class_id?, commit? }. Without commit → preview (counts/totals);
 * with commit → snapshots applicable lines into student_fee_items (idempotent).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { generateBills } from '@/lib/finance/feeRules';
import { checkModule } from '@/lib/auth/requireModule';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;
  const commit = !!(await req.clone().json().catch(() => ({})))?.commit;
  try {
    await requirePermission(session.userId, session.schoolId, commit ? 'finance.fees.manage' : 'finance.view', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const b = await req.json().catch(() => ({}));
  const termId = Number(b?.term_id);
  if (!termId) return NextResponse.json({ error: 'term_id is required' }, { status: 400 });
  try {
    const result = await generateBills(session.schoolId, {
      termId,
      classId: b?.class_id ? Number(b.class_id) : null,
      commit: !!b?.commit,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Generation failed' }, { status: 500 });
  }
}
