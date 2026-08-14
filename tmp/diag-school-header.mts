import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
async function main() {
  const r = await query(
    `SELECT id, name, legal_name, address, phone,
            CHAR_LENGTH(name) AS name_len,
            (name = legal_name) AS same
       FROM schools WHERE id IN (8002,12004,12011) OR legal_name IS NOT NULL LIMIT 10`) as any[];
  for (const s of r) {
    console.log(`\nschool ${s.id}`);
    console.log(`  name       (${s.name_len} chars): ${s.name}`);
    console.log(`  legal_name              : ${s.legal_name ?? '(null)'}`);
    console.log(`  identical to name?      : ${s.same === null ? 'n/a' : (Number(s.same) === 1 ? 'YES — printed twice' : 'no')}`);
    console.log(`  address                 : ${s.address ?? '(null)'}`);
  }
  const dup = await query(
    `SELECT COUNT(*) n FROM schools WHERE legal_name IS NOT NULL AND TRIM(LOWER(legal_name)) = TRIM(LOWER(name))`) as any[];
  console.log(`\nschools whose legal_name duplicates name: ${dup[0].n}`);
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
