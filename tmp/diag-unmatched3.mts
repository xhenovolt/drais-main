import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';

const schoolId = 12004;

// Simulate the NEW behaviour: badge (baseWhere, no tab) vs list (baseWhere + tab)
// under a date filter, proving they now agree.
async function scenario(label: string, extra: string, extraParams: any[]) {
  const base = `ar.school_id = ?${extra}`;
  const params = [schoolId, ...extraParams];
  const badge = await query(
    `SELECT SUM(CASE WHEN ar.matched = 0 OR ar.person_id IS NULL THEN 1 ELSE 0 END) AS unmatched
       FROM attendance_raw_events ar
       LEFT JOIN people p ON ar.person_id = p.id
      WHERE ${base}`, params) as any[];
  const list = await query(
    `SELECT COUNT(*) AS total
       FROM attendance_raw_events ar
       LEFT JOIN people p ON ar.person_id = p.id
      WHERE ${base} AND (ar.matched = 0 OR ar.person_id IS NULL)`, params) as any[];
  console.log(`${label}: badge.unmatched=${badge[0].unmatched ?? 0}  list.total=${list[0].total}  ${String(badge[0].unmatched ?? 0) === String(list[0].total) ? 'AGREE ✓' : 'MISMATCH ✗'}`);
}

async function main() {
  await scenario('no filter        ', '', []);
  await scenario('today (2026-07-27)', ' AND DATE(DATE_ADD(ar.punch_at, INTERVAL 180 MINUTE)) = ?', ['2026-07-27']);
  await scenario('2026-07-17       ', ' AND DATE(DATE_ADD(ar.punch_at, INTERVAL 180 MINUTE)) = ?', ['2026-07-17']);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
