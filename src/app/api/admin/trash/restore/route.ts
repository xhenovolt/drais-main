import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, withErrorHandling } from '@/lib/rbac';
import {
  restoreEntity,
  getPermissionForAction,
  TrashError,
} from '@/lib/trash/service';
import { isEntityCode } from '@/lib/trash/registry';

/**
 * POST /api/admin/trash/restore
 * Body: { entity: string, id: number }
 *
 * Returns the entity to active state. 409 NOT_ARCHIVED if the row is
 * already active. Audit log entry always written on success.
 */
export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

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

  await requirePermission(
    session.userId, session.schoolId,
    getPermissionForAction(entity, 'restore'),
    session.isSuperAdmin,
  );

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
  const userAgent = req.headers.get('user-agent') ?? null;

  try {
    const result = await restoreEntity({
      entity, id,
      schoolId: session.schoolId,
      userId:   session.userId,
      ip, userAgent,
    });
    return NextResponse.json({ success: true, ...result });
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
