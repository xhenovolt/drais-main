import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
async function main(){
  // Replicate the session query's EXISTS test for Enoch
  const r = await query(`SELECT
      EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id=r.id
              WHERE ur.user_id=? AND (ur.school_id=? OR ur.school_id IS NULL)
                AND ur.is_active=TRUE AND r.is_active=TRUE
                AND (r.is_super_admin=TRUE OR LOWER(r.slug)='super_admin'
                     OR LOWER(TRIM(r.name)) IN ('super admin','superadmin'))) AS is_super_admin`,
    [360001, 12004]) as any[];
  console.log('session would resolve isSuperAdmin =', r[0].is_super_admin, r[0].is_super_admin==1?'✓ TRUE — API checks are bypassed':'✗ FALSE');

  const ur = await query(`SELECT ur.user_id, ur.role_id, ur.school_id, ur.is_active ur_active,
                                 r.name, r.slug, r.is_super_admin, r.is_active r_active
       FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`,[360001]) as any[];
  console.table(ur);

  const tot = await query(`SELECT COUNT(*) n FROM permissions`) as any[];
  console.log(`\npermissions defined platform-wide: ${tot[0].n}; his role grants 36`);
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
