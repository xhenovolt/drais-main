import dotenv from 'dotenv'; dotenv.config({path:'.env.local'});
import { query } from '@/lib/db';
const S=12004;
const q=async(s:string,p:any[]=[])=>{try{return await query(s,p) as any[]}catch(e:any){return[{__err:e.message}]}};
async function main(){
  console.log('=== counts at JIPRA ===');
  for(const t of ['curriculums','programs','classes']){
    const r=await q(`SELECT COUNT(*) n FROM \`${t}\` WHERE school_id=?`,[S]);
    console.log(`  ${t.padEnd(13)} ${r[0].__err? 'ERR '+r[0].__err : r[0].n}`);
  }
  console.log('\n=== programs DELETE is a soft delete (is_active=0) — does the list still show them? ===');
  const g = await q(`SELECT id, name, display_name, is_active FROM programs WHERE school_id=? LIMIT 5`,[S]);
  console.table(g);

  console.log('=== curriculum delete: blocked by classes referencing it? ===');
  const fk = await q(`SELECT c.curriculum_id, COUNT(*) classes FROM classes c
      WHERE c.school_id=? AND c.curriculum_id IS NOT NULL GROUP BY c.curriculum_id`,[S]);
  console.log('  classes per curriculum:', JSON.stringify(fk));

  console.log('=== does programs GET filter is_active? ===');
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
