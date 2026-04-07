import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

// GET /api/finance/reports?type=debtors|summary|class-breakdown
//
// type=debtors     → top students by outstanding balance
// type=summary     → school-wide totals
// type=class-breakdown → per-class collection summary

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type    = searchParams.get('type') || 'debtors';
  const limit   = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
  const classId = searchParams.get('class_id');
  const termId  = searchParams.get('term_id');

  const conn = await getConnection();
  try {
    if (type === 'debtors') {
      // Top students with highest outstanding balance
      let sql = `
        SELECT
          sl.student_id,
          CONCAT(p.first_name, ' ', p.last_name)    AS student_name,
          s.admission_no,
          c.name                                     AS class_name,
          SUM(CASE WHEN sl.type = 'debit'  THEN sl.amount ELSE 0 END) AS total_charged,
          SUM(CASE WHEN sl.type = 'credit' THEN sl.amount ELSE 0 END) AS total_paid,
          SUM(CASE WHEN sl.type = 'debit'  THEN sl.amount ELSE 0 END)
            - SUM(CASE WHEN sl.type = 'credit' THEN sl.amount ELSE 0 END) AS balance
        FROM student_ledger sl
        JOIN students s ON sl.student_id = s.id
        JOIN people p   ON s.person_id = p.id
        LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
        LEFT JOIN classes c     ON e.class_id = c.id
        WHERE sl.school_id = ?
      `;
      const params: any[] = [session.schoolId];
      if (classId) { sql += ' AND e.class_id = ?'; params.push(+classId); }
      if (termId)  { sql += ' AND sl.term_id = ?'; params.push(+termId); }

      sql += `
        GROUP BY sl.student_id, student_name, s.admission_no, class_name
        HAVING balance > 0
        ORDER BY balance DESC
        LIMIT ?
      `;
      params.push(limit);

      const [rows] = await conn.execute(sql, params);
      return NextResponse.json({ type: 'debtors', rows });
    }

    if (type === 'summary') {
      const [rows]: any[] = await conn.execute(
        `SELECT
           SUM(CASE WHEN type = 'debit'  THEN amount ELSE 0 END) AS total_charged,
           SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END) AS total_paid,
           SUM(CASE WHEN type = 'debit'  THEN amount ELSE 0 END)
             - SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END) AS total_outstanding,
           COUNT(DISTINCT student_id) AS students_with_entries
         FROM student_ledger
         WHERE school_id = ?`,
        [session.schoolId]
      );
      const r = rows[0] as any;
      return NextResponse.json({
        type: 'summary',
        summary: {
          total_charged:      Number(r.total_charged)      || 0,
          total_paid:         Number(r.total_paid)         || 0,
          balance:            Number(r.total_outstanding)  || 0,
          students_with_entries: Number(r.students_with_entries) || 0,
        },
      });
    }

    if (type === 'class-breakdown') {
      const [rows] = await conn.execute(
        `SELECT
           c.id AS class_id,
           c.name AS class_name,
           COUNT(DISTINCT sl.student_id)  AS student_count,
           SUM(CASE WHEN sl.type = 'debit'  THEN sl.amount ELSE 0 END) AS total_charged,
           SUM(CASE WHEN sl.type = 'credit' THEN sl.amount ELSE 0 END) AS total_paid,
           SUM(CASE WHEN sl.type = 'debit'  THEN sl.amount ELSE 0 END)
             - SUM(CASE WHEN sl.type = 'credit' THEN sl.amount ELSE 0 END) AS outstanding
         FROM student_ledger sl
         JOIN enrollments e ON sl.student_id = e.student_id AND e.status = 'active'
         JOIN classes c     ON e.class_id = c.id
         WHERE sl.school_id = ?
         GROUP BY c.id, c.name
         ORDER BY outstanding DESC`,
        [session.schoolId]
      );
      return NextResponse.json({ type: 'class-breakdown', rows });
    }

    return NextResponse.json({ error: 'Unknown report type' }, { status: 400 });
  } finally {
    await conn.end();
  }
}
