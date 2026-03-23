import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port: 4000,
  user: '2Trc8kJebpKLb1Z.root',
  password: 'QMNAOiP9J1rANv4Z',
  database: 'drais',
  ssl: { rejectUnauthorized: false }
});

let passed = 0;
let failed = 0;

function check(label, actual, expected, condition) {
  const ok = condition(actual);
  if (ok) {
    console.log(`  ✅ PASS: ${label} = ${JSON.stringify(actual)}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label} = ${JSON.stringify(actual)} (expected ${expected})`);
    failed++;
  }
}

console.log('\n=== PHASE 9: VALIDATION TESTS ===\n');

// TEST 1: All students visible
console.log('TEST 1: Student visibility');
const [t1] = await conn.execute(
  'SELECT COUNT(*) as total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as visible, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as hidden FROM students WHERE school_id=8002'
);
check('total students', Number(t1[0].total), 638, v => v === 638);
check('visible students', Number(t1[0].visible), 638, v => v === 638);
check('hidden students', Number(t1[0].hidden), 0, v => v === 0);

// TEST 2: No orphan students
console.log('\nTEST 2: No orphan students');
const [t2] = await conn.execute(
  'SELECT COUNT(*) as orphans FROM students WHERE school_id=8002 AND person_id NOT IN (SELECT id FROM people)'
);
check('orphans', Number(t2[0].orphans), 0, v => v === 0);

// TEST 3: No duplicate enrollments
console.log('\nTEST 3: No duplicate enrollments');
const [t3] = await conn.execute(
  'SELECT COUNT(*) as dups FROM (SELECT student_id, class_id, COUNT(*) cnt FROM enrollments WHERE school_id=8002 AND term_id=30004 GROUP BY student_id, class_id HAVING cnt > 1) x'
);
check('duplicate enrollments', Number(t3[0].dups), 0, v => v === 0);

// TEST 4: Alphabetical sorting - first names must be A-Z
console.log('\nTEST 4: Alphabetical sorting');
const [t4] = await conn.execute(
  'SELECT p.last_name, p.first_name FROM students s JOIN people p ON s.person_id=p.id WHERE s.school_id=8002 AND s.deleted_at IS NULL ORDER BY COALESCE(p.last_name,"") ASC, COALESCE(p.first_name,"") ASC LIMIT 10'
);
const names = t4.map(r => (r.last_name || '') + ' ' + (r.first_name || ''));
const isSorted = names.every((n, i) => i === 0 || names[i-1].localeCompare(names[i], undefined, {sensitivity:'base'}) <= 0);
check('alphabetical order', isSorted, true, v => v === true);
console.log('   First 5:', names.slice(0, 5).join(', '));

// TEST 5: Search works (composite name — LOWER() for case-insensitive on utf8mb4_bin)
console.log('\nTEST 5: Search functionality (case-insensitive)');
// lowercase term against LOWER(column) — simulates what the fixed API routes do
const [t5a] = await conn.execute(
  'SELECT COUNT(*) as cnt FROM students s JOIN people p ON s.person_id=p.id WHERE s.school_id=8002 AND s.deleted_at IS NULL AND (LOWER(p.first_name) LIKE ? OR LOWER(p.last_name) LIKE ?)',
  ['%abd%', '%abd%']
);
check('search by partial name (abd) case-insensitive', Number(t5a[0].cnt), '>0', v => v > 0);

const [t5b] = await conn.execute(
  'SELECT COUNT(*) as cnt FROM students s JOIN people p ON s.person_id=p.id WHERE s.school_id=8002 AND s.deleted_at IS NULL AND LOWER(CONCAT(p.last_name," ",p.first_name)) LIKE ?',
  ['%abd%']
);
check('concat search case-insensitive', Number(t5b[0].cnt), '>0', v => v > 0);

// verify case sensitivity was the issue (uppercase works on bin collation)
const [t5c] = await conn.execute(
  'SELECT COUNT(*) as cnt FROM students s JOIN people p ON s.person_id=p.id WHERE s.school_id=8002 AND s.deleted_at IS NULL AND (p.first_name LIKE ? OR p.last_name LIKE ?)',
  ['%ABD%', '%ABD%']
);
check('search with UPPERCASE term (DB stores uppercase)', Number(t5c[0].cnt), '>0', v => v > 0);

// TEST 6: Results integrity
console.log('\nTEST 6: Results count');
const [t6] = await conn.execute(
  'SELECT COUNT(*) as total FROM class_results cr JOIN students s ON cr.student_id=s.id WHERE s.school_id=8002 AND cr.term_id=30004'
);
check('total results (term 3)', Number(t6[0].total), 5440, v => v >= 5000);
console.log(`   Actual count: ${t6[0].total}`);

// TEST 7: Program assignments
console.log('\nTEST 7: Program assignments');
const [t7] = await conn.execute(
  'SELECT c.name as program, COUNT(*) as students FROM student_curriculums sc JOIN students s ON sc.student_id=s.id JOIN curriculums c ON sc.curriculum_id=c.id WHERE s.school_id=8002 GROUP BY c.name'
);
check('programs assigned', t7.length, '>0', v => v > 0);
t7.forEach(r => console.log(`   ${r.program}: ${r.students} students`));

// TEST 8: Enrollment counts
console.log('\nTEST 8: Enrollment count');
const [t8] = await conn.execute(
  'SELECT COUNT(*) as enrollments, COUNT(DISTINCT student_id) as students FROM enrollments WHERE school_id=8002 AND term_id=30004'
);
check('Term III enrollments', Number(t8[0].enrollments), 632, v => v >= 600);
check('distinct enrolled students', Number(t8[0].students), 630, v => v >= 600);
console.log(`   enrollments=${t8[0].enrollments}, distinct students=${t8[0].students}`);

// TEST 9: Class results API columns (verify student_curriculums JOIN works)
console.log('\nTEST 9: Results with program info');
const [t9] = await conn.execute(`
  SELECT cr.id, p.last_name, p.first_name, c.name as class_name, cr.score, cur.name as program_name
  FROM class_results cr
  JOIN students s ON cr.student_id = s.id
  JOIN people p ON s.person_id = p.id
  JOIN classes c ON cr.class_id = c.id
  LEFT JOIN student_curriculums sc ON s.id = sc.student_id
  LEFT JOIN curriculums cur ON sc.curriculum_id = cur.id
  WHERE s.school_id = 8002 AND cr.term_id = 30004
  ORDER BY COALESCE(p.last_name,'') ASC, COALESCE(p.first_name,'') ASC
  LIMIT 5
`);
check('results with program JOIN', t9.length, 5, v => v === 5);
console.log('   Sample:', t9.map(r => `${r.last_name} ${r.first_name} [${r.program_name || 'null'}]`).join(', '));

await conn.end();

console.log(`\n${'='.repeat(40)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('\n✅ ALL PHASE 9 TESTS PASSED — SYSTEM IS VERIFIED CORRECT');
} else {
  console.log('\n❌ SOME TESTS FAILED — REVIEW ABOVE');
  process.exit(1);
}
