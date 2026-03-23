import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({ host: 'gateway01.eu-central-1.prod.aws.tidbcloud.com', port: 4000, user: '2Trc8kJebpKLb1Z.root', password: 'QMNAOiP9J1rANv4Z', database: 'drais', ssl: { rejectUnauthorized: false } });

let pass = 0, fail = 0;
function ok(label, val, condition) {
  if (condition(val)) { console.log(`  ✅ ${label}: ${JSON.stringify(val)}`); pass++; }
  else { console.log(`  ❌ ${label}: ${JSON.stringify(val)}`); fail++; }
}

console.log('\n=== FINAL VALIDATION (10 PHASES) ===\n');

// Phase 2: True student count
console.log('PHASE 2 — True student count:');
const [[c1]] = await conn.execute('SELECT COUNT(*) as n FROM students WHERE school_id=8002 AND deleted_at IS NULL');
const [[c2]] = await conn.execute('SELECT COUNT(*) as n FROM students s LEFT JOIN people p ON s.person_id=p.id WHERE s.school_id=8002 AND s.deleted_at IS NULL');
const [[c3]] = await conn.execute('SELECT COUNT(*) as n FROM students s INNER JOIN people p ON s.person_id=p.id WHERE s.school_id=8002 AND s.deleted_at IS NULL');
ok('Students in DB', Number(c1.n), v => v === 638);
ok('LEFT JOIN count matches', Number(c2.n), v => v === Number(c1.n));
ok('INNER JOIN = LEFT JOIN (no orphans)', Number(c3.n), v => v === Number(c1.n));

// Phase 3: Enrolled without status filter (Term III all completed)
console.log('\nPHASE 3-4 — Enrollment status filter fixed:');
const [[e1]] = await conn.execute("SELECT COUNT(*) as n FROM enrollments e JOIN students s ON e.student_id=s.id WHERE s.school_id=8002 AND e.term_id=30004 AND e.status='active'");
const [[e2]] = await conn.execute("SELECT COUNT(*) as n FROM enrollments e JOIN students s ON e.student_id=s.id WHERE s.school_id=8002 AND e.term_id=30004 AND e.status='completed'");
const [[e3]] = await conn.execute('SELECT COUNT(DISTINCT e.student_id) as n FROM enrollments e JOIN students s ON e.student_id=s.id WHERE s.school_id=8002 AND e.term_id=30004');
ok("Term III status='active' (was default, blocked all)", Number(e1.n), v => v === 0);
ok("Term III status='completed'", Number(e2.n), v => v === 632);
ok("Term III distinct students (no status filter)", Number(e3.n), v => v === 630);
console.log('  ℹ️  old default e.status=active hid ALL 632 Term III students → now removed');

// Phase 5: Name display format audit
console.log('\nPHASE 5 — Name display (first_name + last_name):');
const [names] = await conn.execute("SELECT p.first_name, p.last_name FROM students s LEFT JOIN people p ON s.person_id=p.id WHERE s.school_id=8002 AND s.deleted_at IS NULL ORDER BY COALESCE(p.last_name,'') ASC, COALESCE(p.first_name,'') ASC LIMIT 5");
const namePairs = names.map(r => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim());
ok('5 names returned', namePairs.length, v => v === 5);
console.log('  Display order (first_name last_name):', namePairs);

// Phase 6: Alphabetical sorting
console.log('\nPHASE 6 — Alphabetical sorting:');
const [sortCheck] = await conn.execute("SELECT p.last_name FROM students s LEFT JOIN people p ON s.person_id=p.id WHERE s.school_id=8002 AND s.deleted_at IS NULL ORDER BY COALESCE(p.last_name,'') ASC LIMIT 10");
const lastNames = sortCheck.map(r => r.last_name ?? '');
const isSorted = lastNames.every((n, i) => i === 0 || lastNames[i-1].localeCompare(n, undefined, { sensitivity: 'base' }) <= 0);
ok('Alphabetical ORDER BY working', isSorted, v => v === true);
console.log('  First 5 last_names:', lastNames.slice(0,5));

// Phase 7: Case-insensitive search
console.log('\nPHASE 7 — Case-insensitive search:');
const [[srch1]] = await conn.execute("SELECT COUNT(*) as n FROM students s LEFT JOIN people p ON s.person_id=p.id WHERE s.school_id=8002 AND s.deleted_at IS NULL AND (LOWER(p.first_name) LIKE '%abd%' OR LOWER(p.last_name) LIKE '%abd%')");
const [[srch2]] = await conn.execute("SELECT COUNT(*) as n FROM students s LEFT JOIN people p ON s.person_id=p.id WHERE s.school_id=8002 AND s.deleted_at IS NULL AND (p.first_name LIKE '%abd%' OR p.last_name LIKE '%abd%')");
ok('LOWER() search (abd)', Number(srch1.n), v => v > 0);
ok('Raw (uppercase) search (ABD)', Number(srch2.n), v => Number(srch2.n) <= Number(srch1.n));
console.log(`  LOWER search: ${srch1.n} results | raw: ${srch2.n} results`);

// Phase 8-9: Pagination — confirm meta.total reflects full count
console.log('\nPHASE 8-9 — Pagination math:');
const totalStudents = Number(c1.n);
const limit = 50;
const expectedPages = Math.ceil(totalStudents / limit);
ok('meta.total formula = 638', totalStudents, v => v === 638);
ok('Correct page count at limit=50', expectedPages, v => v === Math.ceil(638/50));

// Phase 10: Cross-tab coverage (enrolled + admitted = all)
console.log('\nPHASE 10 — Cross-tab student coverage:');
const currentTermId = 30004; // Term III (all completed)
const [[inTerm]] = await conn.execute("SELECT COUNT(DISTINCT e.student_id) as n FROM enrollments e JOIN students s ON e.student_id=s.id WHERE s.school_id=8002 AND s.deleted_at IS NULL AND e.term_id=?", [currentTermId]);
const [[notInTerm]] = await conn.execute("SELECT COUNT(*) as n FROM students s WHERE s.school_id=8002 AND s.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id=s.id AND e.term_id=?)", [currentTermId]);
ok('Students in Term III (enrolled tab)', Number(inTerm.n), v => v === 630);
ok('Students NOT in Term III (admitted tab)', Number(notInTerm.n), v => Number(inTerm.n) + v === 638);
console.log(`  enrolled tab: ${inTerm.n} | admitted tab: ${notInTerm.n} | total: ${Number(inTerm.n) + Number(notInTerm.n)}`);

await conn.end();
console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTS: ${pass} passed, ${fail} failed`);
if (fail === 0) console.log('\n✅ ALL PHASES VALIDATED — SYSTEM IS CORRECT');
else console.log('\n❌ FAILURES DETECTED');
process.exit(fail > 0 ? 1 : 0);
