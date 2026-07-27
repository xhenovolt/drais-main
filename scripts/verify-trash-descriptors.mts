/**
 * Trash descriptor verifier — keeps Trash BORING (it can't crash).
 *
 * Runs every registered entity's list SELECT (LIMIT 0) and every dependency
 * table/column reference against the real schema. A bad column like the
 * historical `e.exam_date` fails HERE, loudly, instead of 500-ing the live
 * /admin/trash page. Run before deploy:  npm run trash:verify
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
import { ENTITY_REGISTRY } from '@/lib/trash/registry';

async function main() {
  let broken = 0;
  for (const d of ENTITY_REGISTRY as any[]) {
    const school = d.schoolIdColumn ? `AND e.${d.schoolIdColumn} = 0` : '';
    // 1. The list SELECT must be valid SQL against the real columns.
    try {
      await query(
        `SELECT ${d.displaySelect} FROM \`${d.tableName}\` e ${d.displayJoins ?? ''}
          WHERE e.deleted_at IS NOT NULL ${school} LIMIT 0`);
    } catch (e: any) {
      console.log(`✗ ${d.code}: list query — ${e.message}`);
      broken++;
      continue;
    }
    // 2. Every dependency table + fkColumn must exist (purge blast-radius uses them).
    for (const dep of d.dependencies ?? []) {
      try {
        await query(`SELECT \`${dep.fkColumn}\` FROM \`${dep.tableName}\` WHERE 1=0 LIMIT 0`);
      } catch (e: any) {
        console.log(`✗ ${d.code}: dependency ${dep.tableName}.${dep.fkColumn} — ${e.message}`);
        broken++;
      }
    }
    console.log(`✓ ${d.code}`);
  }
  console.log(`\n${(ENTITY_REGISTRY as any[]).length - 0} descriptors checked, ${broken} problem(s).`);
  process.exit(broken > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
