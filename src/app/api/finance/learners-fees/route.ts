import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { FinanceService } from '@/lib/services/FinanceService';

import { getSessionSchoolId } from '@/lib/auth';
export async function GET(request: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
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

    // Get fee items for the term
    let feeItemsSql = `
      SELECT 
        fi.id as fee_item_id,
        fi.student_id,
        fi.term_id,
        fi.item,
        fi.amount,
        fi.discount,
        fi.waived,
        fi.paid,
        fi.balance,
        fi.status as fee_status,
        fi.due_date,
        t.name as term_name
      FROM student_fee_items fi
      JOIN students s_inner ON fi.student_id = s_inner.id
      LEFT JOIN terms t ON fi.term_id = t.id
      WHERE s_inner.school_id = ?
    `;

    const feeItemsParams: any[] = [schoolId];

    if (termId) {
      feeItemsSql += ' AND fi.term_id = ?';
      feeItemsParams.push(parseInt(termId, 10));
    }

    const [feeItems] = await connection.execute(feeItemsSql, feeItemsParams);

    // Get fee structures for class-based fees
    let feeStructureSql = `
      SELECT 
        fs.id as fee_structure_id,
        fs.class_id,
        fs.term_id,
        fs.total_amount,
        fsi.item_name,
        fsi.amount as item_amount
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

      if (studentFeeItems.length > 0) {
        totalExpected = studentFeeItems.reduce((sum, fi) => sum + fi.amount, 0);
        totalPaid = studentFeeItems.reduce((sum, fi) => sum + fi.paid, 0);
        totalWaived = studentFeeItems.reduce((sum, fi) => sum + fi.waived, 0);
        totalDiscount = studentFeeItems.reduce((sum, fi) => sum + fi.discount, 0);
      } else {
        // Check if there's a fee structure for the student's class
        const classFeeStructure = feeStructuresByClass[student.class_id] || [];
        if (classFeeStructure.length > 0) {
          totalExpected = classFeeStructure.reduce((sum, fs) => sum + fs.item_amount, 0);
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
