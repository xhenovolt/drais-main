/**
 * GET /api/finance/receipts/[ref]
 * Canonical receipt payload, reconstructed from the DB (never browser memory).
 * `ref` = receipt_no or payment id. School-scoped. Drives /finance/receipts/[no].
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import { receiptToken } from '@/lib/finance/receiptToken';
import { checkModule } from '@/lib/auth/requireModule';

async function safe<T>(p: Promise<T>, fb: T): Promise<T> { try { return await p; } catch { return fb; } }
const n = (v: any) => (v == null ? 0 : Number(v));

export async function GET(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;
  try { await requirePermission(session.userId, session.schoolId, 'finance.payments.view', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const { ref } = await params;
  const schoolId = session.schoolId;

  // FIX (2026-08): read finance_payments, the table recordPayment actually
  // writes. This query used to select from `fee_payments`, which holds ZERO
  // rows in production — so "View / print receipt", the link offered
  // immediately after taking a payment, returned "Receipt not found" every
  // single time. The balance subquery below had already been repointed at
  // finance_payments; leaving the main query behind meant the route could
  // never reach it. Term comes from the ledger credit, because
  // finance_payments has no term_id of its own; discount and tax are not
  // modelled there and read as zero rather than as a missing column.
  //
  // Derived tables collapse the one-to-many joins to a single row — a payment
  // can have several ledger credits and a learner several enrolments, which
  // otherwise multiply this into duplicate "receipts" for one payment.
  const rows = (await query(
    `SELECT fp.id AS payment_id, fp.amount, fp.method, fp.reference, fp.notes, fp.receipt_no,
            fp.created_at AS paid_at, 0 AS discount_applied, 0 AS tax_amount,
            s.id AS student_id, s.admission_no,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS learner_name,
            c.name AS class_name, st.name AS stream_name,
            t.name AS term_name, ay.name AS year_name,
            sch.name AS school_name, sch.legal_name, sch.address AS school_address,
            sch.phone AS school_phone, sch.email AS school_email, sch.logo_url, sch.currency,
            r.metadata AS receipt_metadata
       FROM finance_payments fp
       JOIN students s  ON s.id = fp.student_id AND s.school_id = ?
       JOIN people  p   ON p.id = s.person_id
       JOIN schools sch ON sch.id = s.school_id
       LEFT JOIN (SELECT student_id, MAX(id) AS id FROM enrollments
                   WHERE status = 'active' GROUP BY student_id) le
              ON le.student_id = s.id
       LEFT JOIN enrollments e ON e.id = le.id
       LEFT JOIN classes c  ON c.id = e.class_id
       LEFT JOIN streams st ON st.id = e.stream_id
       LEFT JOIN academic_years ay ON ay.id = e.academic_year_id
       LEFT JOIN (SELECT payment_id, MAX(id) AS id FROM student_ledger
                   WHERE type = 'credit' GROUP BY payment_id) lsl
              ON lsl.payment_id = fp.id
       LEFT JOIN student_ledger sl ON sl.id = lsl.id
       LEFT JOIN terms t ON t.id = sl.term_id
       LEFT JOIN (SELECT payment_id, MAX(id) AS id FROM receipts GROUP BY payment_id) lr
              ON lr.payment_id = fp.id
       LEFT JOIN receipts r ON r.id = lr.id
      WHERE (fp.receipt_no = ? OR fp.id = ?) AND fp.school_id = ?
      LIMIT 1`,
    [schoolId, ref, /^\d+$/.test(ref) ? Number(ref) : -1, schoolId],
  )) as any[];

  if (!rows.length) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
  const r = rows[0];

  // Balance: expected (assigned fee items) vs paid (all payments) for the learner.
  const [exp, paid] = await Promise.all([
    safe(query(
      `SELECT COALESCE(SUM(fs.amount),0) AS expected FROM student_fee_items sfi
         JOIN fee_structures fs ON fs.id = sfi.fee_structure_id WHERE sfi.student_id = ?`,
      [r.student_id]) as Promise<any[]>, [{ expected: 0 }]),
    // FIX (2026-08): read the CANONICAL payment table. This previously summed
    // the retired `fee_payments` (its own route returns 410), so for any school
    // on the canonical recordPayment path it returned 0 — and every printed
    // receipt showed an outstanding balance equal to the full expected fees,
    // regardless of what the family had already paid.
    safe(query(
      `SELECT COALESCE(SUM(amount),0) AS paid FROM finance_payments
        WHERE student_id = ? AND school_id = ?`,
      [r.student_id, schoolId]) as Promise<any[]>, [{ paid: 0 }]),
  ]);
  const expected = n(exp[0]?.expected);
  const totalPaid = n(paid[0]?.paid);
  const balanceAfter = expected - totalPaid;          // current outstanding
  const balanceBefore = balanceAfter + n(r.amount);   // immediately before this payment

  let receivedBy: string | null = null;
  try {
    const meta = typeof r.receipt_metadata === 'string' ? JSON.parse(r.receipt_metadata) : r.receipt_metadata;
    if (meta?.generated_by) {
      const u = (await query(`SELECT TRIM(CONCAT_WS(' ', first_name, last_name)) AS nm FROM users WHERE id = ? LIMIT 1`, [meta.generated_by])) as any[];
      receivedBy = u[0]?.nm || null;
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    success: true,
    receipt: {
      receipt_no: r.receipt_no, payment_id: r.payment_id,
      verify_token: receiptToken(r.receipt_no, r.payment_id),
      amount: n(r.amount), discount: n(r.discount_applied), tax: n(r.tax_amount),
      method: r.method, reference: r.reference, notes: r.notes, paid_at: r.paid_at,
      balance_before: balanceBefore, balance_after: balanceAfter,
      currency: r.currency || 'UGX',
      received_by: receivedBy,
      learner: { name: r.learner_name, admission_no: r.admission_no, class_name: r.class_name, stream_name: r.stream_name },
      term: r.term_name, year: r.year_name,
      school: { name: r.school_name, legal_name: r.legal_name, address: r.school_address, phone: r.school_phone, email: r.school_email, logo_url: r.logo_url },
    },
  });
}
