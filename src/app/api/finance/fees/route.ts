import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { FinanceService } from '@/lib/services/FinanceService';

import { getSessionSchoolId } from '@/lib/auth';
export async function GET(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const classId = searchParams.get('class_id');
    const termId = searchParams.get('term_id');
    const studentId = searchParams.get('student_id');

    connection = await getConnection();

    let sql = `
      SELECT 
        sfi.id,
        sfi.student_id,
        sfi.term_id,
        sfi.item,
        sfi.amount,
        sfi.discount,
        sfi.waived,
        sfi.paid,
        sfi.balance,
        sfi.due_date,
        sfi.status as db_status,
        sfi.created_at,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        s.admission_no,
        c.name as class_name,
        t.name as term_name
      FROM student_fee_items sfi
      JOIN students s ON sfi.student_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN terms t ON sfi.term_id = t.id
      WHERE s.school_id = ?
    `;

    const params = [schoolId];

    if (classId) {
      sql += ' AND c.id = ?';
      params.push(parseInt(classId, 10));
    }

    if (termId) {
      sql += ' AND sfi.term_id = ?';
      params.push(parseInt(termId, 10));
    }

    if (studentId) {
      sql += ' AND sfi.student_id = ?';
      params.push(parseInt(studentId, 10));
    }

    sql += ' ORDER BY sfi.created_at DESC';

    const [feeItems] = await connection.execute(sql, params);

    // Enhance with computed status
    const enhancedItems = FinanceService.enhanceFeeItems(feeItems);

    return NextResponse.json({
      success: true,
      data: enhancedItems
    });

  } catch (error: any) {
    console.error('Fee items fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch fee items'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { class_id,
      term_id,
      template_id,
      items // For individual items
    } = body;

    connection = await getConnection();
    await connection.beginTransaction();

    if (template_id) {
      // Apply fee template to class
      const [template] = await connection.execute(
        'SELECT * FROM fee_templates WHERE id = ? AND school_id = ?',
        [template_id, schoolId]
      );

      if (!template.length) {
        throw new Error('Fee template not found');
      }

      const templateItems = JSON.parse(template[0].items);
      
      // Get students in class
      const [students] = await connection.execute(`
        SELECT s.id
        FROM students s
        JOIN enrollments e ON s.id = e.student_id
        WHERE e.class_id = ? AND e.term_id = ? AND e.status = 'active'
      `, [class_id, term_id]);

      // Create fee items for all students
      for (const student of students) {
        for (const item of templateItems) {
          await connection.execute(`
            INSERT INTO student_fee_items (student_id, term_id, item, amount)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE amount = VALUES(amount)
          `, [student.id, term_id, item.item, item.amount]);
        }
      }

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: `Fee template applied to ${students.length} students`
      });

    } else if (items) {
      // Create individual fee items
      for (const item of items) {
        const result = await connection.execute(`
          INSERT INTO student_fee_items (student_id, term_id, item, amount, due_date)
          VALUES (?, ?, ?, ?, ?)
        `, [item.student_id, item.term_id, item.item, item.amount, item.due_date]);

        // Update status
        await FinanceService.updateFeeItemStatus(result.insertId, connection);
      }

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: 'Fee items created successfully'
      });
    } else {
      await connection.commit();
      return NextResponse.json({
        success: false,
        error: 'Either template_id or items must be provided'
      }, { status: 400 });
    }

  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error('Fee creation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to create fees'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
