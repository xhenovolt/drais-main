export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * PATCH /api/students/[id]/arabic-name — set one learner's Arabic name parts.
 * Additive: only the fields provided are written; English names are untouched.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await ctx.params;
  const studentId = Number(id);
  if (!Number.isFinite(studentId)) return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const allowed = ['first_name_ar', 'last_name_ar', 'other_name_ar', 'full_name_ar'] as const;
  const sets: string[] = [];
  const vals: (string | null)[] = [];
  for (const f of allowed) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`);
      const v = String(body[f] ?? '').trim();
      vals.push(v === '' ? null : v);
    }
  }
  if (!sets.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const conn = await getConnection();
  try {
    // Resolve the student's person within this school (tenant guard).
    const [rows]: any = await conn.execute(
      `SELECT person_id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
      [studentId, session.schoolId],
    );
    if (!rows.length) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    await conn.execute(
      `UPDATE people SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`,
      [...vals, rows[0].person_id, session.schoolId],
    );
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[arabic-name PATCH]', e);
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
