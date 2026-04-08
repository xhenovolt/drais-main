import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    // Get enhanced connection
    connection = await getConnection();
    await connection.beginTransaction();

    // Get missing fee items
    const [missingStudents] = await connection.execute(`
      SELECT e.student_id, e.term_id, e.class_id, fs.item, fs.amount,
             CONCAT(p.first_name, ' ', p.last_name) as student_name
      FROM enrollments e
      JOIN fee_structures fs ON e.class_id = fs.class_id AND e.term_id = fs.term_id
      JOIN students s ON e.student_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN student_fee_items sfi 
        ON e.student_id = sfi.student_id 
        AND fs.item = sfi.item 
        AND e.term_id = sfi.term_id
      WHERE sfi.id IS NULL AND e.status = 'active'
    `) as any;

    if (!missingStudents.length) {
      return NextResponse.json({ 
        success: true, 
        message: 'No missing fee items found' 
      });
    }

    const insertedItems: any[] = [];
    const auditLogs: any[] = [];

    // Process each missing fee item
    for (const student of missingStudents) {
      try {
        // Insert fee item
        const [result] = await connection.execute(
          `INSERT INTO student_fee_items 
           (student_id, term_id, item, amount, discount, paid) 
           VALUES (?, ?, ?, ?, 0, 0)`,
          [student.student_id, student.term_id, student.item, student.amount]
        ) as any;

        insertedItems.push({
          student_id: student.student_id,
          student_name: student.student_name,
          term_id: student.term_id,
          item: student.item,
          amount: student.amount,
          success: true
        });

        // Prepare audit log
        auditLogs.push({
          actor_user_id: null,
          action: 'fee_item_creation',
          entity_type: 'student_fee_item',
          entity_id: result.insertId,
          changes_json: JSON.stringify({
            student_id: student.student_id,
            term_id: student.term_id,
            item: student.item,
            amount: student.amount
          }),
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null,
          user_agent: req.headers.get('user-agent') || null
        });
      } catch (itemError) {
        console.error(`Error processing fee item for student ${student.student_id}:`, itemError);
        insertedItems.push({
          student_id: student.student_id,
          student_name: student.student_name,
          term_id: student.term_id,
          item: student.item,
          success: false,
          error: 'Failed to create fee item'
        });
      }
    }

    // Insert audit logs
    if (auditLogs.length) {
      const auditValues = auditLogs.map(log => [
        log.actor_user_id,
        log.action,
        log.entity_type,
        log.entity_id,
        log.changes_json,
        log.ip,
        log.user_agent
      ]);
      const auditPlaceholders = auditLogs.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
      await connection.execute(
        `INSERT INTO audit_log 
         (actor_user_id, action, entity_type, entity_id, changes_json, ip, user_agent) 
         VALUES ${auditPlaceholders}`,
        auditValues.flat()
      );
    }

    await connection.commit();

    const successCount = insertedItems.filter(i => i.success).length;
    const failCount = insertedItems.filter(i => !i.success).length;

    return NextResponse.json({
      success: true,
      message: `Fee items processed: ${successCount} successful, ${failCount} failed`,
      results: insertedItems,
      summary: {
        total: insertedItems.length,
        successful: successCount,
        failed: failCount
      }
    });

  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error('Missing fee items error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process missing fee items',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
  }
}
