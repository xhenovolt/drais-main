#!/usr/bin/env node
/**
 * Phase 2 portal security tests — cross-parent isolation.
 * Sets up Parent A -> Student X and Parent B -> Student Y (school 12011) and
 * asserts, using the EXACT authorization predicates each route runs, that:
 *   - A can see X but NOT Y (and vice versa)
 *   - the per-student gate denies the non-linked learner
 *   - snapshot prune allow-list excludes peers
 *   - context/school rejects a school the parent has no active link in
 *   - pending links grant nothing
 *   - fees visibility toggle hides finances when off
 * Test rows are clearly marked and removed in finally.
 */
import { createConnection } from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';

const env = await readFile('.env.local', 'utf8');
for (const l of env.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const c = await createConnection({ host: process.env.TIDB_HOST, port: +(process.env.TIDB_PORT||4000), user: process.env.TIDB_USER, password: process.env.TIDB_PASSWORD, database: process.env.TIDB_DB||'drais', ssl: { rejectUnauthorized: false } });

const SCHOOL = 12011;
let pass = 0, fail = 0;
const ok  = (m) => { console.log('  ✓ ' + m); pass++; };
const bad = (m) => { console.log('  ✗ ' + m); fail++; };
const assert = (cond, m) => cond ? ok(m) : bad(m);

// gate predicates (mirror src/lib/portal/guard.ts exactly)
const authorizedIds = async (pid, sid) => (await c.query(
  `SELECT student_id FROM parent_student_links WHERE parent_account_id=? AND school_id=? AND status='active'`, [pid, sid]))[0].map(r => Number(r.student_id));
const canView = async (pid, sid, stu) => ((await c.query(
  `SELECT 1 FROM parent_student_links WHERE parent_account_id=? AND school_id=? AND student_id=? AND status='active' LIMIT 1`, [pid, sid, stu]))[0]).length > 0;
const hasSchool = async (pid, sid) => ((await c.query(
  `SELECT 1 FROM parent_student_links WHERE parent_account_id=? AND school_id=? AND status='active' LIMIT 1`, [pid, sid]))[0]).length > 0;

let A, B; const created = [];
try {
  const [stu] = await c.query(`SELECT id FROM students WHERE school_id=? AND deleted_at IS NULL ORDER BY id LIMIT 2`, [SCHOOL]);
  if (stu.length < 2) throw new Error('need 2 students in school ' + SCHOOL);
  const X = stu[0].id, Y = stu[1].id;
  console.log(`Students: X=${X}  Y=${Y}`);

  const hash = await bcrypt.hash('test1234', 10);
  const [ra] = await c.query(`INSERT INTO parent_accounts (phone, full_name, password_hash, phone_verified, status) VALUES ('+256700000901','TEST A',?,TRUE,'active')`, [hash]); A = ra.insertId;
  const [rb] = await c.query(`INSERT INTO parent_accounts (phone, full_name, password_hash, phone_verified, status) VALUES ('+256700000902','TEST B',?,TRUE,'active')`, [hash]); B = rb.insertId;
  await c.query(`INSERT INTO parent_student_links (parent_account_id,school_id,student_id,relationship,status,verified_via,approved_at) VALUES (?,?,?,?,'active','test',NOW())`, [A, SCHOOL, X, 'guardian']);
  await c.query(`INSERT INTO parent_student_links (parent_account_id,school_id,student_id,relationship,status,verified_via,approved_at) VALUES (?,?,?,?,'active','test',NOW())`, [B, SCHOOL, Y, 'guardian']);

  // 1. learners list isolation
  const aIds = await authorizedIds(A, SCHOOL);
  assert(aIds.includes(Number(X)) && !aIds.includes(Number(Y)), 'A learners list = [X] only (Y excluded)');
  const bIds = await authorizedIds(B, SCHOOL);
  assert(bIds.includes(Number(Y)) && !bIds.includes(Number(X)), 'B learners list = [Y] only (X excluded)');

  // 2. per-student gate (overview/attendance/fees/results/snapshots-pdf)
  assert(await canView(A, SCHOOL, X), 'gate: A may view X');
  assert(!(await canView(A, SCHOOL, Y)), 'gate: A may NOT view Y (403)');
  assert(!(await canView(B, SCHOOL, X)), 'gate: B may NOT view X (403)');

  // 3. snapshot prune allow-list (set of linked ids used to strip peers)
  const aSet = new Set(await authorizedIds(A, SCHOOL));
  assert(!aSet.has(Number(Y)), 'snapshot prune: Y not in A allow-list (peer stripped)');

  // 4. context/school: parent cannot select a school with no active link
  assert(await hasSchool(A, SCHOOL), 'context: A may select school 12011');
  assert(!(await hasSchool(A, 99999)), 'context: A may NOT select unlinked school 99999 (403)');

  // 5. pending link grants nothing
  await c.query(`INSERT INTO parent_student_links (parent_account_id,school_id,student_id,relationship,status,verified_via) VALUES (?,?,?,?,'pending','test')`, [A, SCHOOL, Y, 'guardian']);
  assert(!(await canView(A, SCHOOL, Y)), 'pending A->Y still grants NO access');

  // 6. revoked link grants nothing
  await c.query(`UPDATE parent_student_links SET status='revoked', revoked_at=NOW() WHERE parent_account_id=? AND student_id=?`, [A, X]);
  assert(!(await canView(A, SCHOOL, X)), 'revoked A->X grants NO access');
  await c.query(`UPDATE parent_student_links SET status='active' WHERE parent_account_id=? AND student_id=? AND verified_via='test'`, [A, X]); // restore for nothing; will be deleted

  // 7. fees visibility toggle (snapshot + restore real config — never clobber)
  const financeVisible = async (sid) => { const [r] = await c.query(`SELECT value_text FROM school_settings WHERE school_id=? AND key_name='parent_finance_visibility' LIMIT 1`, [sid]); return !r.length || r[0].value_text==null ? true : String(r[0].value_text).toLowerCase()==='true'; };
  const [savedRows] = await c.query(`SELECT value_text FROM school_settings WHERE school_id=? AND key_name='parent_finance_visibility' LIMIT 1`, [SCHOOL]);
  const savedVal = savedRows.length ? savedRows[0].value_text : null; // null => no row existed
  try {
    await c.query(`DELETE FROM school_settings WHERE school_id=? AND key_name='parent_finance_visibility'`, [SCHOOL]);
    assert(await financeVisible(SCHOOL) === true, 'fees visible by default (no setting row)');
    await c.query(`INSERT INTO school_settings (school_id,key_name,value_text) VALUES (?,'parent_finance_visibility','false')`, [SCHOOL]);
    assert(await financeVisible(SCHOOL) === false, 'fees hidden when toggle = false');
  } finally {
    await c.query(`DELETE FROM school_settings WHERE school_id=? AND key_name='parent_finance_visibility'`, [SCHOOL]);
    if (savedVal !== null) await c.query(`INSERT INTO school_settings (school_id,key_name,value_text) VALUES (?,'parent_finance_visibility',?)`, [SCHOOL, savedVal]);
  }

  console.log(`\n${fail === 0 ? 'ALL SECURITY TESTS PASSED' : 'SECURITY TESTS FAILED'} — ${pass} passed, ${fail} failed`);
} catch (e) {
  console.error('\nERROR:', e.message); fail++;
} finally {
  for (const pid of [A, B]) if (pid) {
    await c.query(`DELETE FROM parent_student_links WHERE parent_account_id=?`, [pid]);
    await c.query(`DELETE FROM parent_sessions WHERE parent_account_id=?`, [pid]);
    await c.query(`DELETE FROM parent_accounts WHERE id=?`, [pid]);
  }
  console.log('[cleanup] test rows removed');
  await c.end();
  process.exit(fail === 0 ? 0 : 1);
}
