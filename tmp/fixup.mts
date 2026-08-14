import dotenv from 'dotenv'; dotenv.config({path:'.env.local'});
import { query } from '@/lib/db';
(async()=>{
  await query(`DELETE FROM wallets WHERE name='TEST Payroll Wallet'`);
  await query(`DELETE FROM payroll_definitions WHERE name='TEST Basic Salary'`);
  console.log('cleanup done');
  const c=await query(`SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='staff_salaries' ORDER BY ORDINAL_POSITION`) as any[];
  console.log('\nstaff_salaries columns:');
  for(const x of c) console.log(`  ${String(x.COLUMN_NAME).padEnd(16)} ${x.COLUMN_TYPE}${x.IS_NULLABLE==='NO'?' NOT NULL':''}`);
  process.exit(0);})();
