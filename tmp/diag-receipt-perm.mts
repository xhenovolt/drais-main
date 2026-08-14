import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const c = async (s: string, p: any[] = []) => { try { return await query(s, p) as any[]; } catch (e: any) { return [{ __err: e.message }]; } };

async function main() {
  console.log('=== finance.* permissions DEFINED ===');
  console.table(await c(`SELECT id, code FROM permissions WHERE code LIKE 'finance%' ORDER BY code`));

  console.log('\n=== finance.* permissions GRANTED (any role, any school) ===');
  console.table(await c(
    `SELECT p.code, COUNT(*) grants FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
      WHERE p.code LIKE 'finance%' GROUP BY p.code ORDER BY p.code`));

  console.log('\n=== is finance.view granted to ANYONE? ===');
  const v = await c(
    `SELECT COUNT(*) n FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
      WHERE p.code = 'finance.view'`);
  console.log(v[0].__err ? v[0].__err : `finance.view grants: ${v[0].n}`);

  console.log('\n=== users at school 8002 who are NOT super admin, with finance roles ===');
  console.table(await c(
    `SELECT u.id, u.username, u.is_super_admin, r.name role
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.school_id = 8002 LIMIT 12`));

  console.log('\n=== module enabled for school 8002? ===');
  console.table(await c(
    `SELECT module_key, enabled FROM school_modules WHERE school_id = 8002 AND module_key IN ('finance','tahfiz','payroll','library')`));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
