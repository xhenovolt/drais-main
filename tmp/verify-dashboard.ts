import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getDashboardAttendanceCounts } from '@/lib/attendance/dashboard-counts';
async function main() {
  for (const date of ['2026-07-22', '2026-07-21', undefined]) {
    const c = await getDashboardAttendanceCounts(12004, date as any);
    console.log(c.date, '→ staff:', JSON.stringify(c.staff), 'students:', JSON.stringify(c.students));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
