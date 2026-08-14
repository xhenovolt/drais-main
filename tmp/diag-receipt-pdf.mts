import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
import { generateReceiptPDF } from '@/lib/services/ReceiptService';

async function main() {
  const rows = await query(`
    SELECT fp.*, CONCAT(p.first_name,' ',p.last_name) student_name, s.admission_no,
           c.name class_name, t.name term_name, COALESCE(sch.currency,'UGX') currency,
           sch.name school_name, sch.legal_name, sch.address school_address,
           sch.phone school_phone, sch.email school_email, sch.logo_url
      FROM finance_payments fp
      JOIN students s ON fp.student_id = s.id
      JOIN people p ON s.person_id = p.id
      JOIN schools sch ON s.school_id = sch.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status='active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN student_ledger sl ON sl.payment_id = fp.id AND sl.type='credit'
      LEFT JOIN terms t ON sl.term_id = t.id
     WHERE fp.id = 60003 LIMIT 1`) as any[];
  console.log('row:', rows.length ? 'found ' + rows[0].receipt_no : 'NONE');
  try {
    const buf = await generateReceiptPDF(rows[0]);
    console.log('PDF OK —', buf.length, 'bytes, header:', buf.subarray(0, 5).toString());
  } catch (e: any) {
    console.log('PDF FAILED →', e?.message);
    console.log(e?.stack?.split('\n').slice(0, 6).join('\n'));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
