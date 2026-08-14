import dotenv from 'dotenv'; dotenv.config({path:'.env.local'});
import { query } from '@/lib/db';
async function main(){
  // New ids are 150006+. tinyint maxes at 127, so any FK column left as
  // tinyint would reject the assignment even though the curriculum exists.
  for (const [t,c] of [['enrollments','curriculum_id'],['student_curriculums','curriculum_id'],['classes','curriculum_id']]) {
    try {
      await query(`ALTER TABLE \`${t}\` MODIFY COLUMN \`${c}\` BIGINT NULL`);
      const a=(await query(`SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,[t,c]) as any[])[0];
      console.log(`  ${t}.${c} → ${a.COLUMN_TYPE} ✓`);
    } catch(e:any){ console.log(`  ${t}.${c} FAILED → ${e.message}`); }
  }

  console.log('\n=== end-to-end: create a curriculum and assign it to a class ===');
  const ins:any=await query(`INSERT INTO curriculums (code, name, school_id) VALUES ('TAH','Tahfiz Curriculum',12004)`);
  const cid=ins.insertId;
  const cls=(await query(`SELECT id, curriculum_id FROM classes WHERE school_id=12004 LIMIT 1`) as any[])[0];
  const prev=cls.curriculum_id;
  await query(`UPDATE classes SET curriculum_id=? WHERE id=?`,[cid,cls.id]);
  const chk=(await query(`SELECT curriculum_id FROM classes WHERE id=?`,[cls.id]) as any[])[0];
  console.log(`  curriculum ${cid} assigned to class ${cls.id} → stored ${chk.curriculum_id} ${String(chk.curriculum_id)===String(cid)?'✓':'✗'}`);
  await query(`UPDATE classes SET curriculum_id=? WHERE id=?`,[prev,cls.id]);
  await query(`DELETE FROM curriculums WHERE id=?`,[cid]);
  console.log('  reverted — production data unchanged');
  process.exit(0);
}
main().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
