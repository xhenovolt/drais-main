import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../../lib/db';
import { getSessionSchoolId } from '@/lib/auth';

function extractIdFromPath(pathname: string) {
  // pathname example: /api/tahfiz/plans/123
  const parts = pathname.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const url = new URL(req.url);
    const id = extractIdFromPath(url.pathname);
    if (!id) return NextResponse.json({ error: 'Plan id required' }, { status: 400 });

    const rows: any = await query('SELECT p.*, b.title AS book_title, g.name AS group_name FROM tahfiz_plans p LEFT JOIN tahfiz_books b ON p.book_id = b.id LEFT JOIN tahfiz_groups g ON p.group_id = g.id WHERE p.id = ?', [id]);
    if (!rows || (Array.isArray(rows) && rows.length === 0)) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
    const plan = Array.isArray(rows) ? rows[0] : rows;
    return NextResponse.json(plan);
  } catch (error) {
    console.error('Get plan error:', error);
    return NextResponse.json({ error: 'Failed to fetch plan' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const url = new URL(req.url);
    const id = extractIdFromPath(url.pathname);
    if (!id) return NextResponse.json({ error: 'Plan id required' }, { status: 400 });

    const body = await req.json();
    const allowed = ['school_id','teacher_id','class_id','stream_id','assigned_date','portion_text','portion_unit','expected_length','type','notes','book_id','group_id'];
    const entries = Object.entries(body).filter(([k]) => allowed.includes(k));
    if (entries.length === 0) return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });

    const fields = entries.map(([k]) => `${k} = ?`).join(', ');
    const params = entries.map(([, v]) => v);
    params.push(id);

    await query(`UPDATE tahfiz_plans SET ${fields} WHERE id = ?`, params);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update plan error:', error);
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const url = new URL(req.url);
    const id = extractIdFromPath(url.pathname);
    if (!id) return NextResponse.json({ error: 'Plan id required' }, { status: 400 });

    await query('DELETE FROM tahfiz_plans WHERE id = ?', [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete plan error:', error);
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 });
  }
}
