/**
 * Per-student custom field values — read + bulk upsert.
 *
 * GET  /api/students/:id/custom-values
 *   → { success, values: Record<code, value>, fields: CustomFieldDef[] }
 *
 * PUT  /api/students/:id/custom-values
 *   body: { values: Record<code, value> }
 *   → { success, written, cleared, skipped: string[] }
 *
 * Unknown / inactive codes in PUT are reported in `skipped` but do not fail
 * the request, so partial UI submissions don't 400 on field drift.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import {
  listFields, getStudentCustomValues, setStudentCustomValues,
  type CustomFieldValue,
} from '@/lib/custom-fields';

async function resolveStudent(studentId: number, schoolId: number): Promise<boolean> {
  const rows = (await query(
    `SELECT 1 FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
    [studentId, schoolId],
  )) as Array<{ '1': number }>;
  return rows.length > 0;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const studentId = Number(id);
  if (!Number.isFinite(studentId) || studentId <= 0) {
    return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });
  }
  try {
    await requirePermission(session.userId, session.schoolId, 'students.read', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  if (!(await resolveStudent(studentId, session.schoolId))) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  const [fields, values] = await Promise.all([
    listFields({ schoolId: session.schoolId, entityType: 'student', activeOnly: true }),
    getStudentCustomValues(studentId, session.schoolId),
  ]);
  return NextResponse.json({ success: true, fields, values });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const studentId = Number(id);
  if (!Number.isFinite(studentId) || studentId <= 0) {
    return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });
  }
  try {
    await requirePermission(session.userId, session.schoolId, 'students.update', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  if (!(await resolveStudent(studentId, session.schoolId))) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as { values?: Record<string, CustomFieldValue> } | null;
  if (!body?.values || typeof body.values !== 'object') {
    return NextResponse.json({ error: 'body.values map required' }, { status: 400 });
  }

  try {
    const result = await setStudentCustomValues({
      studentId,
      schoolId:  session.schoolId,
      updatedBy: session.userId ?? null,
      values:    body.values,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
