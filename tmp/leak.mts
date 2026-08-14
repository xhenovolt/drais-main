import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';
const q=async(s:string,p:any[]=[])=>{try{return await query(s,p) as any[]}catch(e:any){return[{__err:e.message}]}};
async function main(){
  console.log('=== who is Abas Jumna? ===');
  console.table(await q(`SELECT p.id person_id, TRIM(CONCAT_WS(' ',p.first_name,p.last_name)) nm,
      s.id student_id, s.school_id AS stu_school, st.id staff_id, st.school_id AS staff_school
    FROM people p
    LEFT JOIN students s ON s.person_id=p.id
    LEFT JOIN staff st ON st.person_id=p.id
    WHERE p.first_name LIKE '%Abas%' OR p.last_name LIKE '%Abas%'
       OR p.first_name LIKE '%Jumna%' OR p.last_name LIKE '%Jumna%'`));

  console.log('=== does attendance_raw_events ever mix schools per device? ===');
  console.table(await q(`SELECT device_sn, COUNT(DISTINCT school_id) schools, COUNT(*) n
     FROM attendance_raw_events GROUP BY device_sn HAVING schools > 1`));

  console.log('=== JIPRA raw events: any person whose OWN school != 12004? ===');
  console.table(await q(`SELECT re.id, re.person_id, re.role_type, re.school_id ev_school,
        COALESCE(s.school_id, st.school_id) AS person_school,
        TRIM(CONCAT_WS(' ',p.first_name,p.last_name)) nm
     FROM attendance_raw_events re
     LEFT JOIN students s ON s.id=re.person_id AND re.role_type='student'
     LEFT JOIN staff st ON st.id=re.person_id AND re.role_type='staff'
     LEFT JOIN people p ON p.id = COALESCE(s.person_id, st.person_id)
    WHERE re.school_id=12004
      AND COALESCE(s.school_id, st.school_id) IS NOT NULL
      AND COALESCE(s.school_id, st.school_id) <> 12004
    LIMIT 10`));
  process.exit(0);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
