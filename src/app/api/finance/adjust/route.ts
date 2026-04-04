import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { addDebitEntry, addCreditEntry } from '@/lib/services/FinanceLedger';

// POST /api/finance/adjust
// Body: { student_id, type: 'debit'|'credit', amount, reference, term_id?, notes? }
//
// NEVER overwrites — always adds a new ledger entry.
// debit  → student owes more  (penalty, correction, additional charge)
// credit → student owes less  (waiver, overpayment correction)

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const { student_id, type, amount, reference, term_id, notes } = body;

  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });
  if (!type || !['debit', 'credit'].includes(type)) {
    return NextResponse.json({ error: 'type must be "debit" or "credit"' }, { status: 400 });
  }
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }
  if (!reference?.trim()) {
    return NextResponse.json({ error: 'reference is required (explain why this adjustment)' }, { status: 400 });
  }

  const fn = type === 'debit' ? addDebitEntry : addCreditEntry;
  const ledgerId = await fn({
    studentId: +student_id,
    schoolId: session.schoolId,
    amount: parsedAmount,
    reference: reference.trim(),
    termId: term_id ? +term_id : undefined,
    createdBy: session.userId,
    notes: notes ?? undefined,
  });

  return NextResponse.json({
    ok: true,
    ledger_id: ledgerId,
    message: `Balance adjusted: ${type} of ${parsedAmount.toLocaleString()} added`,
  }, { status: 201 });
}
