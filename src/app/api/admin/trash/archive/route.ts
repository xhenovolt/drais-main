import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import {
  archiveEntity,
  getPermissionForAction,
  TrashError,
} from '@/lib/trash/service';
import { isEntityCode } from '@/lib/trash/registry';

/**
 * POST /api/admin/trash/archive
 * Body: { entity: string, id: number, reason?: string }
 *
 * Soft-deletes the row. Re-archiving an already-archived row returns
 * 409 ALREADY_ARCHIVED. Audit log entry is always written on success.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { entity?: unknown; id?: unknown; reason?: unknown };
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
  const reason = typeof body.reason === 'string' && body.reason.length > 0 ? body.reason : null;

  await requirePermission(
    session.userId, session.schoolId,
    getPermissionForAction(entity, 'archive'),
    session.isSuperAdmin,
  );

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    null;
  const userAgent = req.headers.get('user-agent') ?? null;

  try {
    const result = await archiveEntity({
      entity, id, reason,
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
}
