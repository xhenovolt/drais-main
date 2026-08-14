import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { ensureAcquisitionSchema } from '@/lib/attendance/acquisition/schema';
import { query } from '@/lib/db';
async function main() {
  await ensureAcquisitionSchema();
  const [t] = [(await query(`SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name LIKE 'attendance_acquisition%'`, []))];
  console.log('tables:', (t as any[]).map((r: any) => r.table_name ?? r.TABLE_NAME).join(', '));
  const e = await query(`SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='attendance_raw_events' AND COLUMN_NAME='source'`, []);
  console.log('source enum:', (e as any[])[0].COLUMN_TYPE);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
