import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, withErrorHandling } from '@/lib/rbac';
import { getDependencies, TrashError } from '@/lib/trash/service';
import { isEntityCode } from '@/lib/trash/registry';

/**
 * POST /api/admin/trash/dependencies
 * Body: { entity: string, id: number }
 *
 * Preview which other tables reference this entity. Drives the purge
 * confirmation modal so admins see the blast radius before they delete.
 */
export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  await requirePermission(session.userId, session.schoolId, 'trash.read', session.isSuperAdmin);

  let body: { entity?: unknown; id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const entity = typeof body.entity === 'string' ? body.entity : '';
  const id     = Number(body.id);
  if (!isEntityCode(entity)) {
    return NextResponse.json({ error: 'Invalid entity code' }, { status: 400 });
  }
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const dependencies = await getDependencies({
      schoolId: session.schoolId,
      entity, id,
    });
    return NextResponse.json({ success: true, dependencies });
  } catch (e: unknown) {
    if (e instanceof TrashError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.statusCode },
      );
    }
    throw e;
  }
});
