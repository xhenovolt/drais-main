/**
 * GET /api/finance/payments/[id]/receipt — the receipt PDF for one payment.
 *
 * WHY THIS FILE HAS SO MANY COMMENTS
 * Receipt downloads failed in production for weeks while working perfectly in
 * development, and every distinct cause surfaced as the same sentence:
 * "Failed to download receipt". Three separate defects hid behind it —
 *
 *   1. pdfkit was bundled rather than externalised, so its runtime
 *      `fs.readFileSync(__dirname + '/data/Helvetica.afm')` resolved to a
 *      directory that does not contain fonts. See serverExternalPackages in
 *      next.config.js — the tracing include alone was not enough.
 *   2. requirePermission THROWS. It was called without a try, so a missing
 *      permission fell into the catch below and was reported as a generation
 *      failure — a 403 wearing a 500's clothes.
 *   3. The join fanned out (one payment returned four identical rows) because
 *      a payment can have several ledger credits.
 *
 * The rule this route now follows: never answer with a generic failure. The
 * caller is told which of those things went wrong, because the remedy differs
 * completely and a bursar cannot guess.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { generateReceiptPDF } from '@/lib/services/ReceiptService';
import { getSessionSchoolId } from '@/lib/auth';
import { checkPermission } from '@/lib/rbac';
import { checkModule } from '@/lib/auth/requireModule';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;

  // Return-based, not the throwing variant: a permission problem must leave
  // here as 403 with its own wording, never as a "generation failed" 500.
  const denied = await checkPermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
  if (denied) return denied;

  const { id } = await params;
  const paymentId = Number.parseInt(id, 10);
  if (!Number.isFinite(paymentId)) {
    return NextResponse.json({ error: 'That receipt reference is not valid.' }, { status: 400 });
  }

  try {
    // Each LEFT JOIN below can match more than once for a single payment — a
    // payment may carry several ledger credits, and a learner several
    // enrolments. Joined directly they multiply the row set (this returned 4
    // identical rows for payment 60003 in production). Collapsing each to one
    // id in a derived table keeps it at exactly one row per payment.
    const rows = (await query(
      `SELECT fp.*,
              0                                        AS discount_applied,
              0                                        AS tax_amount,
              TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS student_name,
              s.admission_no,
              c.name                                   AS class_name,
              t.name                                   AS term_name,
              w.name                                   AS wallet_name,
              COALESCE(sch.currency, 'UGX')            AS currency,
              sch.name                                 AS school_name,
              sch.legal_name,
              sch.address                              AS school_address,
              sch.phone                                AS school_phone,
              sch.email                                AS school_email,
              sch.logo_url,
              r.file_url,
              r.metadata                               AS receipt_metadata
         FROM finance_payments fp
         JOIN students s  ON s.id = fp.student_id
         JOIN people   p  ON p.id = s.person_id
         JOIN schools sch ON sch.id = s.school_id
         LEFT JOIN (SELECT student_id, MAX(id) AS id FROM enrollments
                     WHERE status = 'active' GROUP BY student_id) le
                ON le.student_id = s.id
         LEFT JOIN enrollments e ON e.id = le.id
         LEFT JOIN classes    c  ON c.id = e.class_id
         LEFT JOIN (SELECT payment_id, MAX(id) AS id FROM student_ledger
                     WHERE type = 'credit' GROUP BY payment_id) lsl
                ON lsl.payment_id = fp.id
         LEFT JOIN student_ledger sl ON sl.id = lsl.id
         LEFT JOIN terms t ON t.id = sl.term_id
         LEFT JOIN wallets w ON w.id = fp.account_id
         LEFT JOIN (SELECT payment_id, MAX(id) AS id FROM receipts GROUP BY payment_id) lr
                ON lr.payment_id = fp.id
         LEFT JOIN receipts r ON r.id = lr.id
        WHERE fp.id = ? AND fp.school_id = ?
        LIMIT 1`,
      [paymentId, session.schoolId],
    )) as any[];

    if (!rows.length) {
      return NextResponse.json(
        { error: 'No payment with that reference exists for this school.' },
        { status: 404 },
      );
    }

    const payment = rows[0];

    // A receipt already archived to storage is served from there.
    if (payment.file_url) return NextResponse.redirect(payment.file_url);

    const pdf = await generateReceiptPDF(payment);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Receipt-${payment.receipt_no || paymentId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    // Log the stack for us, and hand the caller the provider's own words. A
    // font-loading ENOENT and a bad column name need different people to act.
    console.error('[receipt] generation failed for payment', paymentId, error);
    return NextResponse.json(
      { error: `The receipt could not be produced: ${error?.message ?? 'unknown error'}` },
      { status: 500 },
    );
  }
}
