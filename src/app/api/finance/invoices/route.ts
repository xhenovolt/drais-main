import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { generateReceiptPDF, generateInvoicePDF } from '@/lib/receipts';
import { v4 as uuidv4 } from 'uuid';

import { getSessionSchoolId } from '@/lib/auth';
// GET /api/finance/invoices?student_id=&term_id=
// Generate invoice for a student
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
    const invoiceId = searchParams.get('invoice_id');
    
    if (!studentId && !invoiceId) {
      return NextResponse.json({
        success: false,
        error: 'student_id or invoice_id is required'
      }, { status: 400 });
    }
    
    connection = await getConnection();
    
    // Get school info
    const [schools] = await connection.execute(
      'SELECT * FROM schools WHERE id = ?',
      [schoolId]
    );
    const school = schools[0] || {};
    
    // Get student info
    let studentSql = `
      SELECT 
        s.id, s.admission_no, p.first_name, p.last_name, p.email, p.phone,
        c.name as class_name, st.name as section_name
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN sections st ON e.section_id = st.id
      WHERE s.id = ?
    `;
    const [students] = await connection.execute(studentSql, [studentId || invoiceId]);
    const student = students[0];
    
    if (!student) {
      return NextResponse.json({
        success: false,
        error: 'Student not found'
      }, { status: 404 });
    }
    
    // Get fee items
    let feeSql = `
      SELECT 
        sfi.*,
        t.name as term_name,
        fs.fee_type,
        fs.is_mandatory
      FROM student_fee_items sfi
      LEFT JOIN terms t ON sfi.term_id = t.id
      LEFT JOIN fee_structures fs ON sfi.fee_structure_id = fs.id
      WHERE sfi.student_id = ? 
        ${termId ? 'AND sfi.term_id = ?' : ''}
      ORDER BY sfi.created_at ASC
    `;
    const feeParams = termId ? [studentId, termId] : [studentId];
    const [feeItems] = await connection.execute(feeSql, feeParams);
    
    // Get term info
    const [terms] = await connection.execute(
      'SELECT * FROM terms WHERE id = ?',
      [termId || (feeItems[0] as any)?.term_id]
    );
    const term = terms[0] || {};
    
    // Get academic year
    const [academicYears] = await connection.execute(
      'SELECT * FROM academic_years WHERE is_active = 1 LIMIT 1'
    );
    const academicYear = (academicYears[0] as any)?.name || new Date().getFullYear();
    
    // Calculate totals
    const totalExpected = (feeItems as any[]).reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    const totalDiscount = (feeItems as any[]).reduce((sum, item) => sum + parseFloat(item.discount || 0), 0);
    const totalWaived = (feeItems as any[]).reduce((sum, item) => sum + parseFloat(item.waived || 0), 0);
    const totalPaid = (feeItems as any[]).reduce((sum, item) => sum + parseFloat(item.paid || 0), 0);
    const totalBalance = totalExpected - totalDiscount - totalWaived - totalPaid;
    
    // Generate invoice number
    const invoiceNo = `INV-${academicYear}-${String(student.id).padStart(6, '0')}-${Date.now().toString().slice(-4)}`;
    
    // Prepare invoice data
    const invoiceData = {
      invoice_no: invoiceNo,
      school_name: school.name || 'School',
      school_address: school.address || '',
      school_phone: school.phone || '',
      school_email: school.email || '',
      school_logo: school.logo_url || '',
      student_name: `${student.first_name} ${student.last_name}`,
      admission_no: student.admission_no,
      class_name: student.class_name || 'N/A',
      section_name: student.section_name || 'N/A',
      term_name: term.name || 'N/A',
      academic_year: academicYear,
      items: (feeItems as any[]).map(item => ({
        item: item.item,
        description: item.description || '',
        fee_type: item.fee_type || 'other',
        is_mandatory: item.is_mandatory ? 'Yes' : 'No',
        amount: parseFloat(item.amount || 0),
        discount: parseFloat(item.discount || 0),
        waived: parseFloat(item.waived || 0),
        paid: parseFloat(item.paid || 0),
        balance: parseFloat(item.balance || 0),
        due_date: item.due_date || null
      })),
      total_expected: totalExpected,
      total_discount: totalDiscount,
      total_waived: totalWaived,
      total_paid: totalPaid,
      total_balance: totalBalance,
      currency: 'UGX',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: term.end_date || null,
      parent_name: `${student.first_name} ${student.last_name}`,
      parent_phone: student.phone || '',
      parent_email: student.email || ''
    };
    
    // Generate PDF invoice
    const pdfBuffer = await generateInvoicePDF(invoiceData);
    
    // Save invoice record
    const [insertResult] = await connection.execute(`
      INSERT INTO receipts (school_id, payment_id, receipt_no, file_url, metadata)
      VALUES (?, NULL, ?, ?, ?)
      ON DUPLICATE KEY UPDATE invoice_no = VALUES(invoice_no), invoice_url = VALUES(invoice_url)
    `, [
      schoolId,
      invoiceNo,
      null, // file_url - would be set after upload
      JSON.stringify({
        type: 'invoice',
        ...invoiceData
      })
    ]);
    
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Invoice-${invoiceNo}.pdf"`
      }
    });
    
  } catch (error: any) {
    console.error('Invoice generation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to generate invoice'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// POST /api/finance/invoices
// Create and save invoice record
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
      items = [],
      notes } = body;
    
    if (!student_id) {
      return NextResponse.json({
        success: false,
        error: 'student_id is required'
      }, { status: 400 });
    }
    
    connection = await getConnection();
    await connection.beginTransaction();
    
    // Get student info
    const [students] = await connection.execute(`
      SELECT s.id, s.admission_no, p.first_name, p.last_name
      FROM students s
      JOIN people p ON s.person_id = p.id
      WHERE s.id = ?
    `, [student_id]);
    
    if (!students.length) {
      throw new Error('Student not found');
    }
    
    const student = students[0];
    
    // Get academic year
    const [years] = await connection.execute(
      'SELECT * FROM academic_years WHERE is_active = 1 LIMIT 1'
    );
    const academicYear = (years[0] as any)?.name || new Date().getFullYear().toString();
    
    // Generate invoice number
    const invoiceNo = `INV-${academicYear}-${String(student_id).padStart(6, '0')}-${Date.now().toString().slice(-4)}`;
    
    // Create invoice record
    const [result] = await connection.execute(`
      INSERT INTO receipts (school_id, invoice_no, metadata, generated_at)
      VALUES (?, ?, ?, NOW())
    `, [
      schoolId,
      invoiceNo,
      JSON.stringify({
        student_id,
        term_id,
        items,
        notes,
        generated_by: body.generated_by || 1
      })
    ]);
    
    await connection.commit();
    
    return NextResponse.json({
      success: true,
      data: {
        id: result.insertId,
        invoice_no: invoiceNo,
        student_id,
        term_id,
        items,
        notes
      }
    });
    
  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error('Invoice creation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to create invoice'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
