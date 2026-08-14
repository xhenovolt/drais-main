import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
async function main() {
  const r = await query(`SELECT id, payment_id, metadata FROM receipts ORDER BY id DESC LIMIT 5`) as any[];
  for (const x of r) {
    let m: any = x.metadata;
    if (typeof m === 'string') { try { m = JSON.parse(m); } catch {} }
    console.log(`receipt ${x.id} (payment ${x.payment_id}): metadata=${m ? JSON.stringify(m).slice(0,120) : 'NULL'} | has items? ${m && m.items ? 'YES' : 'NO'}`);
  }
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
