import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { generateReceiptPDF } from '@/lib/services/ReceiptService';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let connection;
  
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
    const schoolId = session.schoolId;

    const resolvedParams = await params;
    const paymentId = parseInt(resolvedParams.id, 10);

    connection = await getConnection();

    // Fetch payment details from the CANONICAL finance_payments table.
    const [payments] = await connection.execute(`
      SELECT
        fp.*,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        s.admission_no,
        c.name as class_name,
        t.name as term_name,
        fa.name as wallet_name,
        COALESCE(sch.currency, 'UGX') as currency,
        sch.name as school_name,
        sch.legal_name,
        sch.address as school_address,
        sch.phone as school_phone,
        sch.email as school_email,
        sch.logo_url,
        r.file_url,
        r.metadata as receipt_metadata
      FROM finance_payments fp
      JOIN students s ON fp.student_id = s.id
      JOIN people p ON s.person_id = p.id
      JOIN schools sch ON s.school_id = sch.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN student_ledger sl ON sl.payment_id = fp.id AND sl.type = 'credit'
      LEFT JOIN terms t ON sl.term_id = t.id
      LEFT JOIN wallets fa ON fp.account_id = fa.id
      LEFT JOIN receipts r ON fp.id = r.payment_id
      WHERE fp.id = ? AND fp.school_id = ?
    `, [paymentId, schoolId]);

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
    // For now, return PDF directly (Uint8Array satisfies BodyInit).
    return new NextResponse(new Uint8Array(pdfBuffer), {
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
