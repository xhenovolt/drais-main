import { NextRequest, NextResponse } from 'next/server';
import { query, withTransaction } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    // Step 1: Get active students without fee items
    const missingStudents = await query(`
      SELECT DISTINCT 
        s.id as student_id,
        s.school_id,
        e.class_id,
        e.term_id
      FROM students s
      JOIN enrollments e ON s.id = e.student_id 
      LEFT JOIN student_fee_items f ON s.id = f.student_id AND e.term_id = f.term_id
      WHERE s.school_id = ? 
      AND s.status = 'active'
      AND e.status = 'active'
      AND f.id IS NULL
    `, [schoolId]);

    // Step 2: Get or create fee structures
    await withTransaction(async (conn) => {
      for (const student of missingStudents) {
        // Get fee structure for student's class
        const structures = await conn.query(`
          SELECT item, amount 
          FROM fee_structures 
          WHERE school_id = ? AND class_id = ? AND term_id = ?
        `, [schoolId, student.class_id, student.term_id]);

        // If no structure exists, create default structure
        if (!structures.length) {
          await conn.query(`
            INSERT INTO fee_structures (school_id, class_id, term_id, item, amount)
            VALUES 
              (?, ?, ?, 'Tuition', 500000),
              (?, ?, ?, 'Development', 100000),
              (?, ?, ?, 'Registration', 50000)
          `, [
            schoolId, student.class_id, student.term_id,
            schoolId, student.class_id, student.term_id,
            schoolId, student.class_id, student.term_id
          ]);
        }

        // Create fee items for student
        const feesToInsert = structures.length ? structures : [
          { item: 'Tuition', amount: 500000 },
          { item: 'Development', amount: 100000 },
          { item: 'Registration', amount: 50000 }
        ];

        for (const fee of feesToInsert) {
          await conn.query(`
            INSERT INTO student_fee_items 
              (student_id, term_id, item, amount, discount, paid)
            VALUES (?, ?, ?, ?, 0, 0)
            ON DUPLICATE KEY UPDATE 
              amount = VALUES(amount)
          `, [student.student_id, student.term_id, fee.item, fee.amount]);
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `Synchronized fees for ${missingStudents.length} students`
    });

  } catch (error: any) {
    console.error('Fee sync error:', error);
    return NextResponse.json({ 
      error: 'Failed to synchronize fees',
      details: error.message 
    }, { status: 500 });
  }
}
