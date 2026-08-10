import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { FinanceService } from '@/lib/services/FinanceService';

import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { checkModule } from '@/lib/auth/requireModule';
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
    // Status is computed per-student from aggregated fee items, so it can't
    // be pushed into the SQL WHERE clause — the full filtered/classified
    // set is still built server-side (cheap: raw rows, not DOM), but only a
    // page of it is ever sent to the browser. This route used to ship every
    // student's computed fee summary in one response on every load — same
    // shape of bug that froze /finance/fees.
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    // Capped high enough to cover a full-school CSV export (largest schools
    // observed run ~1,245 students) in one request, while still bounding
    // the response for pathological inputs.
    const limit = Math.min(5000, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));

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

    // Get per-student assigned fee items. amount/discount/waived/paid are
    // read DIRECTLY off student_fee_items — they are already the
    // authoritative, live values (generateBills() writes amount/discount/
    // waived at bill time; recordPayment's per-item allocation keeps paid
    // in sync on every payment; repriceApprovedAdjustments keeps discount/
    // waived in sync on every waiver approval/rejection). balance is a
    // STORED GENERATED column (amount - discount - waived - paid) — never
    // written by the app, always correct.
    //
    // BUG FIXED: this previously joined sfi.fee_structure_id → the OLD V1
    // fee_structures table to derive "amount", and separately summed the
    // DEPRECATED fee_payments / retired waivers_discounts tables for
    // paid/waived. But the canonical billing engine (generateBills(), Fee
    // Rules) never populates fee_structure_id — every modern student_fee_
    // items row has fee_item_id instead (confirmed live: 16,579 rows with
    // fee_item_id set and real amounts, 0 rows with fee_structure_id set).
    // So this query's join NEVER matched anything for any student billed
    // the current way, and both amount and paid/waived silently computed
    // to 0 — "0s" on the page despite real fees having been charged.
    let feeItemsSql = `
      SELECT
        sfi.id                  AS fee_item_id,
        sfi.student_id,
        sfi.term_id,
        sfi.fee_item_id         AS canonical_fee_item_id,
        sfi.status              AS fee_status,
        sfi.due_date,
        sfi.item                AS item,
        sfi.amount              AS amount,
        sfi.paid                AS paid,
        sfi.discount            AS discount,
        sfi.waived              AS waived,
        t.name                  AS term_name
      FROM student_fee_items sfi
      JOIN students s_inner    ON sfi.student_id     = s_inner.id
      LEFT JOIN terms t        ON sfi.term_id        = t.id
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

    // Calculate summary meta over the FULL filtered set (school-wide totals),
    // before slicing to a page for the response body.
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

    const total = learnersWithFees.length;
    const offset = (page - 1) * limit;
    const pageData = learnersWithFees.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: pageData,
      meta,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
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
