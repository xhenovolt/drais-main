import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const reportCardId = resolvedParams.id;
  const schoolId = req.headers.get('x-school-id'); // Or get from session/auth

  try {
    const conn = await getConnection();
    try {
      // Optimized query
      const [rows]: any = await conn.execute(
        `SELECT
          rc.id AS report_card_id,
          rc.student_id,
          rc.term_id,
          rc.overall_grade,
          rc.class_teacher_comment,
          rc.headteacher_comment,
          rc.dos_comment,
          s.admission_no,
          s.school_id,
          p.first_name,
          p.last_name,
          p.gender,
          p.photo_url,
          t.name AS term_name
        FROM report_cards rc
        JOIN students s ON rc.student_id = s.id
        JOIN people p ON s.person_id = p.id
        JOIN terms t ON rc.term_id = t.id
        WHERE rc.id = ?
          AND s.school_id = ?
        LIMIT 1`,
        [reportCardId, schoolId]
      );

      const row = rows[0];
      if (!row) {
        return NextResponse.json({ error: 'Report card not found' }, { status: 404 });
      }

      // Fallback photo
      const photoUrl = row.photo_url || '/logo.png';

      return NextResponse.json({
        ...row,
        photo_url: photoUrl,
      });
    } finally {
      await conn.end();
    }
  } catch (error) {
    console.error('Error fetching report card:', error);
    return NextResponse.json({ error: 'Failed to fetch report card' }, { status: 500 });
  }
}
