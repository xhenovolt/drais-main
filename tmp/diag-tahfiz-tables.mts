import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
import { readFileSync } from 'node:fs';
async function main() {
  const names = readFileSync('/tmp/t.txt','utf8').split('\n').map(s=>s.trim()).filter(Boolean);
  const rows = await query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE()`) as any[];
  const have = new Set(rows.map((r:any)=>String(r.TABLE_NAME).toLowerCase()));
  const missing = names.filter(n=>!have.has(n));
  console.log('tables referenced by tahfiz routes:', names.length);
  console.log('\n=== REFERENCED BUT DO NOT EXIST ===');
  console.log(missing.length ? missing.map(m=>'  ✗ '+m).join('\n') : '  (none)');
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
