import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, withErrorHandling } from '@/lib/rbac';
import {
  purgeEntity,
  getPermissionForAction,
  TrashError,
} from '@/lib/trash/service';
import { isEntityCode } from '@/lib/trash/registry';

/**
 * POST /api/admin/trash/purge
 * Body: { entity: string, id: number, confirmation: true }
 *
 * Permanently deletes the row. Requires super-admin OR the entity's
 * purge permission. Blocking dependencies must be cleared first;
 * the service rejects with 409 DEPENDENCIES_PRESENT otherwise.
 */
export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { entity?: unknown; id?: unknown; confirmation?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const entity       = typeof body.entity === 'string' ? body.entity : '';
  const id           = Number(body.id);
  const confirmation = body.confirmation === true;
  if (!isEntityCode(entity)) {
    return NextResponse.json({ error: 'Invalid entity code' }, { status: 400 });
  }
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  await requirePermission(
    session.userId, session.schoolId,
    getPermissionForAction(entity, 'purge'),
    session.isSuperAdmin,
  );

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? null;
  const userAgent = req.headers.get('user-agent') ?? null;

  try {
    const result = await purgeEntity({
      entity, id, confirmation,
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
