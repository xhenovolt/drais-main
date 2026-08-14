import dotenv from 'dotenv'; dotenv.config({path:'.env.local'});
import { query } from '@/lib/db';
(async()=>{
 const t=await query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE '%backup%'`) as any[];
 for(const x of t){const n=await query(`SELECT COUNT(*) n FROM \`${x.TABLE_NAME}\``) as any[];console.log(`  ${x.TABLE_NAME}: ${n[0].n} rows`);}
 if(!t.length) console.log('  (no backup tables)');
 process.exit(0);})();
