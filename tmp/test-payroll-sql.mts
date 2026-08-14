import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const S = 12004;
const t=async(label:string,s:string,p:any[]=[])=>{try{const r=await query(s,p) as any[];console.log(`  OK   ${label} → ${Array.isArray(r)?r.length:'-'} row(s)`);}catch(e:any){console.log(`  FAIL ${label} → ${e.message}`);}};
async function main(){
  console.log('=== staff_salaries GET ===');
  await t('list', `SELECT ss.id, ss.staff_id, ss.month, ss.period_month, ss.definition_id, ss.amount,
      CONCAT(p.first_name,' ',p.last_name) staff_name, pd.name definition_name, pd.type definition_type
      FROM staff_salaries ss JOIN staff s ON ss.staff_id=s.id
      LEFT JOIN people p ON s.person_id=p.id
      LEFT JOIN payroll_definitions pd ON ss.definition_id=pd.id
      WHERE ss.school_id=? ORDER BY ss.month DESC, ss.period_month DESC, ss.id DESC`,[S]);

  console.log('=== salary_payments GET ===');
  await t('list', `SELECT sp.id, sp.staff_id, sp.wallet_id, sp.amount, sp.method, sp.reference, sp.paid_at,
      CONCAT(p.first_name,' ',p.last_name) staff_name, w.name wallet_name
      FROM salary_payments sp JOIN staff s ON sp.staff_id=s.id
      LEFT JOIN people p ON s.person_id=p.id LEFT JOIN wallets w ON sp.wallet_id=w.id
      WHERE sp.school_id=? AND sp.deleted_at IS NULL ORDER BY sp.paid_at DESC`,[S]);

  console.log('=== payroll_definitions GET ===');
  await t('list', `SELECT * FROM payroll_definitions WHERE school_id=? AND deleted_at IS NULL`,[S]);

  console.log('=== supporting data the pages need ===');
  const st = await query(`SELECT COUNT(*) n FROM staff WHERE school_id=? AND deleted_at IS NULL`,[S]) as any[];
  const w  = await query(`SELECT COUNT(*) n FROM wallets WHERE school_id=?`,[S]).catch(()=>[{n:'ERR'}]) as any[];
  console.log(`  staff at JIPRA: ${st[0].n}   wallets: ${w[0].n}`);
  console.log('  → payroll needs staff (have) + a wallet to pay FROM');
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
