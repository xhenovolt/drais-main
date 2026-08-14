import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const q=async(s:string,p:any[]=[])=>{try{return await query(s,p) as any[]}catch(e:any){return [{__err:e.message}]}};
async function main(){
  console.log('=== where does is_super_admin live? ===');
  const c = await q(`SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME LIKE '%super%'`);
  for(const x of c) console.log(`  ${x.TABLE_NAME}.${x.COLUMN_NAME}`);

  console.log('\n=== Katiti Enoch ===');
  const u = await q(`SELECT u.id, u.username, u.email, u.school_id, u.is_active,
                            TRIM(CONCAT_WS(' ',u.first_name,u.last_name)) nm
       FROM users u WHERE u.email LIKE '%enoch%' OR u.username LIKE '%enoch%'
          OR u.first_name LIKE '%Katiti%' OR u.last_name LIKE '%Katiti%'
          OR u.first_name LIKE '%Enoch%' OR u.last_name LIKE '%Enoch%'`);
  console.table(u);

  for (const usr of u) {
    if (usr.__err) { console.log(usr.__err); break; }
    console.log(`\n--- user ${usr.id} (${usr.nm} / ${usr.email}) school ${usr.school_id} ---`);
    const roles = await q(`SELECT r.id, r.name, r.is_super_admin
        FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?`,[usr.id]);
    console.log('  roles:', JSON.stringify(roles));
    const perms = await q(`SELECT COUNT(DISTINCT p.code) n FROM user_roles ur
        JOIN role_permissions rp ON rp.role_id=ur.role_id
        JOIN permissions p ON p.id=rp.permission_id WHERE ur.user_id=?`,[usr.id]);
    console.log('  distinct permissions granted:', perms[0]?.n ?? perms[0]?.__err);
  }
  console.log('\n=== roles at JIPRA (12004) and their permission counts ===');
  console.table(await q(`SELECT r.id, r.name, r.is_super_admin, COUNT(rp.permission_id) perms
      FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id
     WHERE r.school_id=12004 GROUP BY r.id, r.name, r.is_super_admin ORDER BY perms DESC LIMIT 10`));
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
