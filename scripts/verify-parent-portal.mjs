#!/usr/bin/env node
/**
 * End-to-end schema/flow verification for the parent portal (NO SMS sent).
 * Exercises the exact SQL the portal code uses: account -> session -> OTP ->
 * pending link -> approve -> isolation-gate read -> corrected attendance read.
 * Creates clearly-marked test rows in school 12011, then deletes them.
 */
import { createConnection } from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';

const env = await readFile('.env.local', 'utf8');
for (const l of env.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const c = await createConnection({ host: process.env.TIDB_HOST, port: +(process.env.TIDB_PORT||4000), user: process.env.TIDB_USER, password: process.env.TIDB_PASSWORD, database: process.env.TIDB_DB||'drais', ssl: { rejectUnauthorized: false } });

const SCHOOL = 12011;
const PHONE = '+256700000999'; // test-only
const ok = (m) => console.log('  ✓ ' + m);
let parentId, linkId, studentId;

try {
  // pick a student in this school that actually has attendance rows
  const [[stu]] = [await c.query(
    `SELECT s.id FROM students s JOIN attendance_records ar
       ON ar.person_id = s.person_id AND ar.school_id = s.school_id AND ar.role_type='student'
      WHERE s.school_id=? GROUP BY s.id ORDER BY COUNT(*) DESC LIMIT 1`, [SCHOOL])];
  studentId = stu[0]?.id;
  if (!studentId) throw new Error('no student with attendance in school '+SCHOOL);
  ok('found test student id=' + studentId);

  // 1. register: create parent_account
  const hash = await bcrypt.hash('test1234', 10);
  const [reg] = await c.query(
    `INSERT INTO parent_accounts (phone, full_name, password_hash, phone_verified, status) VALUES (?,?,?,TRUE,'active')`,
    [PHONE, 'TEST Parent', hash]);
  parentId = reg.insertId; ok('parent_accounts insert -> id=' + parentId);

  // 2. session
  await c.query(`INSERT INTO parent_sessions (parent_account_id, session_token, expires_at, last_activity_at, is_active) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 14 DAY),NOW(),TRUE)`, [parentId, 'TESTTOKEN_'+parentId]);
  const [sess] = await c.query(`SELECT pa.phone FROM parent_sessions ps JOIN parent_accounts pa ON pa.id=ps.parent_account_id WHERE ps.session_token=? AND ps.is_active=TRUE AND ps.expires_at>NOW()`, ['TESTTOKEN_'+parentId]);
  if (!sess.length) throw new Error('session resolve failed'); ok('parent_sessions resolve join works');

  // 3. OTP issue + verify shape
  const code = '123456'; const ch = await bcrypt.hash(code, 10);
  await c.query(`INSERT INTO parent_otp_codes (phone, code_hash, purpose, expires_at) VALUES (?,?, 'verify', DATE_ADD(NOW(),INTERVAL 10 MINUTE))`, [PHONE, ch]);
  const [otp] = await c.query(`SELECT id, code_hash FROM parent_otp_codes WHERE phone=? AND purpose='verify' AND consumed_at IS NULL AND expires_at>NOW() AND attempts<5 ORDER BY id DESC LIMIT 1`, [PHONE]);
  if (!otp.length || !(await bcrypt.compare(code, otp[0].code_hash))) throw new Error('otp verify failed');
  await c.query(`UPDATE parent_otp_codes SET consumed_at=NOW() WHERE id=?`, [otp[0].id]); ok('parent_otp_codes issue+verify+consume works');

  // 4. link pending (auto-approve OFF default) then admin approve
  const [lk] = await c.query(`INSERT INTO parent_student_links (parent_account_id, school_id, student_id, relationship, status, verified_via) VALUES (?,?,?,?, 'pending', 'otp_contact_match')`, [parentId, SCHOOL, studentId, 'guardian']);
  linkId = lk.insertId;
  const [pend] = await c.query(`SELECT student_id FROM parent_student_links WHERE parent_account_id=? AND school_id=? AND status='active'`, [parentId, SCHOOL]);
  if (pend.length !== 0) throw new Error('pending link should NOT grant access'); ok('pending link grants NO access (auto-approve OFF) ✓');
  await c.query(`UPDATE parent_student_links SET status='active', approved_by=1, approved_at=NOW() WHERE id=?`, [linkId]); ok('admin approve -> active');

  // 5. isolation gate: authorizedStudentIds
  const [auth] = await c.query(`SELECT student_id FROM parent_student_links WHERE parent_account_id=? AND school_id=? AND status='active'`, [parentId, SCHOOL]);
  if (!auth.map(r=>String(r.student_id)).includes(String(studentId))) throw new Error('gate did not authorize linked student');
  ok('isolation gate authorizes linked student');

  // gate REJECTS a non-linked student
  const [other] = await c.query(`SELECT id FROM students WHERE school_id=? AND id<>? LIMIT 1`, [SCHOOL, studentId]);
  const [deny] = await c.query(`SELECT 1 FROM parent_student_links WHERE parent_account_id=? AND school_id=? AND student_id=? AND status='active' LIMIT 1`, [parentId, SCHOOL, other[0].id]);
  if (deny.length) throw new Error('gate leaked a non-linked student!'); ok('isolation gate REJECTS non-linked student');

  // 6. corrected attendance read (the daily_attendance -> attendance_records fix)
  const [att] = await c.query(
    `SELECT COUNT(*) AS total, SUM(ar.status IN ('present','late')) AS present
       FROM attendance_records ar JOIN students s ON s.person_id=ar.person_id AND s.school_id=ar.school_id
      WHERE ar.school_id=? AND ar.role_type='student' AND s.id=? AND ar.status NOT IN ('weekend','holiday')
        AND ar.attendance_date >= DATE_SUB(CURDATE(), INTERVAL 120 DAY)`, [SCHOOL, studentId]);
  ok(`attendance_records read returns total=${att[0].total} present=${att[0].present} (was 0 from empty daily_attendance)`);

  console.log('\nALL CHECKS PASSED.');
} catch (e) {
  console.error('\nFAILED:', e.message); process.exitCode = 1;
} finally {
  // cleanup test rows
  if (parentId) {
    await c.query(`DELETE FROM parent_student_links WHERE parent_account_id=?`, [parentId]);
    await c.query(`DELETE FROM parent_sessions WHERE parent_account_id=?`, [parentId]);
    await c.query(`DELETE FROM parent_accounts WHERE id=?`, [parentId]);
  }
  await c.query(`DELETE FROM parent_otp_codes WHERE phone=?`, [PHONE]);
  console.log('[cleanup] test rows removed');
  await c.end();
}
