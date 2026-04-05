import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
// GET /api/finance/waivers
// List waivers and discounts
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
    const studentId = searchParams.get('student_id');
    const termId = searchParams.get('term_id');
    const status = searchParams.get('status'); // pending, approved, rejected
    const page = parseInt(searchParams.get('page', 10) || '1');
    const limit = parseInt(searchParams.get('limit', 10) || '50');
    
    connection = await getConnection();
    
    let sql = `
      SELECT 
        w.id,
        w.school_id,
        w.student_id,
        w.term_id,
        w.fee_item_id,
        w.waiver_type,
        w.discount_type,
        w.amount,
        w.reason,
        w.status,
        w.approved_by,
        w.approved_at,
        w.created_at,
        p.first_name,
        p.last_name,
        s.admission_no,
        c.name as class_name,
        t.name as term_name,
        sfi.item as fee_item_name
      FROM waivers_discounts w
      LEFT JOIN students s ON w.student_id = s.id
      LEFT JOIN people p ON s.person_id = p.id
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN terms t ON w.term_id = t.id
      LEFT JOIN student_fee_items sfi ON w.fee_item_id = sfi.id
      WHERE w.school_id = ? AND (w.deleted_at IS NULL OR w.deleted_at = '')
    `;
    
    const params: any[] = [schoolId];
    
    if (studentId) {
      sql += ' AND w.student_id = ?';
      params.push(parseInt(studentId, 10));
    }
    
    if (termId) {
      sql += ' AND w.term_id = ?';
      params.push(parseInt(termId, 10));
    }
    
    if (status) {
      sql += ' AND w.status = ?';
      params.push(status);
    }
    
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 50));
    const safeOffset = Math.max(0, Number((page - 1) * limit) || 0);
    sql += ` ORDER BY w.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    
    const [waivers] = await connection.execute(sql, params);
    
    // Get total count
    let countSql = `
      SELECT COUNT(*) as total
      FROM waivers_discounts w
      WHERE w.school_id = ? AND (w.deleted_at IS NULL OR w.deleted_at = '')
    `;
    const [countResult] = await connection.execute(countSql, [schoolId]);
    
    // Get summary
    let summarySql = `
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(CASE WHEN w.status = 'approved' THEN w.amount ELSE 0 END), 0) as total_approved,
        COALESCE(SUM(CASE WHEN w.status = 'pending' THEN w.amount ELSE 0 END), 0) as total_pending,
        COUNT(CASE WHEN w.waiver_type = 'full' THEN 1 END) as full_waivers,
        COUNT(CASE WHEN w.waiver_type = 'partial' THEN 1 END) as partial_waivers
      FROM waivers_discounts w
      WHERE w.school_id = ? AND (w.deleted_at IS NULL OR w.deleted_at = '')
    `;
    const [summary] = await connection.execute(summarySql, [schoolId]);
    
    return NextResponse.json({
      success: true,
      data: waivers,
      pagination: {
        page,
        limit,
        total: (countResult as any)[0]?.total || 0,
        pages: Math.ceil(((countResult as any)[0]?.total || 0) / limit)
      },
      summary: summary[0] || {}
    });
    
  } catch (error: any) {
    console.error('Waivers fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch waivers'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// POST /api/finance/waivers
// Create new waiver or discount
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
    const { student_id,
      term_id,
      fee_item_id,
      waiver_type = 'partial',
      discount_type = 'fixed',
      amount,
      reason,
      created_by = 1 } = body;
    
    // Validation
    if (!student_id || !term_id || !amount || !reason) {
      return NextResponse.json({
        success: false,
        error: 'student_id, term_id, amount, and reason are required'
      }, { status: 400 });
    }
    
    connection = await getConnection();
    await connection.beginTransaction();
    
    // Insert waiver
    const [result] = await connection.execute(`
      INSERT INTO waivers_discounts (
        school_id, student_id, term_id, fee_item_id, waiver_type,
        discount_type, amount, reason, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      schoolId, student_id, term_id, fee_item_id || null, 
      waiver_type, discount_type, amount, reason, created_by
    ]);
    
    const waiverId = result.insertId;
    
    await connection.commit();
    
    return NextResponse.json({
      success: true,
      data: {
        id: waiverId,
        ...body
      }
    });
    
  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error('Waiver creation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to create waiver'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// PUT /api/finance/waivers
// Approve or reject waiver
export async function PUT(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { id,
      action, // 'approve' or 'reject'
      approved_by = 1,
      rejection_reason } = body;
    
    if (!id || !action) {
      return NextResponse.json({
        success: false,
        error: 'id and action are required'
      }, { status: 400 });
    }
    
    connection = await getConnection();
    await connection.beginTransaction();
    
    // Get waiver details
    const [waivers] = await connection.execute(
      'SELECT * FROM waivers_discounts WHERE id = ? AND school_id = ?',
      [id, schoolId]
    );
    
    if (!waivers.length) {
      throw new Error('Waiver not found');
    }
    
    const waiver = waivers[0];
    
    if (action === 'approve') {
      // Update waiver status
      await connection.execute(`
        UPDATE waivers_discounts 
        SET status = 'approved', approved_by = ?, approved_at = NOW()
        WHERE id = ? AND school_id = ?
      `, [approved_by, id, schoolId]);
      
      // Update fee item with waiver amount
      if (waiver.fee_item_id) {
        await connection.execute(`
          UPDATE student_fee_items 
          SET waived = waived + ?, updated_at = NOW()
          WHERE id = ?
        `, [waiver.amount, waiver.fee_item_id]);
      } else {
        // Apply to all pending fee items for the student
        await connection.execute(`
          UPDATE student_fee_items 
          SET waived = waived + ?, updated_at = NOW()
          WHERE student_id = ? AND term_id = ? AND deleted_at IS NULL
        `, [waiver.amount, waiver.student_id, waiver.term_id]);
      }
      
    } else if (action === 'reject') {
      await connection.execute(`
        UPDATE waivers_discounts 
        SET status = 'rejected', rejection_reason = ?
        WHERE id = ? AND school_id = ?
      `, [rejection_reason, id, schoolId]);
    }
    
    await connection.commit();
    
    return NextResponse.json({
      success: true,
      message: `Waiver ${action === 'approve' ? 'approved' : 'rejected'} successfully`
    });
    
  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error('Waiver update error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update waiver'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// DELETE /api/finance/waivers?id=
// Soft delete waiver
export async function DELETE(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    // school_id derived from session below
    
    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'id is required'
      }, { status: 400 });
    }
    
    connection = await getConnection();
    
    await connection.execute(`
      UPDATE waivers_discounts 
      SET deleted_at = NOW() 
      WHERE id = ? AND school_id = ?
    `, [id, schoolId]);
    
    return NextResponse.json({
      success: true,
      message: 'Waiver deleted successfully'
    });
    
  } catch (error: any) {
    console.error('Waiver deletion error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to delete waiver'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
