import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { generateReceiptPDF } from '@/lib/services/ReceiptService';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let connection;
  
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const resolvedParams = await params;
    const paymentId = parseInt(resolvedParams.id, 10);

    connection = await getConnection();

    // Fetch payment details
    const [payments] = await connection.execute(`
      SELECT 
        fp.*,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        s.admission_no,
        c.name as class_name,
        t.name as term_name,
        w.name as wallet_name,
        w.currency,
        sch.name as school_name,
        sch.legal_name,
        sch.address as school_address,
        sch.phone as school_phone,
        sch.email as school_email,
        sch.logo_url,
        r.file_url,
        r.metadata as receipt_metadata
      FROM fee_payments fp
      JOIN students s ON fp.student_id = s.id
      JOIN people p ON s.person_id = p.id
      JOIN schools sch ON s.school_id = sch.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN terms t ON fp.term_id = t.id
      LEFT JOIN wallets w ON fp.wallet_id = w.id
      LEFT JOIN receipts r ON fp.id = r.payment_id
      WHERE fp.id = ?
    `, [paymentId]);

    if (!payments.length) {
      return NextResponse.json({
        success: false,
        error: 'Payment not found'
      }, { status: 404 });
    }

    const payment = payments[0];

    // Check if receipt PDF already exists
    if (payment.file_url) {
      // Return existing receipt
      return NextResponse.redirect(payment.file_url);
    }

    // Generate PDF receipt
    const pdfBuffer = await generateReceiptPDF(payment);
    
    // TODO: Save to file storage and update receipts table
    // For now, return PDF directly
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Receipt-${payment.receipt_no}.pdf"`
      }
    });

  } catch (error: any) {
    console.error('Receipt generation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to generate receipt'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
