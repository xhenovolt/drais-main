import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { FinanceService } from '@/lib/services/FinanceService';

import { getSessionSchoolId } from '@/lib/auth';
// GET /api/finance/ledger/fees
// Central Fees Ledger - View all learners with their fees status
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
    const sectionId = searchParams.get('section_id');
    const termId = searchParams.get('term_id');
    const academicYear = searchParams.get('academic_year');
    const status = searchParams.get('status'); // paid, partial, pending, overdue, waived
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    
    connection = await getConnection();
    
    // Get all students with their fee items summary
    let sql = `
      SELECT 
        s.id as student_id,
        s.admission_no,
        p.first_name,
        p.last_name,
        p.phone as parent_phone,
        c.name as class_name,
        COALESCE(st.name, 'N/A') as section_name,
        COALESCE(SUM(sfi.amount), 0) as total_expected,
        COALESCE(SUM(sfi.discount), 0) as total_discount,
        COALESCE(SUM(sfi.waived), 0) as total_waived,
        COALESCE(SUM(sfi.paid), 0) as total_paid,
        COALESCE(SUM(sfi.balance), 0) as total_balance,
        COUNT(sfi.id) as fee_items_count,
        COUNT(CASE WHEN sfi.balance = 0 THEN 1 END) as paid_items_count,
        COUNT(CASE WHEN sfi.balance > 0 AND sfi.paid > 0 THEN 1 END) as partial_items_count,
        COUNT(CASE WHEN sfi.paid = 0 THEN 1 END) as pending_items_count,
        MAX(sfi.last_payment_date) as last_payment_date,
        CASE 
          WHEN SUM(sfi.balance) = 0 THEN 'paid'
          WHEN SUM(sfi.paid) > 0 THEN 'partial'
          WHEN MAX(sfi.due_date) < CURDATE() AND SUM(sfi.paid) = 0 THEN 'overdue'
          ELSE 'pending'
        END as overall_status
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN sections st ON e.section_id = st.id OR s.section_id = st.id
      LEFT JOIN student_fee_items sfi ON s.id = sfi.student_id
        ${termId ? 'AND sfi.term_id = ?' : ''}
        ${academicYear ? 'AND sfi.academic_year = ?' : ''}
      WHERE s.school_id = ? AND s.deleted_at IS NULL
    `;
    
    const params: any[] = [];
    
    if (termId) {
      params.push(parseInt(termId, 10));
    }
    if (academicYear) {
      params.push(academicYear);
    }
    params.push(schoolId);
    
    if (classId) {
      sql += ' AND c.id = ?';
      params.push(parseInt(classId, 10));
    }
    
    if (sectionId) {
      sql += ' AND (e.section_id = ? OR s.section_id = ?)';
      params.push(parseInt(sectionId, 10), parseInt(sectionId, 10));
    }
    
    if (status) {
      sql += ` AND CASE 
        WHEN SUM(sfi.balance) = 0 THEN 'paid'
        WHEN SUM(sfi.paid) > 0 THEN 'partial'
        WHEN MAX(sfi.due_date) < CURDATE() AND SUM(sfi.paid) = 0 THEN 'overdue'
        ELSE 'pending'
      END = ?`;
      params.push(status);
    }
    
    if (search) {
      sql += ` AND (LOWER(p.first_name) LIKE ? OR LOWER(p.last_name) LIKE ? OR s.admission_no LIKE ?)`;
      const likeSearch = `%${String(search).toLowerCase()}%`;
      params.push(likeSearch, likeSearch, `%${search}%`);
    }
    
    sql += ` GROUP BY s.id, s.admission_no, p.first_name, p.last_name, p.phone, c.name, st.name`;
    sql += ` ORDER BY total_balance DESC, p.first_name ASC`;
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 50));
    const safeOffset = Math.max(0, Number((page - 1) * limit) || 0);
    sql += ` LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    
    const [students] = await connection.execute(sql, params);
    
    // Get total count
    let countSql = `
      SELECT COUNT(DISTINCT s.id) as total
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN sections st ON e.section_id = st.id OR s.section_id = st.id
      LEFT JOIN student_fee_items sfi ON s.id = sfi.student_id
      WHERE s.school_id = ? AND s.deleted_at IS NULL
    `;
    const countParams = [schoolId];
    
    if (classId) {
      countSql += ' AND c.id = ?';
      countParams.push(parseInt(classId, 10));
    }
    if (sectionId) {
      countSql += ' AND (e.section_id = ? OR s.section_id = ?)';
      countParams.push(parseInt(sectionId, 10), parseInt(sectionId, 10));
    }
    
    const [countResult] = await connection.execute(countSql, countParams);
    const total = (countResult as any)[0]?.total || 0;
    
    // Get summary statistics
    let statsSql = `
      SELECT 
        COUNT(DISTINCT s.id) as total_students,
        COALESCE(SUM(sfi.amount), 0) as total_expected,
        COALESCE(SUM(sfi.paid), 0) as total_collected,
        COALESCE(SUM(sfi.balance), 0) as total_outstanding,
        COUNT(CASE WHEN SUM(sfi.balance) = 0 THEN 1 END) as fully_paid,
        COUNT(CASE WHEN SUM(sfi.paid) > 0 AND SUM(sfi.balance) > 0 THEN 1 END) as partially_paid,
        COUNT(CASE WHEN SUM(sfi.paid) = 0 THEN 1 END) as not_paid
      FROM students s
      LEFT JOIN student_fee_items sfi ON s.id = sfi.student_id
      WHERE s.school_id = ? AND s.deleted_at IS NULL
    `;
    const [stats] = await connection.execute(statsSql, [schoolId]);
    
    return NextResponse.json({
      success: true,
      data: students,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      summary: stats[0] || {}
    });
    
  } catch (error: any) {
    console.error('Fees ledger fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch fees ledger'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
