import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';

// Find every table with a deleted_at column (soft-delete), whether it is
// tenant-scoped (school_id), and how many soft-deleted rows sit there now.
async function main() {
  const tables = await query(
    `SELECT c.TABLE_NAME,
            MAX(CASE WHEN c2.COLUMN_NAME = 'school_id' THEN 1 ELSE 0 END) AS has_school,
            MAX(CASE WHEN c2.COLUMN_NAME = 'restored_at' THEN 1 ELSE 0 END) AS has_restored,
            MAX(CASE WHEN c2.COLUMN_NAME = 'name' THEN 1 ELSE 0 END) AS has_name,
            MAX(CASE WHEN c2.COLUMN_NAME = 'person_id' THEN 1 ELSE 0 END) AS has_person
       FROM INFORMATION_SCHEMA.COLUMNS c
       JOIN INFORMATION_SCHEMA.COLUMNS c2
         ON c2.TABLE_SCHEMA = c.TABLE_SCHEMA AND c2.TABLE_NAME = c.TABLE_NAME
      WHERE c.TABLE_SCHEMA = DATABASE() AND c.COLUMN_NAME = 'deleted_at'
      GROUP BY c.TABLE_NAME
      ORDER BY c.TABLE_NAME`) as any[];

  console.log(`== ${tables.length} tables with deleted_at ==\n`);
  console.log('TABLE'.padEnd(34), 'school', 'restore', 'name', 'person', 'soft-deleted');
  for (const t of tables) {
    let n = 'n/a';
    try {
      const r = await query(`SELECT COUNT(*) c FROM \`${t.TABLE_NAME}\` WHERE deleted_at IS NOT NULL`) as any[];
      n = String(r[0].c);
    } catch { /* ignore */ }
    console.log(
      String(t.TABLE_NAME).padEnd(34),
      String(t.has_school).padEnd(6), String(t.has_restored).padEnd(7),
      String(t.has_name).padEnd(4), String(t.has_person).padEnd(6), n);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
