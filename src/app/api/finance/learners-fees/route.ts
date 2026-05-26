import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { FinanceService } from '@/lib/services/FinanceService';

import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
export async function GET(request: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
    const schoolId = session.schoolId;

    const { searchParams } = new URL(request.url);
    // school_id derived from session below
    const classId = searchParams.get('class_id');
    const sectionId = searchParams.get('section_id');
    const termId = searchParams.get('term_id');
    const year = searchParams.get('year');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    connection = await getConnection();

    // Get all students with their enrollment info - joined with people table
    let studentsSql = `
      SELECT 
        s.id as student_id,
        s.admission_no,
        p.first_name,
        p.last_name,
        p.other_name,
        c.id as class_id,
        c.name as class_name,
        st.id as stream_id,
        st.name as stream_name,
        s.status as student_status
      FROM students s
      LEFT JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      WHERE s.school_id = ?
      AND s.status NOT IN ('dropped_out', 'expelled', 'transferred')
    `;

    const studentsParams: any[] = [schoolId];

    if (classId) {
      studentsSql += ' AND c.id = ?';
      studentsParams.push(parseInt(classId, 10));
    }

    if (sectionId) {
      studentsSql += ' AND st.id = ?';
      studentsParams.push(parseInt(sectionId, 10));
    }

    if (search) {
      studentsSql += ' AND (LOWER(p.first_name) LIKE ? OR LOWER(p.last_name) LIKE ? OR s.admission_no LIKE ?)';
      const searchPattern = `%${String(search).toLowerCase()}%`;
      studentsParams.push(searchPattern, searchPattern, `%${search}%`);
    }

    studentsSql += ' ORDER BY p.last_name, p.first_name';

    const [students] = await connection.execute(studentsSql, studentsParams);

    // Get per-student assigned fee items, with amount derived from the
    // referenced fee_structures row (the canonical source).
    //   student_fee_items   → assignment
    //   fee_structures      → item definition + amount
    //   fee_payments        → recorded payments (sum of amount per fee_item)
    //   waivers_discounts   → approved waivers/discounts
    //
    // Historical note: an earlier MVP query referenced fs.total_amount and
    // a fsi (fee_structure_items) table that never existed. We now
    // compute expected from fs.amount and aggregate payments/waivers
    // server-side per row.
    let feeItemsSql = `
      SELECT
        sfi.id                 AS fee_item_id,
        sfi.student_id,
        sfi.term_id,
        sfi.fee_structure_id,
        sfi.status             AS fee_status,
        sfi.due_date,
        fs.item                AS item,
        fs.amount              AS amount,
        COALESCE(p.paid, 0)    AS paid,
        COALESCE(p.discount, 0) AS discount,
        COALESCE(w.waived, 0)  AS waived,
        t.name                 AS term_name
      FROM student_fee_items sfi
      JOIN students s_inner    ON sfi.student_id     = s_inner.id
      LEFT JOIN fee_structures fs ON sfi.fee_structure_id = fs.id
      LEFT JOIN terms t        ON sfi.term_id        = t.id
      LEFT JOIN (
        SELECT fee_item_id,
               SUM(amount)            AS paid,
               SUM(discount_applied)  AS discount
          FROM fee_payments
         WHERE payment_status = 'completed'
         GROUP BY fee_item_id
      ) p ON p.fee_item_id = sfi.id
      LEFT JOIN (
        SELECT fee_item_id, SUM(amount) AS waived
          FROM waivers_discounts
         WHERE status = 'approved'
         GROUP BY fee_item_id
      ) w ON w.fee_item_id = sfi.id
      WHERE s_inner.school_id = ?
    `;

    const feeItemsParams: any[] = [schoolId];

    if (termId) {
      feeItemsSql += ' AND sfi.term_id = ?';
      feeItemsParams.push(parseInt(termId, 10));
    }

    const [feeItems] = await connection.execute(feeItemsSql, feeItemsParams);

    // Class-default structures (used when a student has no explicit
    // assignments yet — surfaces "expected" so the UI doesn't show 0).
    // Each row of fee_structures is one item; total = SUM(amount).
    let feeStructureSql = `
      SELECT
        fs.id          AS fee_structure_id,
        fs.class_id,
        fs.term_id,
        fs.item        AS item_name,
        fs.amount      AS item_amount
      FROM fee_structures fs
      WHERE fs.school_id = ?
    `;

    const feeStructureParams: any[] = [schoolId];

    if (termId) {
      feeStructureSql += ' AND fs.term_id = ?';
      feeStructureParams.push(parseInt(termId, 10));
    }

    if (year) {
      feeStructureSql += ' AND fs.academic_year = ?';
      feeStructureParams.push(year);
    }

    const [feeStructures] = await connection.execute(feeStructureSql, feeStructureParams);

    // Group fee items by student
    const feeItemsByStudent: Record<number, any[]> = {};
    (feeItems as any[]).forEach(fi => {
      if (!feeItemsByStudent[fi.student_id]) {
        feeItemsByStudent[fi.student_id] = [];
      }
      feeItemsByStudent[fi.student_id].push(fi);
    });

    // Group fee structures by class
    const feeStructuresByClass: Record<number, any[]> = {};
    (feeStructures as any[]).forEach(fs => {
      if (!feeStructuresByClass[fs.class_id]) {
        feeStructuresByClass[fs.class_id] = [];
      }
      feeStructuresByClass[fs.class_id].push(fs);
    });

    // Process students and calculate fees
    const learnersWithFees = (students as any[]).map(student => {
      const studentFeeItems = feeItemsByStudent[student.student_id] || [];
      
      // Calculate totals from fee items
      let totalExpected = 0;
      let totalPaid = 0;
      let totalWaived = 0;
      let totalDiscount = 0;

      // DECIMAL columns come back as strings from mysql2; coerce to Number
      // explicitly to avoid string-concat masquerading as addition.
      const num = (v: any) => Number(v ?? 0) || 0;
      if (studentFeeItems.length > 0) {
        totalExpected = studentFeeItems.reduce((sum, fi) => sum + num(fi.amount),   0);
        totalPaid     = studentFeeItems.reduce((sum, fi) => sum + num(fi.paid),     0);
        totalWaived   = studentFeeItems.reduce((sum, fi) => sum + num(fi.waived),   0);
        totalDiscount = studentFeeItems.reduce((sum, fi) => sum + num(fi.discount), 0);
      } else {
        // Fall back to the class-level default structure so the UI shows
        // an "expected" total even before per-student assignment.
        const classFeeStructure = feeStructuresByClass[student.class_id] || [];
        if (classFeeStructure.length > 0) {
          totalExpected = classFeeStructure.reduce((sum, fs) => sum + num(fs.item_amount), 0);
        }
      }

      const balance = totalExpected - totalPaid - totalWaived - totalDiscount;

      // Determine status
      let learnerStatus: 'Cleared' | 'Partially Paid' | 'Unpaid' | 'Undefined';
      const hasFeeDefinition = studentFeeItems.length > 0 || (feeStructuresByClass[student.class_id]?.length > 0);

      if (!hasFeeDefinition) {
        learnerStatus = 'Undefined';
      } else if (balance <= 0 && totalExpected > 0) {
        learnerStatus = 'Cleared';
      } else if (totalPaid > 0 || totalWaived > 0) {
        learnerStatus = 'Partially Paid';
      } else {
        learnerStatus = 'Unpaid';
      }

      // Filter by status if requested
      if (status && learnerStatus !== status) {
        return null;
      }

      return {
        student_id: student.student_id,
        admission_no: student.admission_no,
        full_name: `${student.last_name} ${student.first_name} ${student.other_name || ''}`.trim(),
        class_id: student.class_id,
        class_name: student.class_name || 'Not Assigned',
        stream_id: student.stream_id,
        stream_name: student.stream_name,
        total_expected: totalExpected || undefined,
        total_paid: totalPaid,
        total_waived: totalWaived,
        total_discount: totalDiscount,
        balance: balance > 0 ? balance : 0,
        status: learnerStatus,
        fee_items_count: studentFeeItems.length,
        has_fee_definition: hasFeeDefinition
      };
    }).filter(Boolean);

    // Calculate summary meta
    const meta = {
      total_learners: learnersWithFees.length,
      total_expected: learnersWithFees.reduce((sum, l: any) => sum + (l.total_expected || 0), 0),
      total_paid: learnersWithFees.reduce((sum, l: any) => sum + l.total_paid, 0),
      total_balance: learnersWithFees.reduce((sum, l: any) => sum + l.balance, 0),
      cleared_count: learnersWithFees.filter((l: any) => l.status === 'Cleared').length,
      partially_paid_count: learnersWithFees.filter((l: any) => l.status === 'Partially Paid').length,
      unpaid_count: learnersWithFees.filter((l: any) => l.status === 'Unpaid').length,
      undefined_count: learnersWithFees.filter((l: any) => l.status === 'Undefined').length,
    };

    return NextResponse.json({
      success: true,
      data: learnersWithFees,
      meta
    });

  } catch (error: any) {
    console.error('Error fetching learners fees:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch learners fees: ' + error.message },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
