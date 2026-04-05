import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
// GET /api/finance/expenditures
// List expenditures with filtering
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
    const categoryId = searchParams.get('category_id');
    const walletId = searchParams.get('wallet_id');
    const status = searchParams.get('status');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page', 10) || '1');
    const limit = parseInt(searchParams.get('limit', 10) || '50');
    
    connection = await getConnection();
    
    let sql = `
      SELECT 
        e.id,
        e.school_id,
        e.category_id,
        e.wallet_id,
        e.amount,
        e.description,
        e.vendor_name,
        e.vendor_contact,
        e.invoice_number,
        e.expense_date,
        e.status,
        e.approved_by,
        e.approved_at,
        e.created_at,
        fc.name as category_name,
        fc.category_type,
        w.name as wallet_name
      FROM expenditures e
      LEFT JOIN finance_categories fc ON e.category_id = fc.id
      LEFT JOIN wallets w ON e.wallet_id = w.id
      WHERE e.school_id = ? AND (e.deleted_at IS NULL OR e.deleted_at = '')
    `;
    
    const params: any[] = [schoolId];
    
    if (categoryId) {
      sql += ' AND e.category_id = ?';
      params.push(parseInt(categoryId, 10));
    }
    
    if (walletId) {
      sql += ' AND e.wallet_id = ?';
      params.push(parseInt(walletId, 10));
    }
    
    if (status) {
      sql += ' AND e.status = ?';
      params.push(status);
    }
    
    if (startDate) {
      sql += ' AND e.expense_date >= ?';
      params.push(startDate);
    }
    
    if (endDate) {
      sql += ' AND e.expense_date <= ?';
      params.push(endDate);
    }
    
    if (search) {
      sql += ' AND (e.description LIKE ? OR e.vendor_name LIKE ? OR e.invoice_number LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 50));
    const safeOffset = Math.max(0, Number((page - 1) * limit) || 0);
    sql += ` ORDER BY e.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;
    
    const [expenditures] = await connection.execute(sql, params);
    
    // Get total count
    let countSql = `
      SELECT COUNT(*) as total
      FROM expenditures e
      WHERE e.school_id = ? AND (e.deleted_at IS NULL OR e.deleted_at = '')
    `;
    const countParams = [schoolId];
    
    if (categoryId) countParams.push(parseInt(categoryId, 10));
    if (status) countParams.push(status as string);
    
    const [countResult] = await connection.execute(countSql, countParams as any);
    
    // Get summary
    let summarySql = `
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(e.amount), 0) as total_amount,
        COALESCE(SUM(CASE WHEN e.status = 'approved' THEN e.amount ELSE 0 END), 0) as approved_amount,
        COALESCE(SUM(CASE WHEN e.status = 'pending' THEN e.amount ELSE 0 END), 0) as pending_amount
      FROM expenditures e
      WHERE e.school_id = ? AND (e.deleted_at IS NULL OR e.deleted_at = '')
    `;
    const [summary] = await connection.execute(summarySql, [schoolId]);
    
    return NextResponse.json({
      success: true,
      data: expenditures,
      pagination: {
        page,
        limit,
        total: (countResult as any)[0]?.total || 0,
        pages: Math.ceil(((countResult as any)[0]?.total || 0) / limit)
      },
      summary: summary[0] || {}
    });
    
  } catch (error: any) {
    console.error('Expenditures fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch expenditures'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// POST /api/finance/expenditures
// Create new expenditure
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
    const { category_id,
      wallet_id,
      amount,
      description,
      vendor_name,
      vendor_contact,
      invoice_number,
      expense_date,
      status = 'pending',
      created_by = 1 } = body;
    
    // Validation
    if (!category_id || !amount || !description) {
      return NextResponse.json({
        success: false,
        error: 'category_id, amount, and description are required'
      }, { status: 400 });
    }
    
    connection = await getConnection();
    await connection.beginTransaction();
    
    // Insert expenditure
    const [result] = await connection.execute(`
      INSERT INTO expenditures (
        school_id, category_id, wallet_id, amount, description,
        vendor_name, vendor_contact, invoice_number, expense_date,
        status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      schoolId, category_id, wallet_id || null, amount, description,
      vendor_name || null, vendor_contact || null, invoice_number || null,
      expense_date || new Date().toISOString().split('T')[0],
      status, created_by
    ]);
    
    const expenditureId = result.insertId;
    
    await connection.commit();
    
    return NextResponse.json({
      success: true,
      data: {
        id: expenditureId,
        ...body
      }
    });
    
  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error('Expenditure creation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to create expenditure'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// PUT /api/finance/expenditures
// Update expenditure
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
      category_id,
      wallet_id,
      amount,
      description,
      vendor_name,
      vendor_contact,
      invoice_number,
      expense_date,
      status,
      approved_by } = body;
    
    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'id is required'
      }, { status: 400 });
    }
    
    connection = await getConnection();
    await connection.beginTransaction();
    
    // Update expenditure
    let updateFields = [];
    let params: any[] = [];
    
    if (category_id !== undefined) {
      updateFields.push('category_id = ?');
      params.push(category_id);
    }
    if (wallet_id !== undefined) {
      updateFields.push('wallet_id = ?');
      params.push(wallet_id);
    }
    if (amount !== undefined) {
      updateFields.push('amount = ?');
      params.push(amount);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      params.push(description);
    }
    if (vendor_name !== undefined) {
      updateFields.push('vendor_name = ?');
      params.push(vendor_name);
    }
    if (vendor_contact !== undefined) {
      updateFields.push('vendor_contact = ?');
      params.push(vendor_contact);
    }
    if (invoice_number !== undefined) {
      updateFields.push('invoice_number = ?');
      params.push(invoice_number);
    }
    if (expense_date !== undefined) {
      updateFields.push('expense_date = ?');
      params.push(expense_date);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      params.push(status);
      if (status === 'approved') {
        updateFields.push('approved_by = ?');
        params.push(approved_by || 1);
        updateFields.push('approved_at = NOW()');
      }
    }
    
    params.push(id, schoolId);
    
    await connection.execute(`
      UPDATE expenditures 
      SET ${updateFields.join(', ')}
      WHERE id = ? AND school_id = ?
    `, params);
    
    await connection.commit();
    
    return NextResponse.json({
      success: true,
      message: 'Expenditure updated successfully'
    });
    
  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error('Expenditure update error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update expenditure'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// DELETE /api/finance/expenditures?id=
// Soft delete expenditure
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
      UPDATE expenditures 
      SET deleted_at = NOW() 
      WHERE id = ? AND school_id = ?
    `, [id, schoolId]);
    
    return NextResponse.json({
      success: true,
      message: 'Expenditure deleted successfully'
    });
    
  } catch (error: any) {
    console.error('Expenditure deletion error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to delete expenditure'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
