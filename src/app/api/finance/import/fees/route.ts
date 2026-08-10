/**
 * POST /api/finance/import/fees — import per-learner fees (upsert).
 * Body: { rows: [{ admission_no, item, amount }], term_id?, commit? }
 * Preview (commit:false) returns the action plan; commit:true applies it.
 * Existing (learner, term, item) fees are UPDATED, never duplicated.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getCurrentTerm } from '@/lib/terms';
import { runFeeImport } from '@/lib/finance/feeImport';
import { checkModule } from '@/lib/auth/requireModule';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;
  try {
    await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!Array.isArray(body?.rows) || !body.rows.length) {
    return NextResponse.json({ error: 'rows[] is required' }, { status: 400 });
  }

  let termId = body.term_id ? Number(body.term_id) : null;
  if (!termId) { const t = await getCurrentTerm(session.schoolId); termId = t ? Number((t as any).id) : null; }
  if (!termId) return NextResponse.json({ error: 'No current term' }, { status: 400 });

  try {
    const result = await runFeeImport(session.schoolId, body.rows, termId, { commit: !!body.commit }, session.userId);
    return NextResponse.json({ success: true, term_id: termId, ...result });
  } catch (e: any) {
    console.error('[finance/import/fees]', e);
    return NextResponse.json({ error: e.message || 'Import failed' }, { status: 500 });
  }
}
