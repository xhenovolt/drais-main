#!/usr/bin/env node
/**
 * db:export:albayan — a LEAN, Albayan-only dump (school_id 8002).
 *
 * Retains ONLY: learner names + their classes, staff, user accounts, and
 * fingerprints (for those who have them). Everything else (finance, attendance,
 * zk logs, other schools, settings…) is left out.
 *
 *   npm run db:export:albayan
 *   → database/exports/drais-albayan-<version>.sql  (imports into a `drais` DB)
 *
 * Contains real personal data — never commit it (database/exports/ is gitignored).
 */
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { loadEnv, onlineConfig, pkgVersion, EXPORTS_DIR } from './_shared.mjs';

loadEnv();
const S = 8002;                                   // Albayan Quran Memorization Centre
const TARGET_DB = process.env.LOCAL_MYSQL_DATABASE || 'drais';
const BATCH = 500;

// Functional Albayan-only set: the requested entities PLUS the RBAC + academic
// reference rows needed for the user accounts to log in with permissions and for
// learners/classes to resolve. Global tables (permissions/role_permissions) are
// included whole; everything else is scoped to school 8002.
const TABLES = [
  { t: 'schools',               where: 'id = ?',                                                                p: [S] },
  // RBAC — so the 2 user accounts actually have permissions on login.
  { t: 'permissions',           where: '1 = 1',                                                                 p: [] },
  { t: 'roles',                 where: 'school_id = ?',                                                         p: [S] },
  { t: 'role_permissions',      where: '1 = 1',                                                                 p: [] },
  { t: 'user_roles',            where: 'school_id = ?',                                                         p: [S] },
  // Academic structure + settings the app reads.
  { t: 'academic_years',        where: 'school_id = ?',                                                         p: [S] },
  { t: 'terms',                 where: 'school_id = ?',                                                         p: [S] },
  { t: 'programs',              where: 'school_id = ?',                                                         p: [S] },
  { t: 'study_modes',           where: 'school_id = ? OR school_id IS NULL',                                    p: [S] },
  { t: 'departments',           where: 'school_id = ?',                                                         p: [S] },
  { t: 'school_settings',       where: 'school_id = ?',                                                         p: [S] },
  { t: 'comm_settings',         where: 'school_id = ?',                                                         p: [S] },
  // The requested entities.
  { t: 'people',                where: 'school_id = ?',                                                         p: [S] },
  { t: 'classes',               where: 'school_id = ?',                                                         p: [S] },
  { t: 'students',              where: 'school_id = ?',                                                         p: [S] },
  { t: 'enrollments',           where: "school_id = ? AND (status = 'active' OR status IS NULL)",               p: [S] },
  { t: 'staff',                 where: 'school_id = ?',                                                         p: [S] },
  { t: 'users',                 where: 'school_id = ?',                                                         p: [S] },
  { t: 'fingerprints',          where: 'school_id = ?',                                                         p: [S] },
  { t: 'student_fingerprints',  where: 'school_id = ?',                                                         p: [S] },
  { t: 'biometric_enrollments', where: 'school_id = ?',                                                         p: [S] },
  { t: 'biometric_templates',   where: 'enrollment_id IN (SELECT id FROM biometric_enrollments WHERE school_id = ?)', p: [S] },
];

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex') || '0'}`;
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\x1a/g, '\\Z')}'`;
}

async function main() {
  const cfg = onlineConfig();
  if (!cfg.user || !cfg.password) { console.error('FATAL: TIDB_USER/TIDB_PASSWORD must be set in .env.local'); process.exit(1); }
  const conn = await mysql.createConnection(cfg);
  console.log(`[albayan] Connected to ${cfg.host}/${cfg.database} — exporting school_id ${S}`);

  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  const outFile = path.join(EXPORTS_DIR, `drais-albayan-${pkgVersion()}.sql`);
  const w = fs.createWriteStream(outFile);
  const write = (s) => new Promise((res) => { if (!w.write(s)) w.once('drain', res); else res(); });

  await write(`-- DRAIS Albayan-only dump v${pkgVersion()} (school_id ${S})\n`);
  await write(`-- Learners + classes, staff, users, fingerprints. Generated ${new Date().toISOString()}.\n\n`);
  await write(`CREATE DATABASE IF NOT EXISTS \`${TARGET_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\nUSE \`${TARGET_DB}\`;\n\n`);
  await write(`SET FOREIGN_KEY_CHECKS = 0;\nSET UNIQUE_CHECKS = 0;\nSET NAMES utf8mb4;\n\n`);

  let totalRows = 0;
  for (const { t, where, p } of TABLES) {
    let cr;
    try { [cr] = await conn.query(`SHOW CREATE TABLE \`${t}\``); }
    catch { console.log(`  ${t.padEnd(22)} (absent, skipped)`); continue; }
    await write(`-- ---------- ${t} ----------\nDROP TABLE IF EXISTS \`${t}\`;\n${cr[0]['Create Table']};\n`);

    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\` WHERE ${where}`, p);
    let off = 0;
    while (off < n) {
      const [rows] = await conn.query(`SELECT * FROM \`${t}\` WHERE ${where} LIMIT ${BATCH} OFFSET ${off}`, p);
      if (!rows.length) break;
      const cols = Object.keys(rows[0]).map((c) => `\`${c}\``).join(', ');
      const vals = rows.map((r) => `(${Object.values(r).map(esc).join(', ')})`).join(',\n');
      await write(`INSERT INTO \`${t}\` (${cols}) VALUES\n${vals};\n`);
      off += rows.length;
    }
    totalRows += Number(n);
    await write('\n');
    console.log(`  ${t.padEnd(22)} ${n} rows`);
  }

  await write(`SET FOREIGN_KEY_CHECKS = 1;\nSET UNIQUE_CHECKS = 1;\n`);
  await new Promise((res) => w.end(res));
  await conn.end();

  const mb = (fs.statSync(outFile).size / 1048576).toFixed(2);
  console.log(`\n✅ Wrote ${outFile} (${mb} MB, ${totalRows} rows)`);
  console.log('   Functional Albayan-only DB: learners+classes, staff, users WITH working');
  console.log('   RBAC (roles/permissions/user_roles) + academic structure + settings.');
  console.log('   Import: phpMyAdmin, or  mysql -u root < ' + path.basename(outFile));
}

main().catch((e) => { console.error('[albayan] FAILED:', e.message); process.exit(1); });
