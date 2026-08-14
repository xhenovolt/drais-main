import dotenv from 'dotenv'; dotenv.config({path:'.env.local'});
import { query } from '@/lib/db';
(async()=>{for(const t of ['audit_log','audit_logs']){const r=await query(`SELECT COUNT(*) n FROM \`${t}\``) as any[];console.log(`  ${t}: ${r[0].n} rows`);}process.exit(0);})();
