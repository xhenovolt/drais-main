import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
async function main() {
  const p = await query(`SELECT id, code FROM permissions WHERE code LIKE 'audit%'`) as any[];
  console.log('audit permissions:', p.map((x:any)=>x.code).join(', ') || '(none)');
  const g = await query(
    `SELECT p.code, COUNT(*) n FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
      WHERE p.code LIKE 'audit%' GROUP BY p.code`) as any[];
  console.log('grants:', g.map((x:any)=>`${x.code}=${x.n}`).join(', ') || '(NONE)');
  const t = await query(
    `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('audit_logs','control_audit_logs')
        AND COLUMN_NAME IN ('details','metadata','new_values','old_values')`) as any[];
  console.log('\ncolumn types:'); for (const x of t) console.log(' ', x.COLUMN_NAME, '→', x.DATA_TYPE);
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
