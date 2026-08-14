import dotenv from 'dotenv'; dotenv.config({path:'.env.local'});
import { query } from '@/lib/db';
(async()=>{
  const t=await query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE()
    AND (TABLE_NAME LIKE '%expen%' OR TABLE_NAME LIKE '%categor%') ORDER BY TABLE_NAME`) as any[];
  for(const r of t){
    const n=await query(`SELECT COUNT(*) n FROM \`${r.TABLE_NAME}\``) as any[];
    const c=await query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,[r.TABLE_NAME]) as any[];
    console.log(`  ${String(r.TABLE_NAME).padEnd(28)} ${String(n[0].n).padStart(5)} rows | ${c.map((x:any)=>x.COLUMN_NAME).join(', ').slice(0,110)}`);
  }
  process.exit(0);})();
