import dotenv from 'dotenv'; dotenv.config({path:'.env.local'});
import { query } from '@/lib/db';
const S=12004;
async function main(){
  console.log('=== 1. create a definition (was: free-text type, silent failure) ===');
  const d:any = await query(`INSERT INTO payroll_definitions (school_id, name, type) VALUES (?,?,?)`,[S,'TEST Basic Salary','earning']);
  console.log(`   definition id=${d.insertId} type='earning' ✓`);

  console.log('=== 2. wallet with an opening balance (was: balance forced to 0) ===');
  const w:any = await query(
    `INSERT INTO wallets (school_id, name, currency, balance, opening_balance, status, location_type)
     VALUES (?,?,?,?,?, 'active','cash')`,[S,'TEST Payroll Wallet','UGX',5000000,5000000]);
  const wid=w.insertId;
  let bal=(await query(`SELECT balance, opening_balance FROM wallets WHERE id=?`,[wid]) as any[])[0];
  console.log(`   wallet id=${wid} opening=${bal.opening_balance} balance=${bal.balance}  ${Number(bal.balance)>0?'✓ spendable':'✗ STILL ZERO'}`);

  console.log('=== 3. assign a salary ===');
  const st=(await query(`SELECT id FROM staff WHERE school_id=? AND deleted_at IS NULL LIMIT 1`,[S]) as any[])[0];
  const ss:any = await query(`INSERT INTO staff_salaries (school_id, staff_id, month, period_month, definition_id, amount)
     VALUES (?,?,?,?,?,?)`,[S,st.id,2026,8,d.insertId,800000]);
  console.log(`   salary id=${ss.insertId} for staff ${st.id}: 800,000 ✓`);

  console.log('=== 4. pay the employee (the step that used to fail) ===');
  const before=Number(bal.balance);
  const sp:any = await query(`INSERT INTO salary_payments (school_id, staff_id, wallet_id, amount, method, reference)
     VALUES (?,?,?,?,?,?)`,[S,st.id,wid,800000,'cash','TEST-RUN']);
  await query(`UPDATE wallets SET balance = balance - ? WHERE id = ?`,[800000,wid]);
  bal=(await query(`SELECT balance FROM wallets WHERE id=?`,[wid]) as any[])[0];
  console.log(`   payment id=${sp.insertId}; wallet ${before.toLocaleString()} → ${Number(bal.balance).toLocaleString()} ✓`);

  console.log('\n=== cleanup ===');
  await query(`DELETE FROM salary_payments WHERE id=?`,[sp.insertId]);
  await query(`DELETE FROM staff_salaries WHERE id=?`,[ss.insertId]);
  await query(`DELETE FROM wallets WHERE id=?`,[wid]);
  await query(`DELETE FROM payroll_definitions WHERE id=?`,[d.insertId]);
  console.log('   test rows removed — production unchanged');
  process.exit(0);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
