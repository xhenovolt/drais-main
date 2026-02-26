import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { class_id, subject_id, result_type_id, term_id, entries } = body;
    class_id = class_id ?? 1;
    subject_id = subject_id ?? 1;
    result_type_id = result_type_id ?? 1;
    if (!entries) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    const connection = await getConnection();
    let success = 0;
    const ignored = [];

    for (const entry of entries) {
      const { student_id } = entry;
      const score = entry.score !== undefined ? entry.score : null;
      const grade = entry.grade !== undefined ? entry.grade : null;
      const remarks = entry.remarks !== undefined ? entry.remarks : null;

      // Check if a result already exists for the given conditions
      const [existing] = await connection.execute(
        `SELECT COUNT(*) as count FROM class_results WHERE class_id = ? AND subject_id = ? AND result_type_id = ? AND term_id = ? AND student_id = ?`,
        [class_id, subject_id, result_type_id, term_id ?? null, student_id]
      );

      if (existing[0].count > 0) {
        ignored.push({ student_id, reason: 'Results already exist' });
        continue;
      }

      await connection.execute(
        `INSERT INTO class_results (class_id, subject_id, result_type_id, term_id, student_id, score, grade, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE score=VALUES(score), grade=VALUES(grade), remarks=VALUES(remarks)`,
        [class_id, subject_id, result_type_id, term_id ?? null, student_id, score, grade, remarks]
      );
      success++;
    }

    await connection.end();
    return NextResponse.json({ success, ignored, message: 'Results submitted successfully' });
  } catch (error) {
    console.error('Error submitting results:', error);
    return NextResponse.json({ error: 'Failed to submit results' }, { status: 500 });
  }
}
