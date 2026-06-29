import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { langFromRequest, pickName } from '@/lib/i18n/localize';

/**
 * Programs API — clear, school-configurable enrollment programs.
 * GET    /api/programs[?include_archived=1]  — list (default first, then active)
 * POST   /api/programs                       — create
 * PATCH  /api/programs                       — { id, display_name?, curriculum_body?, eligibility?, is_default?, is_active? }
 * DELETE /api/programs?id=                   — archive (soft delete)
 */
export async function GET(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const includeArchived = req.nextUrl.searchParams.get('include_archived') === '1';

    const [rows]: any = await conn.execute(
      `SELECT id, school_id, name, name_ar,
              COALESCE(NULLIF(display_name, ''), name) AS display_name,
              code, curriculum_body, eligibility, is_default, is_active, description, created_at
         FROM programs
        WHERE school_id = ? ${includeArchived ? '' : 'AND is_active = 1'}
        ORDER BY is_default DESC, is_active DESC, display_name ASC`,
      [session.schoolId],
    );
    // Arabic display: prefer name_ar, else the English display_name. English
    // mode is unchanged (name_ar simply ignored), so existing consumers are safe.
    const lang = langFromRequest(req);
    const data = (rows as Record<string, unknown>[]).map(r => ({
      ...r,
      display_name: pickName(lang, r.display_name as string, r.name_ar as string | null),
    }));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching programs:', error);
    return NextResponse.json({ error: 'Failed to fetch programs' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

export async function POST(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;
    const b = await req.json();
    const displayName = (b.display_name ?? b.name ?? '').toString().trim();
    if (!displayName) return NextResponse.json({ error: 'display_name is required' }, { status: 400 });

    if (b.is_default) await conn.execute(`UPDATE programs SET is_default = 0 WHERE school_id = ?`, [schoolId]);

    const [result]: any = await conn.execute(
      `INSERT INTO programs (school_id, name, display_name, code, curriculum_body, eligibility, is_default, description, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [schoolId,
       (b.code || displayName).toString().trim(),   // legacy `name` keeps a stable value
       displayName,
       (b.code ?? '').toString().trim() || null,
       (b.curriculum_body ?? '').toString().trim() || null,
       (b.eligibility ?? 'all_learners').toString().trim(),
       b.is_default ? 1 : 0,
       (b.description ?? '').toString().trim() || null],
    );
    return NextResponse.json({ success: true, data: { id: result.insertId } }, { status: 201 });
  } catch (error) {
    console.error('Error creating program:', error);
    return NextResponse.json({ error: 'Failed to create program' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

export async function PATCH(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;
    const b = await req.json();
    const id = Number(b.id);
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    if (b.is_default === true) await conn.execute(`UPDATE programs SET is_default = 0 WHERE school_id = ?`, [schoolId]);

    const sets: string[] = []; const params: any[] = [];
    for (const [k, col] of Object.entries({ display_name: 'display_name', curriculum_body: 'curriculum_body', eligibility: 'eligibility', code: 'code' })) {
      if (b[k] !== undefined) { sets.push(`${col} = ?`); params.push(b[k] === '' ? null : b[k]); }
    }
    if (b.is_default !== undefined) { sets.push('is_default = ?'); params.push(b.is_default ? 1 : 0); }
    if (b.is_active !== undefined) { sets.push('is_active = ?'); params.push(b.is_active ? 1 : 0); } // archive/restore
    if (!sets.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    params.push(id, schoolId);
    await conn.execute(`UPDATE programs SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`, params);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating program:', error);
    return NextResponse.json({ error: 'Failed to update program' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

export async function DELETE(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const id = req.nextUrl.searchParams.get('id');
    if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: 'Valid id is required' }, { status: 400 });
    // Soft delete = archive (keeps historical enrollment references intact).
    await conn.execute(`UPDATE programs SET is_active = 0 WHERE id = ? AND school_id = ?`, [id, session.schoolId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error archiving program:', error);
    return NextResponse.json({ error: 'Failed to archive program' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
