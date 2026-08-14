import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
import { generateReceiptPDF } from '@/lib/services/ReceiptService';

const SCHOOL = 8002, PID = 60003, REF = 'REC-2608-5558';

async function main() {
  console.log('--- 1. PDF route query (expect exactly 1 row) ---');
  const rows = await query(
    `SELECT fp.*, 0 AS discount_applied, 0 AS tax_amount,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS student_name,
            s.admission_no, c.name AS class_name, t.name AS term_name,
            w.name AS wallet_name, COALESCE(sch.currency,'UGX') AS currency,
            sch.name AS school_name, sch.legal_name, sch.address AS school_address,
            sch.phone AS school_phone, sch.email AS school_email, sch.logo_url,
            r.file_url, r.metadata AS receipt_metadata
       FROM finance_payments fp
       JOIN students s ON s.id = fp.student_id
       JOIN people p ON p.id = s.person_id
       JOIN schools sch ON sch.id = s.school_id
       LEFT JOIN (SELECT student_id, MAX(id) AS id FROM enrollments WHERE status='active' GROUP BY student_id) le ON le.student_id = s.id
       LEFT JOIN enrollments e ON e.id = le.id
       LEFT JOIN classes c ON c.id = e.class_id
       LEFT JOIN (SELECT payment_id, MAX(id) AS id FROM student_ledger WHERE type='credit' GROUP BY payment_id) lsl ON lsl.payment_id = fp.id
       LEFT JOIN student_ledger sl ON sl.id = lsl.id
       LEFT JOIN terms t ON t.id = sl.term_id
       LEFT JOIN wallets w ON w.id = fp.account_id
       LEFT JOIN (SELECT payment_id, MAX(id) AS id FROM receipts GROUP BY payment_id) lr ON lr.payment_id = fp.id
       LEFT JOIN receipts r ON r.id = lr.id
      WHERE fp.id = ? AND fp.school_id = ? LIMIT 1`, [PID, SCHOOL]) as any[];
  console.log('rows:', rows.length, '| learner:', rows[0]?.student_name, '| class:', rows[0]?.class_name, '| term:', rows[0]?.term_name);

  console.log('\n--- 2. generate the PDF from that exact row ---');
  const buf = await generateReceiptPDF(rows[0]);
  console.log('PDF:', buf.length, 'bytes,', buf.subarray(0,5).toString());

  console.log('\n--- 3. receipt PAGE query, by receipt_no (was 404) ---');
  const pg = await query(
    `SELECT fp.id AS payment_id, fp.amount, fp.receipt_no, fp.created_at AS paid_at,
            0 AS discount_applied, 0 AS tax_amount, s.id AS student_id, s.admission_no,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS learner_name,
            c.name AS class_name, st.name AS stream_name, t.name AS term_name,
            ay.name AS year_name, sch.name AS school_name, sch.currency
       FROM finance_payments fp
       JOIN students s ON s.id = fp.student_id AND s.school_id = ?
       JOIN people p ON p.id = s.person_id
       JOIN schools sch ON sch.id = s.school_id
       LEFT JOIN (SELECT student_id, MAX(id) AS id FROM enrollments WHERE status='active' GROUP BY student_id) le ON le.student_id = s.id
       LEFT JOIN enrollments e ON e.id = le.id
       LEFT JOIN classes c ON c.id = e.class_id
       LEFT JOIN streams st ON st.id = e.stream_id
       LEFT JOIN academic_years ay ON ay.id = e.academic_year_id
       LEFT JOIN (SELECT payment_id, MAX(id) AS id FROM student_ledger WHERE type='credit' GROUP BY payment_id) lsl ON lsl.payment_id = fp.id
       LEFT JOIN student_ledger sl ON sl.id = lsl.id
       LEFT JOIN terms t ON t.id = sl.term_id
       LEFT JOIN (SELECT payment_id, MAX(id) AS id FROM receipts GROUP BY payment_id) lr ON lr.payment_id = fp.id
       LEFT JOIN receipts r ON r.id = lr.id
      WHERE (fp.receipt_no = ? OR fp.id = ?) AND fp.school_id = ? LIMIT 1`,
    [SCHOOL, REF, -1, SCHOOL]) as any[];
  console.log('rows:', pg.length, pg.length ? `→ ${pg[0].learner_name}, ${pg[0].class_name}, ${pg[0].currency} ${pg[0].amount}` : 'STILL NOT FOUND');

  console.log('\n--- 4. QR verify query ---');
  const v = await query(
    `SELECT fp.id AS payment_id, fp.amount, fp.receipt_no, sch.name AS school_name
       FROM finance_payments fp JOIN students s ON s.id = fp.student_id
       JOIN people p ON p.id = s.person_id JOIN schools sch ON sch.id = s.school_id
      WHERE fp.receipt_no = ? LIMIT 1`, [REF]) as any[];
  console.log('rows:', v.length, v.length ? '→ verifiable' : 'STILL NOT FOUND');
  process.exit(0);
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
