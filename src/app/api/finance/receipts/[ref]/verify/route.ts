/**
 * GET /api/finance/receipts/[ref]/verify?t=<token>
 * PUBLIC receipt verification (what the printed QR points to). Token-gated so
 * random receipt-number guessing fails. Returns a minimal genuineness
 * confirmation — never full financial detail.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { verifyReceiptToken } from '@/lib/finance/receiptToken';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const token = new URL(req.url).searchParams.get('t');

  const rows = (await query(
    `SELECT fp.id AS payment_id, fp.amount, fp.receipt_no, fp.created_at AS paid_at,
            sch.name AS school_name, sch.currency,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS learner_name
       -- finance_payments is where recordPayment writes. Reading the retired
       -- fee_payments here meant the QR printed on every receipt resolved to
       -- "not_found" — a genuine receipt reporting itself as unverifiable,
       -- which is worse than having no verification at all.
       FROM finance_payments fp
       JOIN students s  ON s.id = fp.student_id
       JOIN people  p   ON p.id = s.person_id
       JOIN schools sch ON sch.id = s.school_id
      WHERE fp.receipt_no = ? LIMIT 1`,
    [ref],
  )) as any[];

  if (!rows.length) return NextResponse.json({ valid: false, reason: 'not_found' }, { status: 404 });
  const r = rows[0];

  if (!verifyReceiptToken(r.receipt_no, r.payment_id, token)) {
    return NextResponse.json({ valid: false, reason: 'bad_token' }, { status: 403 });
  }

  // Genuine — minimal confirmation only.
  const mask = (name: string) => (name || '').split(' ').map((w, i) => i === 0 ? w : (w ? w[0] + '.' : '')).join(' ');
  return NextResponse.json({
    valid: true,
    receipt_no: r.receipt_no,
    school: r.school_name,
    learner: mask(r.learner_name),
    amount: Number(r.amount),
    currency: r.currency || 'UGX',
    paid_at: r.paid_at,
  });
}
