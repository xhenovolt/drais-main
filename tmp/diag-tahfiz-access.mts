import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
async function main() {
  console.log('=== tahfiz permission grants ===');
  const g = await query(
    `SELECT p.code, COUNT(*) grants FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
      WHERE p.code LIKE 'tahfiz%' GROUP BY p.code ORDER BY p.code`) as any[];
  console.log(g.length ? g.map((r:any)=>`  ${r.code}: ${r.grants}`).join('\n') : '  (NONE GRANTED — only super admins can use Tahfiz)');

  console.log('\n=== schools with tahfiz enabled ===');
  const s = await query(
    `SELECT sm.school_id, sc.name, sm.is_enabled FROM school_modules sm
       LEFT JOIN schools sc ON sc.id = sm.school_id
      WHERE sm.module_code='tahfiz' ORDER BY sm.school_id`) as any[];
  for (const r of s) console.log(`  ${r.school_id} ${String(r.name).slice(0,42).padEnd(44)} enabled=${r.is_enabled}`);
  console.log(`  → ${s.filter((r:any)=>Number(r.is_enabled)===1).length} enabled`);

  console.log('\n=== per-school tahfiz DATA (is anyone actually using it?) ===');
  const d = await query(
    `SELECT school_id,
            (SELECT COUNT(*) FROM tahfiz_enrollments e WHERE e.school_id=x.school_id) enrol,
            (SELECT COUNT(*) FROM tahfiz_groups gg WHERE gg.school_id=x.school_id) grps,
            (SELECT COUNT(*) FROM tahfiz_records r WHERE r.school_id=x.school_id) recs,
            (SELECT COUNT(*) FROM tahfiz_custom_books b WHERE b.school_id=x.school_id AND b.deleted_at IS NULL) books
       FROM (SELECT DISTINCT school_id FROM school_modules WHERE module_code='tahfiz' AND is_enabled=1) x`) as any[];
  console.table(d);
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
