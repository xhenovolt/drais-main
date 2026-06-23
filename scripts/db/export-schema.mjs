#!/usr/bin/env node
/**
 * db:export:schema — export the live (online/TiDB) schema to a versioned .sql
 * file so a local MySQL server can be initialised to the same shape.
 *
 *   npm run db:export:schema            # schema only
 *   npm run db:export:schema -- --seed  # schema + safe reference/seed data
 *
 * Output: database/exports/drais-<version>-schema.sql
 *
 * SAFE BY DEFAULT: dumps DDL for every table + the schema_migrations ledger
 * (so the local DB is marked at the same migration point). Private learner /
 * payment / attendance data is NEVER exported. --seed additionally ships a
 * small allowlist of reference rows (permissions, roles, role_permissions,
 * feature_flags, districts) — global rows only (school-scoped rows excluded).
 */
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { loadEnv, onlineConfig, pkgVersion, EXPORTS_DIR, SAFE_SEED_TABLES } from './_shared.mjs';

loadEnv();
const withSeed = process.argv.includes('--seed');

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
}

async function columnsOf(conn, table) {
  const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
  return cols.map((c) => c.Field);
}

async function dumpTableRows(conn, table) {
  const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
  if (!rows.length) return `-- ${table}: 0 rows\n`;
  const cols = Object.keys(rows[0]);
  const colList = cols.map((c) => `\`${c}\``).join(', ');
  let out = `-- ${table}: ${rows.length} rows\n`;
  for (const r of rows) {
    const vals = cols.map((c) => esc(r[c])).join(', ');
    out += `INSERT INTO \`${table}\` (${colList}) VALUES (${vals});\n`;
  }
  return out + '\n';
}

async function main() {
  const cfg = onlineConfig();
  if (!cfg.user || !cfg.password) {
    console.error('FATAL: TIDB_USER and TIDB_PASSWORD must be set in .env.local');
    process.exit(1);
  }
  const conn = await mysql.createConnection(cfg);
  console.log(`[export] Connected to ${cfg.host}/${cfg.database}`);

  const [tablesRaw] = await conn.query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"');
  const tables = tablesRaw.map((r) => Object.values(r)[0]).sort();
  console.log(`[export] ${tables.length} base tables`);

  const version = pkgVersion();
  let sql = `-- DRAIS schema export v${version} (${withSeed ? 'schema + safe seed' : 'schema only'})\n`;
  sql += `-- Generated ${new Date().toISOString()} from ${cfg.host}/${cfg.database}\n`;
  sql += `-- DO NOT edit by hand. Apply with: npm run db:local:init\n\n`;
  sql += `SET FOREIGN_KEY_CHECKS = 0;\nSET NAMES utf8mb4;\n\n`;

  for (const t of tables) {
    const [cr] = await conn.query(`SHOW CREATE TABLE \`${t}\``);
    const ddl = cr[0]['Create Table'] || cr[0]['Create View'];
    sql += `DROP TABLE IF EXISTS \`${t}\`;\n${ddl};\n\n`;
  }

  // Always ship the migration ledger so local matches the migration point.
  if (tables.includes('schema_migrations')) {
    sql += `-- ── migration ledger ──\n`;
    sql += await dumpTableRows(conn, 'schema_migrations');
  }

  if (withSeed) {
    sql += `\n-- ── safe seed data (reference only) ──\n`;
    for (const t of SAFE_SEED_TABLES) {
      if (!tables.includes(t)) { sql += `-- ${t}: absent, skipped\n`; continue; }
      const cols = await columnsOf(conn, t);
      if (cols.includes('school_id')) {
        // Ship only global rows; never school-scoped reference data.
        const [rows] = await conn.query(`SELECT * FROM \`${t}\` WHERE school_id IS NULL`);
        if (!rows.length) { sql += `-- ${t}: no global (school_id IS NULL) rows, skipped\n`; continue; }
        const colList = Object.keys(rows[0]).map((c) => `\`${c}\``).join(', ');
        sql += `-- ${t}: ${rows.length} global rows\n`;
        for (const r of rows) {
          sql += `INSERT INTO \`${t}\` (${colList}) VALUES (${Object.keys(rows[0]).map((c) => esc(r[c])).join(', ')});\n`;
        }
        sql += '\n';
      } else {
        sql += await dumpTableRows(conn, t);
      }
    }
  }

  sql += `\nSET FOREIGN_KEY_CHECKS = 1;\n`;

  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  const outFile = path.join(EXPORTS_DIR, `drais-${version}-schema.sql`);
  fs.writeFileSync(outFile, sql);
  await conn.end();

  const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
  console.log(`\n✅ Wrote ${outFile} (${kb} KB, ${tables.length} tables${withSeed ? ' + safe seed' : ''})`);
  console.log(`\nNext: npm run db:local:init   (creates local DB + applies this schema)`);
}

main().catch((e) => { console.error('[export] FAILED:', e.message); process.exit(1); });
