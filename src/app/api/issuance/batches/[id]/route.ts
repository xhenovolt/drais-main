/**
 * GET /api/issuance/batches/:id  → { batch, items }
 *
 * Permission: issuance.view.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getBatch, getItems } from '@/lib/issuance/engine';
import { checkModule } from '@/lib/auth/requireModule';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'inventory');
  if (modDenied) return modDenied;
  try {
    await requirePermission(session.userId, session.schoolId, 'issuance.view', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const { id } = await ctx.params;
  const batchId = Number(id);
  if (!Number.isFinite(batchId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const batch = await getBatch(batchId, session.schoolId);
  if (!batch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const items = await getItems(batchId);
  return NextResponse.json({ success: true, batch, items });
}
