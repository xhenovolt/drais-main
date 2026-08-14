import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const q=async(s:string,p:any[]=[])=>{try{return await query(s,p) as any[]}catch(e:any){return [{__err:e.message}]}};
async function main(){
  console.log('=== money: which table holds it ===');
  console.table(await q(`SELECT 'finance_payments' t, COUNT(*) n, COUNT(DISTINCT school_id) schools FROM finance_payments
                         UNION ALL SELECT 'fee_payments', COUNT(*), COUNT(DISTINCT student_id) FROM fee_payments`));
  console.log('=== telemetry retention ===');
  console.table(await q(`SELECT COUNT(*) rows_total, MIN(created_at) oldest, MAX(created_at) newest FROM zk_attendance_logs`));
  const t = await q(`SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE()
                      ORDER BY TABLE_ROWS DESC LIMIT 6`);
  console.log('=== largest tables ===');
  for(const r of t) console.log(`  ${String(r.TABLE_NAME).padEnd(34)} ~${r.TABLE_ROWS}`);
  console.log('=== modules enabled with no data (silent-loss risk) ===');
  console.table(await q(`SELECT module_code, COUNT(*) schools_enabled FROM school_modules
                          WHERE is_enabled=1 AND module_code IN ('payroll','tahfiz','library','timetable','cafe')
                          GROUP BY module_code`));
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
