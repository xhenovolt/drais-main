import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Curriculums API — PER-SCHOOL from this commit.
 *
 * WHAT WAS WRONG
 * `curriculums` had no school_id: one global table holding a single seed row,
 * {id:1, code:'ESU', name:'Etude Superieur Universitaire'}. Every school's
 * enrolment picker therefore offered a French university curriculum, and 880
 * enrolments plus 31 classes across six schools now point at it. A further 696
 * enrolments and 10 classes reference curriculum_id = 2, which does not exist
 * at all.
 *
 * Meanwhile `programs` — which DOES have school_id — already holds what each
 * school actually uses: UNEB, National curriculum, Secular, Theology, PRIMAIRE.
 * The per-school concept was built; this table was the older global one left
 * beside it.
 *
 * WHAT CHANGED
 * school_id added (nullable, additive) and every read scoped to the session.
 * The legacy row keeps school_id NULL, so no school is offered it again, while
 * existing enrolments that reference it still resolve for display — their
 * history is not rewritten. New curriculums belong to the school that creates
 * them.
 */

/** Additive, nullable — mirrors ensureImpersonationColumn in src/lib/auth.ts. */
let _col: Promise<void> | null = null;
function ensureCurriculumSchoolColumn(): Promise<void> {
  if (_col) return _col;
  _col = (async () => {
    try { await query(`ALTER TABLE curriculums ADD COLUMN school_id BIGINT NULL`, []); }
    catch { /* already exists */ }
  })();
  return _col;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    await ensureCurriculumSchoolColumn();
    // Scoped: the legacy global row (school_id NULL) is deliberately excluded,
    // so "Etude Superieur Universitaire" can never be picked again.
    const rows = await query(
      'SELECT id, code, name FROM curriculums WHERE school_id = ? AND deleted_at IS NULL ORDER BY name',
      [session.schoolId],
    );
    return NextResponse.json({ data: rows });
  } catch (error: any) {
    console.error('Curriculum GET error:', error);
    return NextResponse.json({ error: 'Failed to load curriculums' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const code = (body.code ?? '').toString().trim();
    const name = (body.name ?? '').toString().trim();
    if (!code || !name) return NextResponse.json({ error: 'code & name required' }, { status: 400 });

    await ensureCurriculumSchoolColumn();
    await query('INSERT INTO curriculums (code, name, school_id) VALUES (?, ?, ?)',
      [code, name, session.schoolId]);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'Curriculum with that code already exists' }, { status: 409 });
    }
    console.error('Curriculum POST error:', error);
    return NextResponse.json({ error: 'Failed to create curriculum' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const id = Number(body.id);
    const code = (body.code ?? '').toString().trim();
    const name = (body.name ?? '').toString().trim();
    if (!id || !code || !name) return NextResponse.json({ error: 'id, code & name required' }, { status: 400 });

    await query('UPDATE curriculums SET code = ?, name = ? WHERE id = ?', [code, name, id]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Curriculum PUT error:', error);
    return NextResponse.json({ error: 'Failed to update curriculum' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const id = Number(body.id);
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await ensureCurriculumSchoolColumn();
    // Tenant-scoped: a school can only ever delete its own.
    await query('DELETE FROM curriculums WHERE id = ? AND school_id = ?', [id, session.schoolId]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Curriculum DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete curriculum' }, { status: 500 });
  }
}
