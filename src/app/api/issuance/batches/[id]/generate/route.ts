/**
 * POST /api/issuance/batches/:id/generate — render eligible items through DRCE.
 * Permission: issuance.create.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { generateBatch } from '@/lib/issuance/engine';
import { checkModule } from '@/lib/auth/requireModule';

// Long pipeline — increase the maxDuration if your platform supports it.
export const maxDuration = 60;

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
    const counts = await generateBatch({ batchId, schoolId: session.schoolId, userId: session.userId ?? null });
    return NextResponse.json({ success: true, counts });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
