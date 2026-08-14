import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const q=async(s:string,p:any[]=[])=>{try{return await query(s,p) as any[]}catch(e:any){return[{__err:e.message}]}};
async function main(){
  console.log('=== device GED7254601154 rows per school ===');
  console.table(await q(`SELECT re.school_id, sc.name, COUNT(*) n, MIN(re.ingested_at) first_seen, MAX(re.ingested_at) last_seen
     FROM attendance_raw_events re LEFT JOIN schools sc ON sc.id=re.school_id
    WHERE re.device_sn='GED7254601154' GROUP BY re.school_id, sc.name ORDER BY n DESC`));

  console.log('=== name search, looser ===');
  console.table(await q(`SELECT p.id, TRIM(CONCAT_WS(' ',p.first_name,p.last_name)) nm,
      COALESCE(s.school_id, st.school_id) school
    FROM people p LEFT JOIN students s ON s.person_id=p.id LEFT JOIN staff st ON st.person_id=p.id
   WHERE p.first_name LIKE '%Aba%' OR p.last_name LIKE '%Jum%' LIMIT 12`));

  console.log('=== display_name on JIPRA raw events today ===');
  console.table(await q(`SELECT display_name, role_type, person_id, COUNT(*) n
     FROM attendance_raw_events WHERE school_id=12004
       AND ingested_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)
     GROUP BY display_name, role_type, person_id ORDER BY n DESC LIMIT 10`));
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
