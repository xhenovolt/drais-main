import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
async function main(){
  for (const t of ['audit_log','audit_logs']) {
    const r = await query(`SELECT COUNT(*) n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,[t]) as any[];
    console.log(`  ${t.padEnd(12)} exists: ${Number(r[0].n)===1?'YES':'NO ✗'}`);
  }
  // exact statement the salary payment runs
  try {
    await query(`INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, changes_json, created_at)
                 VALUES (?, 'CREATE', 'SalaryPayment', ?, ?, NOW())`, [1, 1, '{}']);
    console.log('\n  audit INSERT: SUCCEEDED (row written — will clean up)');
    await query(`DELETE FROM audit_log WHERE entity_type='SalaryPayment' AND entity_id=1`);
  } catch(e:any) {
    console.log(`\n  audit INSERT FAILS → ${e.message}`);
    console.log('  → inside the payment transaction this throws, the catch rolls back,');
    console.log('    and EVERY salary payment fails. Wallet never debited, no record kept.');
  }
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
