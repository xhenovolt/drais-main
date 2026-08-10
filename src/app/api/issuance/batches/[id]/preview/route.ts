/**
 * POST /api/issuance/batches/:id/preview — resolve candidates + run eligibility.
 * Permission: issuance.create.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { previewBatch } from '@/lib/issuance/engine';
import { checkModule } from '@/lib/auth/requireModule';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'inventory');
  if (modDenied) return modDenied;
  try {
    await requirePermission(session.userId, session.schoolId, 'issuance.create', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { id } = await ctx.params;
  const batchId = Number(id);
  if (!Number.isFinite(batchId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  try {
    const counts = await previewBatch(batchId, session.schoolId);
    return NextResponse.json({ success: true, counts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
