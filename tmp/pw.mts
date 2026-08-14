import dotenv from 'dotenv'; dotenv.config({path:'.env.local'});
import { query } from '@/lib/db';
(async()=>{
  const c=await query(`SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('payroll_definitions','wallets') ORDER BY TABLE_NAME, ORDINAL_POSITION`) as any[];
  let cur='';
  for(const x of c){ if(x.TABLE_NAME!==cur){cur=x.TABLE_NAME;console.log(`\n--- ${cur} ---`);} console.log(`  ${String(x.COLUMN_NAME).padEnd(20)} ${x.COLUMN_TYPE}${x.IS_NULLABLE==='NO'?' NOT NULL':''} default=${x.COLUMN_DEFAULT}`);}
  const w=await query(`SELECT id, school_id, name, balance FROM wallets LIMIT 5`) as any[];
  console.log('\nwallets rows:'); console.table(w);
  process.exit(0);})();
