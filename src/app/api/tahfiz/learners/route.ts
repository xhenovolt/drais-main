import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (id) {
    const rows: any = await query('SELECT s.*, p.first_name, p.last_name, p.phone, p.email FROM students s JOIN people p ON s.person_id = p.id WHERE s.id = ?', [id]);
    return NextResponse.json(rows[0] || null);
  }
  // Simple filter: students enrolled in classes with name like '%Tahfiz%'
  const rows: any = await query(`SELECT s.*, p.first_name, p.last_name, p.email, e.class_id
    FROM students s
    JOIN people p ON s.person_id = p.id
    LEFT JOIN enrollments e ON s.id = e.student_id
    LEFT JOIN classes c ON e.class_id = c.id
    WHERE c.name LIKE '%Tahfiz%' OR s.notes LIKE '%tahfiz%' ORDER BY p.last_name`);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

  const { person, admission_no, village_id, admission_date, status } = await req.json();
  // create person then student (minimal)
  const resP: any = await query('INSERT INTO people (school_id, first_name, last_name, phone, email) VALUES (?,?,?,?,?)', [schoolId, person.first_name, person.last_name, person.phone || null, person.email || null]);
  const personId = resP.insertId;
  const resS: any = await query('INSERT INTO students (school_id, person_id, admission_no, village_id, admission_date, status) VALUES (?,?,?,?,?,?)', [schoolId, personId, admission_no || null, village_id || null, admission_date || null, status || 'active']);
  return NextResponse.json({ id: resS.insertId });
}

export async function PATCH(req: NextRequest) {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

  const body = await req.json();
  const { id, person_updates, student_updates } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (person_updates) {
    const fields = Object.keys(person_updates).map(k => `${k} = ?`).join(', ');
    if (fields) {
      const params = [...Object.values(person_updates), student_updates?.person_id || null];
      // find person_id
      const rows: any = await query('SELECT person_id FROM students WHERE id = ?', [id]);
      const personId = rows[0]?.person_id;
      if (personId) {
        await query(`UPDATE people SET ${fields} WHERE id = ?`, [...Object.values(person_updates), personId]);
      }
    }
  }
  if (student_updates) {
    const fields = Object.keys(student_updates).map(k => `${k} = ?`).join(', ');
    if (fields) {
      await query(`UPDATE students SET ${fields} WHERE id = ?`, [...Object.values(student_updates), id]);
    }
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await query('DELETE FROM students WHERE id = ? AND school_id = ?', [id, schoolId]);
  return NextResponse.json({ success: true, message: 'Learner deleted' });
}
