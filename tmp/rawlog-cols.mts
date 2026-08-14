import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
async function main(){
  for (const t of ['zk_raw_logs','zk_parsed_logs','zk_device_logs']) {
    const c = await query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,[t]) as any[];
    const has = c.some((x:any)=>x.COLUMN_NAME==='school_id');
    const n = await query(`SELECT COUNT(*) n FROM \`${t}\``) as any[];
    console.log(`${t.padEnd(16)} rows=${String(n[0].n).padStart(7)}  school_id: ${has?'YES ✓':'NO ✗'}   cols: ${c.map((x:any)=>x.COLUMN_NAME).join(', ').slice(0,110)}`);
  }
  const s = await query(`SELECT school_id, COUNT(*) n FROM zk_raw_logs GROUP BY school_id ORDER BY n DESC LIMIT 5`).catch(()=>[{__err:1}]) as any[];
  console.log('\nzk_raw_logs by school:', JSON.stringify(s));
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
