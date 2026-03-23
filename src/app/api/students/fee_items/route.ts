import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  try {
    const { term_id = 1 } = await req.json(); // Default term_id to 1 if not provided

    if (!term_id) {
      return NextResponse.json({ success: false, message: 'Term ID is required.' }, { status: 400 });
    }

    const connection = await getConnection();

    try {
      // Fetch all students who are enrolled in the term
      const [students] = await connection.execute(
        `SELECT s.id AS student_id, e.class_id
         FROM students s
         JOIN enrollments e ON s.id = e.student_id
         WHERE e.term_id = ? AND e.status = 'active'`,
        [term_id]
      );

      // Fetch fee structure items for the term
      const [feeItems] = await connection.execute(
        `SELECT class_id, item, amount
         FROM fee_structures
         WHERE term_id = ?`,
        [term_id]
      );

      if (!students.length || !feeItems.length) {
        return NextResponse.json({
          success: false,
          message: 'No students or fee items found for the specified term.',
        });
      }

      // Insert missing student fee items
      for (const student of students) {
        for (const feeItem of feeItems) {
          if (student.class_id === feeItem.class_id) {
            await connection.execute(
              `INSERT INTO student_fee_items (student_id, term_id, item, amount)
               VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
              [student.student_id, term_id, feeItem.item, feeItem.amount]
            );
          }
        }
      }

      return NextResponse.json({ success: true, message: 'Missing student fee items added successfully.' });
    } catch (error) {
      console.error('Error adding fee items:', error);
      return NextResponse.json({ success: false, message: 'Failed to add fee items.', error: error.message }, { status: 500 });
    } finally {
      await connection.end();
    }
  } catch (error: any) {
    console.error('Error processing request:', error);
    return NextResponse.json({ success: false, message: 'Invalid request.', error: error.message }, { status: 400 });
  }
}