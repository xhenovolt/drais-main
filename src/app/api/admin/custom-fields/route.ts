/**
 * Custom field definitions — list + create.
 *
 * GET  /api/admin/custom-fields        → list (defaults to active student fields)
 * POST /api/admin/custom-fields        → create a field
 *
 * Authorization: school session required; create requires
 * `custom_fields.manage` permission (super-admin bypasses).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import {
  listFields, createField, type CustomFieldEntity, type FieldInput,
} from '@/lib/custom-fields';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const entityType = (sp.get('entity_type') as CustomFieldEntity | null) ?? 'student';
  const activeOnly = sp.get('active_only') !== '0';
  if (entityType !== 'student' && entityType !== 'staff') {
    return NextResponse.json({ error: 'entity_type must be student or staff' }, { status: 400 });
  }

  const fields = await listFields({ schoolId: session.schoolId, entityType, activeOnly });
  return NextResponse.json({ success: true, fields });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'custom_fields.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as FieldInput | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  try {
    const id = await createField({
      schoolId:  session.schoolId,
      createdBy: session.userId ?? null,
      input:     body,
    });
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message ?? 'Failed to create field';
    const status = (e as { code?: string }).code === 'ER_DUP_ENTRY' ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
