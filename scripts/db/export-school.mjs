#!/usr/bin/env node
/**
 * Export one school's complete TiDB dataset (schema + scoped data).
 * Usage: node scripts/db/export-school.mjs --school-id=8002 --output=albayan-YYYY-MM-DD.sql
 */
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { loadEnv, onlineConfig, EXPORTS_DIR } from './_shared.mjs';

loadEnv();
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [key, ...rest] = a.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
const schoolId = Number(args['school-id'] || 8002);
const outputName = args.output || `school-${schoolId}-${new Date().toISOString().slice(0, 10)}.sql`;
if (!Number.isInteger(schoolId) || schoolId <= 0) throw new Error('school-id must be a positive integer');

function esc(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
  if (Buffer.isBuffer(value)) return `0x${value.toString('hex') || '0'}`;
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\x1a/g, '\\Z')}'`;
}

async function main() {
  const conn = await mysql.createConnection(onlineConfig());
  const [[school]] = await conn.query('SELECT id, name FROM schools WHERE id = ? LIMIT 1', [schoolId]);
  if (!school) throw new Error(`School ${schoolId} was not found in TiDB`);

  const [tableRows] = await conn.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'");
  const tables = tableRows.map((r) => r.TABLE_NAME).filter((t) => /^[A-Za-z0-9_]+$/.test(t));
  const [columnRows] = await conn.query('SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()');
  const columns = new Map();
  for (const row of columnRows) {
    if (!columns.has(row.TABLE_NAME)) columns.set(row.TABLE_NAME, new Set());
    columns.get(row.TABLE_NAME).add(row.COLUMN_NAME);
  }
  const [fkRows] = await conn.query('SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL');
  const tableSet = new Set(tables);
  const edges = new Map();
  for (const fk of fkRows) {
    if (tableSet.has(fk.TABLE_NAME) && tableSet.has(fk.REFERENCED_TABLE_NAME)) {
      if (!edges.has(fk.TABLE_NAME)) edges.set(fk.TABLE_NAME, []);
      edges.get(fk.TABLE_NAME).push(fk);
    }
  }

  // Tables with school_id are directly scoped. Tables that point to them are
  // scoped through FK chains. Legacy tables without declared FKs are handled
  // only by this explicit, reviewed map; unknown tables are schema-only so a
  // missing relationship can never leak another school's rows.
  const scopeCache = new Map();
  function scopeFor(table, seen = new Set()) {
    if (scopeCache.has(table)) return scopeCache.get(table);
    if (table === 'schools') return 'id = ?';
    if (columns.get(table)?.has('school_id')) return 'school_id = ?';
    if (seen.has(table)) return null;
    seen.add(table);
    for (const edge of edges.get(table) || []) {
      const parentScope = scopeFor(edge.REFERENCED_TABLE_NAME, new Set(seen));
      if (parentScope) {
        const clause = `${edge.COLUMN_NAME} IN (SELECT ${edge.REFERENCED_COLUMN_NAME} FROM \`${edge.REFERENCED_TABLE_NAME}\` WHERE ${parentScope})`;
        scopeCache.set(table, clause);
        return clause;
      }
    }
    scopeCache.set(table, null);
    return null;
  }

  const legacyScopes = {
    villages: 'id IN (SELECT village_id FROM `students` WHERE school_id = ? AND village_id IS NOT NULL)',
    enrollment_programs: 'enrollment_id IN (SELECT id FROM `enrollments` WHERE school_id = ?)',
    biometric_templates: 'enrollment_id IN (SELECT id FROM `biometric_enrollments` WHERE school_id = ?)',
    student_next_of_kin: 'student_id IN (SELECT id FROM `students` WHERE school_id = ?)',
    student_requirements: 'student_id IN (SELECT id FROM `students` WHERE school_id = ?)',
    student_custom_values: 'student_id IN (SELECT id FROM `students` WHERE school_id = ?)',
    student_additional_info: 'student_id IN (SELECT id FROM `students` WHERE school_id = ?)',
  };
  const globalReferenceTables = new Set(['permissions', 'curriculums']);
  const globalReferenceScopes = {
    role_permissions: 'role_id IN (SELECT id FROM `roles` WHERE school_id = ?)',
  };
  for (const [table, clause] of Object.entries(legacyScopes)) scopeCache.set(table, clause);
  for (const [table, clause] of Object.entries(globalReferenceScopes)) scopeCache.set(table, clause);

  const scoped = tables.filter((t) => t === 'schools' || scopeFor(t));
  const global = tables.filter((t) => t !== 'schools' && !scopeFor(t) && globalReferenceTables.has(t));
  const scopedReference = tables.filter((t) => t !== 'schools' && globalReferenceScopes[t]);
  const schemaOnly = tables.filter((t) => t !== 'schools' && !scopeFor(t) && !globalReferenceTables.has(t) && !globalReferenceScopes[t]);
  const outFile = path.join(EXPORTS_DIR, outputName);
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  const stream = fs.createWriteStream(outFile);
  const write = (text) => new Promise((resolve, reject) => {
    if (stream.write(text, (error) => error ? reject(error) : resolve())) return;
    stream.once('drain', resolve);
  });
  await write(`-- DRAIS school-scoped export\n-- school_id=${schoolId}; school=${String(school.name).replace(/\r?\n/g, ' ')}\n-- Generated=${new Date().toISOString()} from TiDB\n-- Includes all direct/foreign-key-linked school data and global reference tables.\n-- Does not include data belonging to another school.\n\nSET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\nSET NAMES utf8mb4;\n\n`);

  let total = 0;
  for (const table of tables) {
    const clause = scopeFor(table);
    const params = table === 'schools' || clause ? [schoolId] : [];
    const where = clause || '1 = 1';
    const [createRows] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
    const dataClass = clause ? (globalReferenceScopes[table] ? 'school-scoped-reference' : 'school-scoped') : globalReferenceTables.has(table) ? 'global-reference' : 'schema-only';
    await write(`-- ---------- ${table} (${dataClass}) ----------\nDROP TABLE IF EXISTS \`${table}\`;\n${createRows[0]['Create Table']};\n`);
    if (!clause && !globalReferenceTables.has(table)) {
      console.log(`${table}: schema only (ambiguous ownership)`);
      continue;
    }
    const [[countRow]] = await conn.query(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${where}`, params);
    const count = Number(countRow.n);
    let offset = 0;
    while (offset < count) {
      const [rows] = await conn.query(`SELECT * FROM \`${table}\` WHERE ${where} LIMIT 500 OFFSET ${offset}`, params);
      if (!rows.length) break;
      const names = Object.keys(rows[0]);
      const values = rows.map((row) => `(${names.map((name) => esc(row[name])).join(', ')})`).join(',\n');
      await write(`INSERT INTO \`${table}\` (${names.map((n) => `\`${n}\``).join(', ')}) VALUES\n${values};\n`);
      offset += rows.length;
    }
    total += count;
    console.log(`${table}: ${count} rows (${clause ? 'scoped' : 'global'})`);
  }
  await write('\nSET FOREIGN_KEY_CHECKS=1;\nSET UNIQUE_CHECKS=1;\n');
  await new Promise((resolve, reject) => stream.end((error) => error ? reject(error) : resolve()));
  await conn.end();
  console.log(`Wrote ${outFile}: ${scoped.length} scoped tables, ${scopedReference.length} scoped reference tables, ${global.length} global reference tables, ${schemaOnly.length} schema-only tables, ${total} rows`);
}

main().catch((error) => { console.error(`[export-school] FAILED: ${error.message}`); process.exit(1); });