#!/usr/bin/env node
/**
 * Phase 1 — Schema introspection (read-only).
 *
 * Inspects the live TiDB INFORMATION_SCHEMA without making assumptions and
 * emits two artefacts:
 *
 *   exports/schema_analysis.json
 *     - per-table column lists (name, type, nullable, default, key, extra)
 *     - per-table primary/unique keys, indexes, row count estimate
 *     - per-table presence flags: school_id, deleted_at, created_at
 *
 *   exports/table_relationship_map.json
 *     - declared FOREIGN KEYs (TiDB parses but does not enforce them; still
 *       useful when present)
 *     - inferred relationships from column-naming convention
 *       (e.g. `class_id` -> `classes.id`)
 *     - school-ownership classification per table:
 *         direct        — table has its own school_id column
 *         indirect      — reachable to a school-owned table via FK chain
 *         global        — neither (e.g. `result_types` if not school-scoped)
 *     - shortest path from each table to `schools.id` (BFS over inferred edges)
 *
 * No data is exported in this phase. Run again later for incremental updates.
 *
 * Run:  node scripts/db-export/01-analyze-schema.mjs
 * Env:  TIDB_HOST TIDB_PORT TIDB_USER TIDB_PASSWORD TIDB_DB
 */
import { createConnection } from 'mysql2/promise';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const OUT_DIR   = join(REPO_ROOT, 'exports');

const cfg = {
  host:     process.env.TIDB_HOST     || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port:     parseInt(process.env.TIDB_PORT || '4000', 10),
  user:     process.env.TIDB_USER     || '',
  password: process.env.TIDB_PASSWORD || '',
  database: process.env.TIDB_DB       || 'drais',
  ssl:      { rejectUnauthorized: false },
  connectTimeout: 30000,
};
if (!cfg.user || !cfg.password) {
  console.error('FATAL: TIDB_USER and TIDB_PASSWORD must be set.');
  process.exit(1);
}

const ROOT_TABLE = 'schools';

await mkdir(OUT_DIR, { recursive: true });
const conn = await createConnection(cfg);
console.log(`[schema] Connected to ${cfg.host}/${cfg.database}`);

// ─── 1. Tables ───────────────────────────────────────────────────────────────
const [tables] = await conn.query(
  `SELECT TABLE_NAME, TABLE_ROWS, ENGINE, TABLE_COLLATION, CREATE_TIME, UPDATE_TIME
     FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME`,
  [cfg.database],
);
console.log(`[schema] Tables: ${tables.length}`);

// ─── 2. Columns ──────────────────────────────────────────────────────────────
const [cols] = await conn.query(
  `SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE,
          DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE,
          COLUMN_TYPE, COLUMN_KEY, EXTRA, COLUMN_COMMENT
     FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME, ORDINAL_POSITION`,
  [cfg.database],
);
console.log(`[schema] Columns: ${cols.length}`);

// ─── 3. Indexes ──────────────────────────────────────────────────────────────
const [idx] = await conn.query(
  `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, NULLABLE, INDEX_TYPE
     FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = ?
    ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
  [cfg.database],
);
console.log(`[schema] Index entries: ${idx.length}`);

// ─── 4. Declared FK constraints (may be empty on TiDB) ───────────────────────
const [fks] = await conn.query(
  `SELECT kcu.TABLE_NAME, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME, kcu.CONSTRAINT_NAME
     FROM information_schema.KEY_COLUMN_USAGE kcu
    WHERE kcu.TABLE_SCHEMA = ?
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME`,
  [cfg.database],
);
console.log(`[schema] Declared FKs: ${fks.length}`);

await conn.end();

// ─── Build per-table view ────────────────────────────────────────────────────
const tableNames = tables.map(t => t.TABLE_NAME);
const tableSet = new Set(tableNames);

const colsByTable = new Map();
for (const c of cols) {
  if (!colsByTable.has(c.TABLE_NAME)) colsByTable.set(c.TABLE_NAME, []);
  colsByTable.get(c.TABLE_NAME).push(c);
}

const idxByTable = new Map();
for (const i of idx) {
  if (!idxByTable.has(i.TABLE_NAME)) idxByTable.set(i.TABLE_NAME, []);
  idxByTable.get(i.TABLE_NAME).push(i);
}

const fksByTable = new Map();
for (const f of fks) {
  if (!fksByTable.has(f.TABLE_NAME)) fksByTable.set(f.TABLE_NAME, []);
  fksByTable.get(f.TABLE_NAME).push(f);
}

function buildPrimaryKey(indexes) {
  const pk = indexes.filter(i => i.INDEX_NAME === 'PRIMARY').sort((a, b) => a.SEQ_IN_INDEX - b.SEQ_IN_INDEX);
  return pk.map(p => p.COLUMN_NAME);
}
function buildUniqueIndexes(indexes) {
  const groups = new Map();
  for (const i of indexes) {
    if (i.INDEX_NAME === 'PRIMARY') continue;
    if (i.NON_UNIQUE === 1) continue;
    if (!groups.has(i.INDEX_NAME)) groups.set(i.INDEX_NAME, []);
    groups.get(i.INDEX_NAME).push(i);
  }
  return [...groups.entries()].map(([name, parts]) => ({
    name,
    columns: parts.sort((a, b) => a.SEQ_IN_INDEX - b.SEQ_IN_INDEX).map(p => p.COLUMN_NAME),
  }));
}
function buildSecondaryIndexes(indexes) {
  const groups = new Map();
  for (const i of indexes) {
    if (i.INDEX_NAME === 'PRIMARY') continue;
    if (i.NON_UNIQUE === 0) continue;
    if (!groups.has(i.INDEX_NAME)) groups.set(i.INDEX_NAME, []);
    groups.get(i.INDEX_NAME).push(i);
  }
  return [...groups.entries()].map(([name, parts]) => ({
    name,
    columns: parts.sort((a, b) => a.SEQ_IN_INDEX - b.SEQ_IN_INDEX).map(p => p.COLUMN_NAME),
  }));
}

const tableInfo = {};
for (const t of tables) {
  const tcols = colsByTable.get(t.TABLE_NAME) || [];
  const tidx  = idxByTable.get(t.TABLE_NAME) || [];
  const tfks  = fksByTable.get(t.TABLE_NAME) || [];
  const colNames = new Set(tcols.map(c => c.COLUMN_NAME));
  tableInfo[t.TABLE_NAME] = {
    name:         t.TABLE_NAME,
    rowCountEst:  t.TABLE_ROWS,
    engine:       t.ENGINE,
    collation:    t.TABLE_COLLATION,
    createdAt:    t.CREATE_TIME,
    updatedAt:    t.UPDATE_TIME,
    primaryKey:   buildPrimaryKey(tidx),
    uniqueKeys:   buildUniqueIndexes(tidx),
    indexes:      buildSecondaryIndexes(tidx),
    declaredFks:  tfks.map(f => ({
      column: f.COLUMN_NAME,
      ref:    `${f.REFERENCED_TABLE_NAME}.${f.REFERENCED_COLUMN_NAME}`,
      name:   f.CONSTRAINT_NAME,
    })),
    columns: tcols.map(c => ({
      name:        c.COLUMN_NAME,
      ordinal:     c.ORDINAL_POSITION,
      dataType:    c.DATA_TYPE,
      columnType:  c.COLUMN_TYPE,
      nullable:    c.IS_NULLABLE === 'YES',
      defaultValue: c.COLUMN_DEFAULT,
      key:         c.COLUMN_KEY,
      extra:       c.EXTRA,
      comment:     c.COLUMN_COMMENT || null,
    })),
    flags: {
      hasSchoolId:      colNames.has('school_id'),
      hasDeletedAt:     colNames.has('deleted_at'),
      hasCreatedAt:     colNames.has('created_at'),
      hasUpdatedAt:     colNames.has('updated_at'),
      hasStatus:        colNames.has('status'),
      hasIsActive:      colNames.has('is_active'),
      hasArchivedAt:    colNames.has('archived_at'),
    },
  };
}

// ─── Inferred relationships from column-naming convention ────────────────────
//
// Heuristic: any column ending in `_id` (and not just `id`) whose stem matches
// a singular form of an existing table name is treated as an inferred FK.
// We try several singularization forms.
function singularToTableCandidates(stem) {
  // Most DRAIS tables are plural. Try common plural transforms.
  const out = [];
  out.push(`${stem}s`);
  out.push(`${stem}es`);
  if (stem.endsWith('y')) out.push(`${stem.slice(0, -1)}ies`);
  out.push(stem);              // already plural?
  return out;
}

const inferredEdges = []; // [{ fromTable, fromColumn, toTable, toColumn, source }]
for (const [table, columns] of colsByTable) {
  for (const c of columns) {
    if (!c.COLUMN_NAME.endsWith('_id')) continue;
    if (c.COLUMN_NAME === 'id') continue;
    const stem = c.COLUMN_NAME.replace(/_id$/, '');
    // Direct: `school_id` -> `schools`, `class_id` -> `classes`, etc.
    const candidates = singularToTableCandidates(stem);
    let matched = null;
    for (const cand of candidates) {
      if (tableSet.has(cand)) { matched = cand; break; }
    }
    if (!matched) {
      // Sometimes the column stem already matches the table name (e.g. `staff_id` -> `staff`).
      if (tableSet.has(stem)) matched = stem;
    }
    if (!matched) continue;
    inferredEdges.push({
      fromTable: table,
      fromColumn: c.COLUMN_NAME,
      toTable:   matched,
      toColumn:  'id',
      source:    'naming_convention',
    });
  }
}
// Add declared FKs that name tables we know about
for (const f of fks) {
  if (!tableSet.has(f.REFERENCED_TABLE_NAME)) continue;
  inferredEdges.push({
    fromTable:  f.TABLE_NAME,
    fromColumn: f.COLUMN_NAME,
    toTable:    f.REFERENCED_TABLE_NAME,
    toColumn:   f.REFERENCED_COLUMN_NAME,
    source:     'declared_fk',
  });
}
// Dedupe (some declared FKs duplicate inferred edges)
const edgeKey = e => `${e.fromTable}.${e.fromColumn}->${e.toTable}.${e.toColumn}`;
const edgeMap = new Map();
for (const e of inferredEdges) {
  const k = edgeKey(e);
  if (!edgeMap.has(k)) edgeMap.set(k, e);
  else {
    const cur = edgeMap.get(k);
    if (cur.source !== 'declared_fk' && e.source === 'declared_fk') edgeMap.set(k, e);
  }
}
const edges = [...edgeMap.values()];

// ─── BFS: shortest path from every table to `schools` ────────────────────────
//
// Build adjacency: from -> { to, viaColumn, viaSourceTable, viaSourceColumn }
// We only walk edges that point AWAY from a table (i.e. the table holds an FK to another).
// To reach `schools`, the edge `child.school_id -> schools.id` must exist OR we must
// chain via another school-owned table.
const adj = new Map(); // table -> Edge[]
for (const e of edges) {
  if (!adj.has(e.fromTable)) adj.set(e.fromTable, []);
  adj.get(e.fromTable).push(e);
}

function bfsToSchools(startTable) {
  if (startTable === ROOT_TABLE) return { hops: 0, path: [] };
  const visited = new Set([startTable]);
  const queue = [{ table: startTable, path: [] }];
  while (queue.length) {
    const { table, path } = queue.shift();
    const outs = adj.get(table) || [];
    for (const e of outs) {
      if (visited.has(e.toTable)) continue;
      const nextPath = [...path, e];
      if (e.toTable === ROOT_TABLE) return { hops: nextPath.length, path: nextPath };
      visited.add(e.toTable);
      queue.push({ table: e.toTable, path: nextPath });
    }
  }
  return null;
}

// ─── Classify school ownership ──────────────────────────────────────────────
function classifyOwnership(table) {
  const info = tableInfo[table];
  if (!info) return { ownership: 'unknown' };
  if (table === ROOT_TABLE) return { ownership: 'root', hops: 0, path: [] };
  if (info.flags.hasSchoolId) {
    return { ownership: 'direct', hops: 1, path: [{ fromTable: table, fromColumn: 'school_id', toTable: ROOT_TABLE, toColumn: 'id', source: 'naming_convention' }] };
  }
  const reach = bfsToSchools(table);
  if (reach) return { ownership: 'indirect', hops: reach.hops, path: reach.path };
  return { ownership: 'global' };
}

const ownershipMap = {};
for (const t of tableNames) {
  ownershipMap[t] = classifyOwnership(t);
}

// ─── Categorize tables for the export pipeline ──────────────────────────────
function categorize(table) {
  const cls = ownershipMap[table];
  const info = tableInfo[table];
  const cats = [];
  if (cls.ownership === 'root') cats.push('root');
  if (cls.ownership === 'direct') cats.push('school_owned_direct');
  if (cls.ownership === 'indirect') cats.push('school_owned_indirect');
  if (cls.ownership === 'global') cats.push('global_or_unscoped');
  // Heuristic transactional / historical / bridge classifications
  const lname = table.toLowerCase();
  if (/_history|_log|_logs|audit|_archive$/.test(lname)) cats.push('history_or_audit');
  if (/_bridge$|_map$|_mapping$|_membership$|^class_subjects$|^user_roles$/.test(lname)) cats.push('bridge_or_mapping');
  if (info && info.columns.some(c => c.dataType === 'json' || c.columnType.toLowerCase() === 'json')) cats.push('has_json_column');
  if (info && info.columns.some(c => c.dataType === 'enum' || c.columnType.startsWith('enum'))) cats.push('has_enum_column');
  return cats;
}

// ─── Compose outputs ────────────────────────────────────────────────────────
const schemaAnalysis = {
  database: cfg.database,
  generatedAt: new Date().toISOString(),
  tableCount: tables.length,
  tables: tableInfo,
};

const relationshipMap = {
  database: cfg.database,
  generatedAt: new Date().toISOString(),
  rootTable: ROOT_TABLE,
  declaredFkCount: fks.length,
  inferredEdgeCount: edges.length,
  edges,
  ownership: Object.fromEntries(
    tableNames.map(t => [t, {
      ...ownershipMap[t],
      categories: categorize(t),
      flags: tableInfo[t]?.flags,
    }]),
  ),
  summary: {
    root:                  tableNames.filter(t => ownershipMap[t].ownership === 'root'),
    schoolOwnedDirect:     tableNames.filter(t => ownershipMap[t].ownership === 'direct'),
    schoolOwnedIndirect:   tableNames.filter(t => ownershipMap[t].ownership === 'indirect'),
    globalOrUnscoped:      tableNames.filter(t => ownershipMap[t].ownership === 'global'),
  },
};

await writeFile(join(OUT_DIR, 'schema_analysis.json'), JSON.stringify(schemaAnalysis, null, 2));
await writeFile(join(OUT_DIR, 'table_relationship_map.json'), JSON.stringify(relationshipMap, null, 2));
console.log(`[schema] Wrote exports/schema_analysis.json (${tableNames.length} tables)`);
console.log(`[schema] Wrote exports/table_relationship_map.json (${edges.length} edges)`);
console.log(`[schema] Ownership counts:`);
console.log(`         root:                  ${relationshipMap.summary.root.length}`);
console.log(`         school_owned_direct:   ${relationshipMap.summary.schoolOwnedDirect.length}`);
console.log(`         school_owned_indirect: ${relationshipMap.summary.schoolOwnedIndirect.length}`);
console.log(`         global_or_unscoped:    ${relationshipMap.summary.globalOrUnscoped.length}`);
