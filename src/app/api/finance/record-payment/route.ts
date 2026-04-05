import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { recordPayment } from '@/lib/services/FinanceLedger';

// POST /api/finance/record-payment
// Body: { student_id, amount, method?, account_id?, reference?, receipt_no?,
//         paid_by?, payer_contact?, term_id?, notes? }
// → Creates finance_payments row + student_ledger credit entry atomically

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const { student_id, amount } = body;

  if (!student_id || !amount) {
    return NextResponse.json({ error: 'student_id and amount are required' }, { status: 400 });
  }
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const validMethods = ['cash', 'bank_transfer', 'mpesa', 'airtel', 'card', 'cheque', 'other'];
  if (body.method && !validMethods.includes(body.method)) {
    return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
  }

  try {
    const result = await recordPayment({
      studentId: +student_id,
      schoolId: session.schoolId,
      amount: parsedAmount,
      method: body.method,
      accountId: body.account_id ? +body.account_id : undefined,
      reference: body.reference,
      receiptNo: body.receipt_no,
      paidBy: body.paid_by,
      payerContact: body.payer_contact,
      termId: body.term_id ? +body.term_id : undefined,
      notes: body.notes,
      createdBy: session.userId,
    });

    return NextResponse.json({
      success: true,
      message: `Payment of ${parsedAmount.toLocaleString()} recorded — Receipt ${result.receiptNo}`,
      data: result,
    }, { status: 201 });
  } catch (err: any) {
    console.error('[record-payment]', err);
    return NextResponse.json({ success: false, message: 'Failed to record payment', error: err.message }, { status: 500 });
  }
}
