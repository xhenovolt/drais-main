import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
async function main() {
  const S = 12004; // JIPRA
  const n = await query(`SELECT COUNT(*) c FROM audit_logs WHERE school_id=?`, [S]) as any[];
  console.log('JIPRA audit rows:', n[0].c);

  const rows = await query(
    `SELECT id, action, action_type, entity_type, entity_id, details, ip_address, user_agent, source, created_at
       FROM audit_logs WHERE school_id=? ORDER BY id DESC LIMIT 6`, [S]) as any[];
  for (const r of rows) {
    console.log(`\n#${r.id} ${r.action} entity=${r.entity_type}/${r.entity_id}`);
    console.log('  typeof details:', typeof r.details, '| isArray:', Array.isArray(r.details));
    const s = typeof r.details === 'string' ? r.details : JSON.stringify(r.details);
    console.log('  details:', String(s).slice(0, 220));
    console.log('  String(details) →', String(r.details).slice(0, 60));
  }
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
