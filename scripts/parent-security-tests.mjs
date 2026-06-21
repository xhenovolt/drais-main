#!/usr/bin/env node
/**
 * Track A Phase 7 — parent portal security suite (HTTP, against the running
 * dev server). Creates two parents with direct links + sessions, then exercises
 * the live /api/parent/* layer to prove isolation. Cleans up after.
 *
 * Usage: BASE=http://localhost:3001 node scripts/parent-security-tests.mjs
 */
import { createConnection } from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const BASE = process.env.BASE || 'http://localhost:3001';
const env = await readFile('.env.local', 'utf8');
for (const l of env.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const c = await createConnection({ host: process.env.TIDB_HOST, port: +(process.env.TIDB_PORT||4000), user: process.env.TIDB_USER, password: process.env.TIDB_PASSWORD, database: process.env.TIDB_DB||'drais', ssl: { rejectUnauthorized: false } });

const SCHOOL = 12011;
let pass = 0, fail = 0;
const ok  = (m) => { console.log('  ✓ ' + m); pass++; };
const bad = (m) => { console.log('  ✗ ' + m); fail++; };
const eq  = (got, want, m) => got === want ? ok(`${m} (${got})`) : bad(`${m} — got ${got}, want ${want}`);

const req = async (path, { cookie, method = 'GET', body } = {}) => {
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await r.json(); } catch { /* non-json */ }
  return { status: r.status, json };
};

let A, B; const cookieA = () => `drais_parent_session=${tokA}`;
let tokA, tokB, AX, AY;
try {
  const [stu] = await c.query(`SELECT id FROM students WHERE school_id=? AND deleted_at IS NULL ORDER BY id LIMIT 2`, [SCHOOL]);
  const X = stu[0].id, Y = stu[1].id;

  const mk = async (phone) => (await c.query(`INSERT INTO parent_accounts (phone, phone_verified, status) VALUES (?, TRUE, 'active')`, [phone]))[0].insertId;
  A = await mk('+256700000901'); B = await mk('+256700000902');
  AX = randomUUID(); AY = randomUUID();
  await c.query(`INSERT INTO parent_student_links (parent_account_id,school_id,student_id,relationship,status,verified_via,approved_at,access_uuid) VALUES (?,?,?,'guardian','active','test',NOW(),?)`, [A, SCHOOL, X, AX]);
  await c.query(`INSERT INTO parent_student_links (parent_account_id,school_id,student_id,relationship,status,verified_via,approved_at,access_uuid) VALUES (?,?,?,'guardian','active','test',NOW(),?)`, [B, SCHOOL, Y, AY]);
  tokA = 'TESTSESS_' + randomUUID().replace(/-/g, '');
  tokB = 'TESTSESS_' + randomUUID().replace(/-/g, '');
  await c.query(`INSERT INTO parent_sessions (parent_account_id,session_token,expires_at,last_activity_at,is_active) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 1 DAY),NOW(),TRUE)`, [A, tokA]);
  await c.query(`INSERT INTO parent_sessions (parent_account_id,session_token,expires_at,last_activity_at,is_active) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 1 DAY),NOW(),TRUE)`, [B, tokB]);

  // 1 — A sees exactly one learner (X), not Y
  const me = await req('/api/parent/me', { cookie: cookieA() });
  eq(me.status, 200, 'A /me authenticated');
  eq(me.json?.learner_count, 1, 'A sees exactly 1 learner');
  ok(me.json?.learners?.every(l => l.learner_access_id === AX) ? 'A learner is X only' : bad('A sees foreign learner'));

  // 2 — A can open X's detail
  eq((await req(`/api/parent/learners/${AX}/attendance`, { cookie: cookieA() })).status, 200, 'A opens X attendance');

  // 3 — A cannot open Y via cross-parent accessId (IDOR)
  eq((await req(`/api/parent/learners/${AY}/attendance`, { cookie: cookieA() })).status, 404, 'A cannot open Y (cross-parent IDOR)');

  // 4 — bogus accessId
  eq((await req(`/api/parent/learners/${randomUUID()}/fees`, { cookie: cookieA() })).status, 404, 'bogus accessId → 404');

  // 5 — no session
  eq((await req('/api/parent/me')).status, 401, 'no cookie → 401');

  // 6 — parent cannot reach admin API
  const adm = await req('/api/admin/parent-links', { cookie: cookieA() });
  ok(adm.status === 401 || adm.status === 403 ? `parent blocked from admin API (${adm.status})` : bad(`admin API reachable: ${adm.status}`));

  // 7 — revoked link loses access
  await c.query(`UPDATE parent_student_links SET status='revoked', revoked_at=NOW() WHERE access_uuid=?`, [AX]);
  eq((await req(`/api/parent/learners/${AX}/attendance`, { cookie: cookieA() })).status, 404, 'revoked link → 404');
  await c.query(`UPDATE parent_student_links SET status='active' WHERE access_uuid=?`, [AX]);

  // 8 — suspended account cannot use session
  await c.query(`UPDATE parent_accounts SET status='suspended' WHERE id=?`, [A]);
  eq((await req('/api/parent/me', { cookie: cookieA() })).status, 401, 'suspended account → 401');
  await c.query(`UPDATE parent_accounts SET status='active' WHERE id=?`, [A]);

  // 9 — request-otp for an unlinked number: generic 200, no OTP row created
  const unlinked = '+256700000999';
  await c.query(`DELETE FROM parent_otp_codes WHERE phone=?`, [unlinked]);
  const ro = await req('/api/parent/auth/request-otp', { method: 'POST', body: { phone: unlinked } });
  eq(ro.status, 200, 'request-otp unlinked → generic 200');
  const [otp] = await c.query(`SELECT COUNT(*) n FROM parent_otp_codes WHERE phone=?`, [unlinked]);
  eq(Number(otp[0].n), 0, 'no OTP sent for unlinked number (no enumeration)');

  // 10 — verify-otp with wrong code → 400
  eq((await req('/api/parent/auth/verify-otp', { method: 'POST', body: { phone: unlinked, code: '000000' } })).status, 400, 'verify-otp wrong code → 400');

  console.log(`\n${fail === 0 ? 'ALL PARENT SECURITY TESTS PASSED' : 'FAILURES PRESENT'} — ${pass} passed, ${fail} failed`);
} catch (e) {
  console.error('\nERROR:', e.message); fail++;
} finally {
  for (const pid of [A, B]) if (pid) {
    await c.query(`DELETE FROM parent_student_links WHERE parent_account_id=?`, [pid]);
    await c.query(`DELETE FROM parent_sessions WHERE parent_account_id=?`, [pid]);
    await c.query(`DELETE FROM parent_accounts WHERE id=?`, [pid]);
  }
  await c.query(`DELETE FROM parent_otp_codes WHERE phone IN ('+256700000999')`);
  console.log('[cleanup] test rows removed');
  await c.end();
  process.exit(fail === 0 ? 0 : 1);
}
