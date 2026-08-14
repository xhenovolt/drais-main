import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const q = async (s: string, p: any[] = []) => { try { return await query(s, p) as any[]; } catch (e: any) { return [{ __err: e.message }]; } };
async function main() {
  for (const t of ['zk_attendance_logs','attendance_time_baselines','attendance_time_corrections','devices','attendance_first_arrival_health']) {
    const c = await q(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`, [t]);
    const n = await q(`SELECT COUNT(*) n FROM \`${t}\``);
    console.log(`\n=== ${t} (${n[0]?.n ?? '?'} rows) ===`);
    console.log(c.map((x:any)=>x.COLUMN_NAME).join(', '));
  }
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
