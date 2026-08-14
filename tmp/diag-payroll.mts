import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const q=async(s:string,p:any[]=[])=>{try{return await query(s,p) as any[]}catch(e:any){return[{__err:e.message}]}};
async function main(){
  const t = await q(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE()
     AND (TABLE_NAME LIKE '%payroll%' OR TABLE_NAME LIKE '%salar%') ORDER BY TABLE_NAME`);
  console.log('=== payroll/salary tables ===');
  if(!t.length||t[0].__err) console.log('  NONE FOUND', t[0]?.__err??'');
  for(const r of t){
    const n = await q(`SELECT COUNT(*) n FROM \`${r.TABLE_NAME}\``);
    const c = await q(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,[r.TABLE_NAME]);
    console.log(`  ${String(r.TABLE_NAME).padEnd(26)} ${String(n[0].n).padStart(6)} rows | ${c.map((x:any)=>x.COLUMN_NAME).join(', ').slice(0,120)}`);
  }
  console.log('\n=== payroll permissions ===');
  const p = await q(`SELECT code FROM permissions WHERE code LIKE 'payroll%' OR code LIKE 'salar%'`);
  console.log('  defined:', p.map((x:any)=>x.code).join(', ')||'(none)');
  const g = await q(`SELECT p.code, COUNT(*) n FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
     WHERE p.code LIKE 'payroll%' OR p.code LIKE 'salar%' GROUP BY p.code`);
  console.log('  granted:', g.map((x:any)=>`${x.code}=${x.n}`).join(', ')||'(NONE GRANTED)');
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
