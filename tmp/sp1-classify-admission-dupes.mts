import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { query } from '@/lib/db';

// For each colliding (school_id, admission_no), decide if the rows are the SAME
// student (merge) or DISTINCT students (renumber), using person_id + name match.
async function main() {
  const groups = await query(
    `SELECT school_id, admission_no
       FROM students
      WHERE admission_no IS NOT NULL AND TRIM(admission_no) <> '' AND deleted_at IS NULL
      GROUP BY school_id, admission_no HAVING COUNT(*) > 1`) as any[];

  let sameStudent = 0, distinct = 0, ambiguous = 0;
  const bySchool: Record<string, { same: number; distinct: number }> = {};
  const samples: string[] = [];

  for (const g of groups) {
    const rows = await query(
      `SELECT s.id, s.person_id, LOWER(TRIM(CONCAT_WS(' ', p.first_name, p.last_name))) AS name
         FROM students s LEFT JOIN people p ON p.id = s.person_id
        WHERE s.school_id = ? AND s.admission_no = ? AND s.deleted_at IS NULL
        ORDER BY s.id ASC`, [g.school_id, g.admission_no]) as any[];
    const persons = new Set(rows.map(r => String(r.person_id)));
    const names = new Set(rows.map(r => r.name || ''));
    let verdict: 'same' | 'distinct' | 'ambiguous';
    if (persons.size === 1) verdict = 'same';               // literally same person row-linked
    else if (names.size === 1 && !names.has('')) verdict = 'same'; // same name, diff person_id → dup learner
    else if (names.size === rows.length) verdict = 'distinct';     // all different names
    else verdict = 'ambiguous';

    const k = String(g.school_id);
    bySchool[k] = bySchool[k] || { same: 0, distinct: 0 };
    if (verdict === 'same') { sameStudent++; bySchool[k].same++; }
    else if (verdict === 'distinct') { distinct++; bySchool[k].distinct++; }
    else ambiguous++;

    if (samples.length < 12) {
      samples.push(`  [${verdict}] school ${g.school_id} ${g.admission_no}: ` +
        rows.map(r => `#${r.id}(pid=${r.person_id},"${r.name}")`).join('  vs  '));
    }
  }

  console.log(`== 216-row / ${groups.length}-group admission collisions, classified ==`);
  console.log(`  SAME student (→ MERGE):     ${sameStudent} groups`);
  console.log(`  DISTINCT students (→ RENUMBER): ${distinct} groups`);
  console.log(`  AMBIGUOUS (→ manual review): ${ambiguous} groups`);
  console.log(`\n  by school:`);
  for (const [k, v] of Object.entries(bySchool)) console.log(`    school ${k}: same=${v.same} distinct=${v.distinct}`);
  console.log(`\n  samples:`);
  for (const s of samples) console.log(s);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
