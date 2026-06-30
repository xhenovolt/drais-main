#!/usr/bin/env node
/**
 * to-mysql8 — convert a TiDB schema export into a MySQL 8-compatible file.
 *
 *   node scripts/db/to-mysql8.mjs [--file database/exports/drais-<v>-schema.sql]
 *   → writes <same>.mysql8.sql
 *
 * TiDB's SHOW CREATE TABLE output is mostly MySQL-compatible, but two things
 * break a clean `mysql <` import:
 *   1. /*T![feature] ... *​/ versioned comments (clustered_index, auto_id_cache).
 *   2. FOREIGN KEY constraints — MySQL 8 enforces EXACT FK column-type match
 *      (e.g. int vs bigint), which TiDB does not. DRAIS integrity is
 *      application-level, so we drop the constraints (indexes are kept).
 * We also wrap the file in SET FOREIGN_KEY_CHECKS=0/1 so alphabetical CREATE
 * order can never fail on a forward reference.
 */
import fs from 'node:fs';
import path from 'node:path';
import { EXPORTS_DIR } from './_shared.mjs';

function newestSchema() {
  if (!fs.existsSync(EXPORTS_DIR)) return null;
  const f = fs.readdirSync(EXPORTS_DIR)
    .filter((x) => x.endsWith('-schema.sql'))
    .map((x) => ({ x, t: fs.statSync(path.join(EXPORTS_DIR, x)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0];
  return f ? path.join(EXPORTS_DIR, f.x) : null;
}

const i = process.argv.indexOf('--file');
const inFile = i !== -1 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : newestSchema();
if (!inFile || !fs.existsSync(inFile)) {
  console.error('FATAL: no schema export found. Run: npm run db:export:schema');
  process.exit(1);
}
const outFile = inFile.replace(/\.sql$/, '.mysql8.sql');

let sql = fs.readFileSync(inFile, 'utf8');
sql = sql.replace(/\/\*T!\[[^\]]*\][^*]*\*\//g, '');                       // 1. strip TiDB versioned comments
sql = sql.split('\n').filter((l) => !/^\s*CONSTRAINT\s+`[^`]+`\s+FOREIGN KEY/i.test(l)).join('\n'); // 2. drop FK lines
sql = sql.replace(/,(\s*\n\s*\))/g, '$1');                                 //    fix dangling comma before )
sql = sql.replace(/[ \t]+,/g, ',').replace(/[ \t]+\n/g, '\n');

const header = [
  `-- MySQL 8 compatible variant of ${path.basename(inFile)}`,
  '-- TiDB versioned comments stripped; FOREIGN KEY constraints removed (MySQL 8',
  '-- enforces exact FK column-type match which TiDB does not; DRAIS integrity is',
  '-- application-level). Indexes preserved. FK checks disabled during apply.',
  'SET NAMES utf8mb4;',
  'SET FOREIGN_KEY_CHECKS=0;',
  '',
].join('\n');
fs.writeFileSync(outFile, header + sql + '\nSET FOREIGN_KEY_CHECKS=1;\n');

const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
console.log(`✅ Wrote ${outFile} (${kb} KB)`);
console.log(`Next: npm run db:local:init -- --file ${outFile}`);
