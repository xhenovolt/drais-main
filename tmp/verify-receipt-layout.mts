import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
import { generateReceiptPDF } from '@/lib/services/ReceiptService';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

async function main() {
  const rows = await query(`
    SELECT fp.*, 0 AS discount_applied, 0 AS tax_amount,
           TRIM(CONCAT_WS(' ', p.first_name,' ',p.last_name)) AS student_name, s.admission_no,
           c.name AS class_name, t.name AS term_name, COALESCE(sch.currency,'UGX') AS currency,
           sch.name AS school_name, sch.legal_name, sch.address AS school_address,
           sch.phone AS school_phone, sch.email AS school_email, r.metadata AS receipt_metadata
      FROM finance_payments fp
      JOIN students s ON s.id=fp.student_id JOIN people p ON p.id=s.person_id
      JOIN schools sch ON sch.id=s.school_id
      LEFT JOIN (SELECT student_id, MAX(id) id FROM enrollments WHERE status='active' GROUP BY student_id) le ON le.student_id=s.id
      LEFT JOIN enrollments e ON e.id=le.id LEFT JOIN classes c ON c.id=e.class_id
      LEFT JOIN (SELECT payment_id, MAX(id) id FROM student_ledger WHERE type='credit' GROUP BY payment_id) lsl ON lsl.payment_id=fp.id
      LEFT JOIN student_ledger sl ON sl.id=lsl.id LEFT JOIN terms t ON t.id=sl.term_id
      LEFT JOIN (SELECT payment_id, MAX(id) id FROM receipts GROUP BY payment_id) lr ON lr.payment_id=fp.id
      LEFT JOIN receipts r ON r.id=lr.id
     WHERE fp.id=60003`) as any[];

  const buf = await generateReceiptPDF(rows[0]);
  writeFileSync('/tmp/receipt.pdf', buf);
  console.log('PDF written:', buf.length, 'bytes');
  console.log('school_name:', rows[0].school_name);
  console.log('legal_name :', rows[0].legal_name);

  // Extract text to prove the name appears once and nothing collides.
  try {
    const txt = execFileSync('pdftotext', ['-layout', '/tmp/receipt.pdf', '-'], { encoding: 'utf8' });
    console.log('\n────── rendered text ──────');
    console.log(txt.split('\n').slice(0, 22).join('\n'));
    const norm = (s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
    const hay = norm(txt);
    const needle = norm(rows[0].school_name);
    let count = 0, i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) { count++; i += needle.length; }
    console.log(`\nschool name occurrences in PDF: ${count} ${count === 1 ? '✓' : '← STILL DUPLICATED'}`);
  } catch { console.log('(pdftotext not installed — skipping text check)'); }
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
