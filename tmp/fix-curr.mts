import dotenv from 'dotenv'; dotenv.config({path:'.env.local'});
import { query } from '@/lib/db';
async function main(){
  console.log('=== columns that reference curriculums.id ===');
  const r=await query(`SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME='curriculum_id'`) as any[];
  for(const x of r) console.log(`  ${String(x.TABLE_NAME).padEnd(24)} ${x.COLUMN_NAME} ${x.COLUMN_TYPE}`);

  console.log('\n=== widening curriculums.id tinyint -> bigint ===');
  await query(`ALTER TABLE curriculums MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT`);
  const after=await query(`SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='curriculums' AND COLUMN_NAME='id'`) as any[];
  console.log('  id is now:', after[0].COLUMN_TYPE);

  console.log('\n=== retry the exact INSERT the API runs ===');
  const ins:any=await query(`INSERT INTO curriculums (code, name, school_id) VALUES (?,?,?)`,['SEC','Secular Curriculum',12004]);
  console.log(`  SUCCEEDED id=${ins.insertId} ✓`);
  const row=(await query(`SELECT id, code, name, school_id FROM curriculums WHERE id=?`,[ins.insertId]) as any[])[0];
  console.log('  ', JSON.stringify(row));
  await query(`DELETE FROM curriculums WHERE id=?`,[ins.insertId]);
  console.log('  test row removed — production data unchanged');
  process.exit(0);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
