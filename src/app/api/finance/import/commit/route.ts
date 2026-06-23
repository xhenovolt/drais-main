/**
 * POST /api/finance/import/commit
 * Post the previewed batch's `import` rows through the canonical payment/ledger
 * path. Idempotent: already-committed rows are skipped.
 * Body: { batchId }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { commitBatch } from '@/lib/finance/import';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  const batchId = Number(body?.batchId);
  if (!batchId) return NextResponse.json({ error: 'batchId is required' }, { status: 400 });

  try {
    const result = await commitBatch(session.schoolId, batchId, session.userId);
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    console.error('[finance/import/commit]', e);
    return NextResponse.json({ error: e.message || 'Commit failed' }, { status: 400 });
  }
}
