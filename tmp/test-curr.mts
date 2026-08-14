import dotenv from 'dotenv'; dotenv.config({path:'.env.local'});
import { query } from '@/lib/db';
const S=12004;
async function main(){
  const c=await query(`SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='curriculums' ORDER BY ORDINAL_POSITION`) as any[];
  console.log('curriculums columns:');
  for(const x of c) console.log(`  ${String(x.COLUMN_NAME).padEnd(16)} ${x.COLUMN_TYPE}${x.IS_NULLABLE==='NO'?' NOT NULL':''}`);

  const idx=await query(`SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cols
     FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='curriculums'
     GROUP BY INDEX_NAME, NON_UNIQUE`) as any[];
  console.log('\nindexes:');
  for(const x of idx) console.log(`  ${String(x.INDEX_NAME).padEnd(22)} ${Number(x.NON_UNIQUE)===0?'UNIQUE':'index'}  (${x.cols})`);

  const all=await query(`SELECT id, code, name, school_id FROM curriculums LIMIT 10`) as any[];
  console.log('\nexisting rows platform-wide:'); console.table(all);

  console.log('=== the exact INSERT the API runs ===');
  try{
    const r:any=await query(`INSERT INTO curriculums (code, name, school_id) VALUES (?,?,?)`,['SEC','Secular Curriculum',S]);
    console.log(`  SUCCEEDED id=${r.insertId} — removing`);
    await query(`DELETE FROM curriculums WHERE id=?`,[r.insertId]);
  }catch(e:any){ console.log(`  FAILED → ${e.code}: ${e.message}`); }
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
