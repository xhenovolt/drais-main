import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { FinanceService } from '@/lib/services/FinanceService';

import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { checkModule } from '@/lib/auth/requireModule';
export async function GET(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const classId = searchParams.get('class_id');
    const termId = searchParams.get('term_id');
    const studentId = searchParams.get('student_id');
    const statusFilter = searchParams.get('status');
    const search = searchParams.get('q');
    // This route previously returned EVERY student_fee_items row for the
    // whole school with no LIMIT — for any school with real history this
    // is thousands of rows shipped + rendered at once, which is what was
    // freezing the /finance/fees page (compounded by a per-row animation
    // on the client — fixed there too). Paginated like every other list
    // route in this codebase.
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const offset = (page - 1) * limit;

    connection = await getConnection();

    const baseFrom = `
      FROM student_fee_items sfi
      JOIN students s ON sfi.student_id = s.id AND s.deleted_at IS NULL
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      -- ONE enrollment per learner, never a fan-out.
      --
      -- Filtering on status alone multiplies every fee row by the number of
      -- active enrollments a learner has. Measured at ALBAYAN: 695 learners
      -- have more than one and student 392629 has SIX, so its 28 fee rows
      -- rendered as 168 identical rows sharing one primary key, and every SUM
      -- over them was six times the real balance.
      --
      -- The data itself is clean: 16,608 rows, 16,608 distinct
      -- (learner, fee, term). The duplication was made by the join.
      --
      -- A derived table, NOT a subquery in ON: TiDB rejects the latter with
      -- "ON condition doesn't support subqueries yet" — which tsc cannot catch,
      -- so it would have failed only at runtime, in production.
      LEFT JOIN (
        SELECT student_id, MAX(id) AS id
          FROM enrollments
         WHERE status = 'active'
         GROUP BY student_id
      ) le ON le.student_id = s.id
      LEFT JOIN enrollments e ON e.id = le.id
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN terms t ON sfi.term_id = t.id
      WHERE s.school_id = ?
    `;
    const params: any[] = [schoolId];
    let filters = '';

    // Mirrors FinanceService.computeFeeItemStatus() exactly — the UI shows
    // and filters by the COMPUTED status, not the raw stored sfi.status
    // column (which isn't kept in sync on every payment), so filtering on
    // the raw column would silently disagree with what the table displays.
    const COMPUTED_STATUS_SQL = `(
      CASE
        WHEN sfi.waived >= sfi.amount THEN 'waived'
        WHEN sfi.paid >= (sfi.amount - sfi.discount - sfi.waived) THEN 'paid'
        WHEN sfi.paid > 0 AND sfi.paid < (sfi.amount - sfi.discount - sfi.waived) THEN 'partial'
        WHEN sfi.due_date IS NOT NULL AND sfi.due_date < CURDATE() THEN 'overdue'
        ELSE 'pending'
      END
    )`;

    if (classId) { filters += ' AND c.id = ?'; params.push(parseInt(classId, 10)); }
    if (termId) { filters += ' AND sfi.term_id = ?'; params.push(parseInt(termId, 10)); }
    if (studentId) { filters += ' AND sfi.student_id = ?'; params.push(parseInt(studentId, 10)); }
    if (statusFilter) { filters += ` AND ${COMPUTED_STATUS_SQL} = ?`; params.push(statusFilter); }
    if (search) {
      filters += ' AND (p.first_name LIKE ? OR p.last_name LIKE ? OR s.admission_no LIKE ? OR sfi.item LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const [countRows]: any = await connection.execute(`SELECT COUNT(*) AS total ${baseFrom}${filters}`, params);
    const total = Number(countRows?.[0]?.total || 0);

    // Aggregate stats over the FULL filtered set (not just this page) — one
    // cheap SUM query rather than shipping every row to compute it client-side.
    const [summaryRows]: any = await connection.execute(
      `SELECT COALESCE(SUM(sfi.amount),0) AS total_amount,
              COALESCE(SUM(sfi.paid),0) AS total_paid,
              COALESCE(SUM(sfi.amount - sfi.discount - sfi.waived - sfi.paid),0) AS total_balance,
              SUM(CASE WHEN ${COMPUTED_STATUS_SQL} = 'overdue' THEN 1 ELSE 0 END) AS overdue_count
       ${baseFrom}${filters}`,
      params,
    );
    const summary = summaryRows?.[0] || { total_amount: 0, total_paid: 0, total_balance: 0, overdue_count: 0 };

    const sql = `
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
      ${baseFrom}${filters}
      ORDER BY sfi.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [feeItems] = await connection.execute(sql, params);

    // Enhance with computed status
    const enhancedItems = FinanceService.enhanceFeeItems(feeItems);

    return NextResponse.json({
      success: true,
      data: enhancedItems,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
      summary,
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
    await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin);
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
        WHERE e.class_id = ? AND e.term_id = ? AND e.status = 'active' AND s.deleted_at IS NULL
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
