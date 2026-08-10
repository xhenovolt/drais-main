/**
 * POST /api/finance/sync-fees
 *
 * Finance Consolidation Plan, Stage A: this route used to be an independent,
 * hand-rolled reimplementation of "create missing fee items for students" —
 * hardcoded default amounts (Tuition/Development/Registration) baked
 * directly into inline SQL, targeting class via `enrollments` rather than
 * `students.class_id` (a genuine correctness risk: the two duplicate
 * implementations could disagree about a student's class if those ever
 * diverged). It is now a thin wrapper over the SAME function `init-fees`
 * already calls (`initializeFeesSystem`, src/lib/fees.ts) — one
 * implementation, not two silently-different ones. The route/URL is kept
 * for any existing callers; the behaviour it now performs is identical to
 * POST /api/finance/init-fees.
 */
import { NextRequest, NextResponse } from 'next/server';
import { initializeFeesSystem } from '@/lib/fees';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { checkModule } from '@/lib/auth/requireModule';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const modDenied = await checkModule(session.schoolId, 'finance');
    if (modDenied) return modDenied;
    await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin);

    const result = await initializeFeesSystem(session.schoolId);
    return NextResponse.json({
      success: true,
      message: `Synchronized fees: ${result.newItemsCount} new items created for ${result.studentsCount} students`,
      ...result,
    });
  } catch (error: any) {
    console.error('Fee sync error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to synchronize fees',
    }, { status: 500 });
  }
}
