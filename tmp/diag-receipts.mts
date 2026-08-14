import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';

const c = async (sql: string, p: any[] = []) => {
  try { const r = await query(sql, p) as any[]; return r; }
  catch (e: any) { return [{ __err: e.message }]; }
};

async function main() {
  console.log('=== payment tables ===');
  for (const t of ['finance_payments', 'fee_payments', 'receipts', 'student_ledger']) {
    const r = await c(`SELECT COUNT(*) n FROM \`${t}\``);
    console.log(`${t.padEnd(18)}`, r[0].__err ? 'ERR: ' + r[0].__err : r[0].n + ' rows');
  }

  console.log('\n=== newest finance_payments ===');
  const fp = await c(`SELECT id, school_id, student_id, receipt_no, amount, created_at
                        FROM finance_payments ORDER BY id DESC LIMIT 5`);
  console.table(fp);

  console.log('\n=== newest fee_payments ===');
  const q = await c(`SELECT id, student_id, receipt_no, amount, created_at
                       FROM fee_payments ORDER BY id DESC LIMIT 5`);
  console.table(q);

  console.log('\n=== receipts rows (file_url present?) ===');
  const r = await c(`SELECT id, payment_id, file_url IS NULL AS no_url, LEFT(COALESCE(file_url,''),60) url
                       FROM receipts ORDER BY id DESC LIMIT 5`);
  console.table(r);

  // Exactly the receipt-PDF route's query, for the newest payment.
  if (fp.length && !fp[0].__err) {
    const { id, school_id } = fp[0];
    console.log(`\n=== PDF route query for payment ${id} (school ${school_id}) ===`);
    const rows = await c(`
      SELECT fp.id, fp.receipt_no, r.file_url,
             CONCAT(p.first_name,' ',p.last_name) student_name, sch.name school_name
        FROM finance_payments fp
        JOIN students s ON fp.student_id = s.id
        JOIN people p ON s.person_id = p.id
        JOIN schools sch ON s.school_id = sch.id
        LEFT JOIN enrollments e ON s.id = e.student_id AND e.status='active'
        LEFT JOIN classes c ON e.class_id = c.id
        LEFT JOIN student_ledger sl ON sl.payment_id = fp.id AND sl.type='credit'
        LEFT JOIN terms t ON sl.term_id = t.id
        LEFT JOIN wallets fa ON fp.account_id = fa.id
        LEFT JOIN receipts r ON fp.id = r.payment_id
       WHERE fp.id = ? AND fp.school_id = ?`, [id, school_id]);
    console.log(rows[0]?.__err ? 'QUERY FAILED → ' + rows[0].__err : `${rows.length} row(s)`);
    if (!rows[0]?.__err) console.table(rows);

    console.log(`\n=== /api/finance/receipts/[ref] query (fee_payments) for receipt_no=${fp[0].receipt_no} ===`);
    const alt = await c(
      `SELECT fp.id FROM fee_payments fp JOIN students s ON s.id=fp.student_id AND s.school_id=?
        WHERE (fp.receipt_no = ? OR fp.id = ?) LIMIT 1`,
      [school_id, fp[0].receipt_no, -1]);
    console.log(alt[0]?.__err ? 'ERR ' + alt[0].__err : `${alt.length} row(s) — ${alt.length ? 'found' : 'NOT FOUND (page would 404)'}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
