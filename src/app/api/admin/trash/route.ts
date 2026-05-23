import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, withErrorHandling } from '@/lib/rbac';
import { listTrash, TrashError } from '@/lib/trash/service';
import { listEntityDescriptors } from '@/lib/trash/registry';

/**
 * GET /api/admin/trash — list archived items, paginated, optionally
 * scoped to one entity type or filtered by free-text search.
 *
 *   ?entity=<code>   optional — restrict to one entity type
 *   ?search=<term>   optional — substring match across the entity's
 *                    `searchPredicate` (e.g. name, admission no)
 *   ?page=N          default 1
 *   ?limit=N         default 50, max 200
 *
 * Also returns the entity catalog so the UI can build its tab strip
 * without an additional fetch.
 */
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await requirePermission(session.userId, session.schoolId, 'trash.read', session.isSuperAdmin);

  const sp = req.nextUrl.searchParams;
  const entity = sp.get('entity') ?? undefined;
  const search = sp.get('search') ?? undefined;
  const page   = sp.get('page')   ? Number(sp.get('page'))   : undefined;
  const limit  = sp.get('limit')  ? Number(sp.get('limit'))  : undefined;

  try {
    const result = await listTrash({
      schoolId: session.schoolId,
      entity,
      search,
      page,
      limit,
    });
    const catalog = listEntityDescriptors().map(d => ({
      code:        d.code,
      label:       d.label,
      pluralLabel: d.pluralLabel,
    }));
    return NextResponse.json({ success: true, catalog, ...result });
  } catch (e: unknown) {
    if (e instanceof TrashError) {
      return NextResponse.json(
        { error: e.message, code: e.code, ...(e.detail ? { detail: e.detail } : {}) },
        { status: e.statusCode },
      );
    }
    throw e;
  }
});
