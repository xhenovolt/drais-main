import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Curriculums API — shared reference table (UNEB, Cambridge, etc.)
 * All operations require authentication.
 */

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const rows = await query('SELECT id, code, name FROM curriculums ORDER BY id');
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

    await query('INSERT INTO curriculums (code, name) VALUES (?, ?)', [code, name]);
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

    await query('DELETE FROM curriculums WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Curriculum DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete curriculum' }, { status: 500 });
  }
}
