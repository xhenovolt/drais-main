#!/usr/bin/env node
/**
 * db:export:full — FULL dump of the online (TiDB) database (schema + ALL data)
 * into one importable file:  database/exports/drais-<version>.sql
 *
 *   npm run db:export:full
 *
 * The file creates the `drais` database, all tables, and every row, so it can be
 * imported into a fresh local MySQL (XAMPP / phpMyAdmin) and the desktop app, in
 * Local mode, starts EXACTLY where online is — no data loss.
 *
 * Streamed to disk table-by-table (batched INSERTs) so large tables don't blow
 * memory. Contains real data — never commit it (database/exports/ is gitignored).
 */
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { loadEnv, onlineConfig, pkgVersion, EXPORTS_DIR } from './_shared.mjs';

loadEnv();
const TARGET_DB = process.env.LOCAL_MYSQL_DATABASE || 'drais';
const BATCH = 500;

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
  console.log(`[export:full] Connected to ${cfg.host}/${cfg.database}`);

  const [tablesRaw] = await conn.query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"');
  const tables = tablesRaw.map((r) => Object.values(r)[0]).sort();
  console.log(`[export:full] ${tables.length} base tables — dumping schema + data…`);

  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  const outFile = path.join(EXPORTS_DIR, `drais-${pkgVersion()}.sql`);
  const w = fs.createWriteStream(outFile);
  const write = (s) => new Promise((res) => { if (!w.write(s)) w.once('drain', res); else res(); });

  await write(`-- DRAIS FULL dump v${pkgVersion()} — schema + data\n`);
  await write(`-- Generated ${new Date().toISOString()} from ${cfg.host}/${cfg.database}\n`);
  await write(`-- Import into a fresh MySQL (XAMPP/phpMyAdmin) to mirror online exactly.\n\n`);
  await write(`CREATE DATABASE IF NOT EXISTS \`${TARGET_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\nUSE \`${TARGET_DB}\`;\n\n`);
  await write(`SET FOREIGN_KEY_CHECKS = 0;\nSET UNIQUE_CHECKS = 0;\nSET NAMES utf8mb4;\n\n`);

  let totalRows = 0;
  for (const t of tables) {
    const [cr] = await conn.query(`SHOW CREATE TABLE \`${t}\``);
    const ddl = cr[0]['Create Table'];
    await write(`-- ---------- ${t} ----------\nDROP TABLE IF EXISTS \`${t}\`;\n${ddl};\n`);

    const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    if (n > 0) {
      // Page through the table to keep memory flat.
      let offset = 0;
      while (offset < n) {
        const [rows] = await conn.query(`SELECT * FROM \`${t}\` LIMIT ${BATCH} OFFSET ${offset}`);
        if (!rows.length) break;
        const cols = Object.keys(rows[0]).map((c) => `\`${c}\``).join(', ');
        const values = rows.map((r) => `(${Object.values(r).map(esc).join(', ')})`).join(',\n');
        await write(`INSERT INTO \`${t}\` (${cols}) VALUES\n${values};\n`);
        offset += rows.length;
      }
      totalRows += Number(n);
    }
    await write('\n');
    console.log(`  ${t.padEnd(34)} ${n} rows`);
  }

  await write(`SET FOREIGN_KEY_CHECKS = 1;\nSET UNIQUE_CHECKS = 1;\n`);
  await new Promise((res) => w.end(res));
  await conn.end();

  const mb = (fs.statSync(outFile).size / 1048576).toFixed(1);
  console.log(`\n✅ Wrote ${outFile} (${mb} MB, ${tables.length} tables, ${totalRows} rows)`);
  console.log(`\nTransfer flow:`);
  console.log(`  1. Copy ${path.basename(outFile)} to the target PC.`);
  console.log(`  2. XAMPP → phpMyAdmin → Import → choose the file (creates DB '${TARGET_DB}' + data).`);
  console.log(`  3. In the app's drais.env set: DRAIS_ALLOW_LOCAL=true, LOCAL_MYSQL_* (db ${TARGET_DB}).`);
  console.log(`  4. npm run dist:win → run the exe → pick "Local Server".`);
}

main().catch((e) => { console.error('[export:full] FAILED:', e.message); process.exit(1); });
