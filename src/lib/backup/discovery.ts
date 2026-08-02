/**
 * Database Backup Center — table-ownership discovery.
 *
 * Adapted from scripts/db-export/01-analyze-schema.mjs's BFS (the existing,
 * already-correct logic for exactly this problem) into an importable, live
 * function instead of a standalone report script. No hardcoded table list —
 * new modules with a school_id column (or one join-hop from one) are picked
 * up automatically the next time this runs.
 *
 * Classification:
 *   direct   — table has its own school_id column. WHERE school_id = ?
 *   indirect — reachable via one or more FK hops to a school-scoped table
 *              (naming-convention inference + declared FKs, same as the
 *              analyzer script). WHERE <col> IN (SELECT ... nested by hop)
 *   global   — no path to `schools` (reference/platform tables). Excluded
 *              from school backups entirely.
 */
import { query } from '@/lib/db';

const ROOT_TABLE = 'schools';
const STALE_MS = 60_000;

export interface TableScope {
  table: string;
  ownership: 'direct' | 'indirect';
  /** SQL WHERE fragment (no leading "WHERE"), using `?` for the school id
   *  parameter — direct tables use it once, indirect tables use it once at
   *  the innermost subquery regardless of hop count. */
  whereClause: string;
}

interface Edge { fromTable: string; fromColumn: string; toTable: string; toColumn: string; }

let cache: { at: number; scopes: TableScope[] } | null = null;

function singularToTableCandidates(stem: string): string[] {
  const out = [`${stem}s`, `${stem}es`];
  if (stem.endsWith('y')) out.push(`${stem.slice(0, -1)}ies`);
  out.push(stem);
  return out;
}

/** Build the nested WHERE clause for an indirect table from its BFS path
 *  (path[0] is the edge leaving the target table; the last edge reaches
 *  `schools`). e.g. class_subjects -> classes -> schools becomes:
 *  `class_id IN (SELECT id FROM classes WHERE school_id = ?)` */
function buildIndirectWhere(path: Edge[]): string {
  function nest(i: number): string {
    const e = path[i];
    // Base case: this edge's fromColumn (e.g. `users.school_id`) IS the
    // column that directly references `schools.id` — compare it to the
    // parameter directly. `schools` itself has no `school_id` column, so
    // wrapping it in another subquery here would be wrong (and always
    // return nothing).
    if (e.toTable === ROOT_TABLE) return `${e.fromColumn} = ?`;
    return `${e.fromColumn} IN (SELECT ${e.toColumn} FROM \`${e.toTable}\` WHERE ${nest(i + 1)})`;
  }
  return nest(0);
}

export async function discoverSchoolTables(force = false): Promise<TableScope[]> {
  if (!force && cache && Date.now() - cache.at < STALE_MS) return cache.scopes;

  const [tables, cols, fks] = await Promise.all([
    query(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`, []) as Promise<Array<{ TABLE_NAME: string }>>,
    query(`SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`, []) as Promise<Array<{ TABLE_NAME: string; COLUMN_NAME: string }>>,
    query(`SELECT kcu.TABLE_NAME, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME
             FROM information_schema.KEY_COLUMN_USAGE kcu
            WHERE kcu.TABLE_SCHEMA = DATABASE() AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`, []) as Promise<Array<{ TABLE_NAME: string; COLUMN_NAME: string; REFERENCED_TABLE_NAME: string; REFERENCED_COLUMN_NAME: string }>>,
  ]);

  const tableSet = new Set(tables.map((t) => t.TABLE_NAME));
  const colsByTable = new Map<string, Set<string>>();
  for (const c of cols) {
    if (!colsByTable.has(c.TABLE_NAME)) colsByTable.set(c.TABLE_NAME, new Set());
    colsByTable.get(c.TABLE_NAME)!.add(c.COLUMN_NAME);
  }

  // Inferred edges: naming convention (`class_id` -> `classes`) + declared FKs.
  const edgeKey = (e: Edge) => `${e.fromTable}.${e.fromColumn}->${e.toTable}.${e.toColumn}`;
  const edgeMap = new Map<string, Edge>();
  for (const [table, colNames] of colsByTable) {
    for (const col of colNames) {
      if (!col.endsWith('_id') || col === 'id') continue;
      const stem = col.slice(0, -3);
      const candidates = singularToTableCandidates(stem);
      const matched = candidates.find((c) => tableSet.has(c)) ?? (tableSet.has(stem) ? stem : null);
      if (!matched) continue;
      const e: Edge = { fromTable: table, fromColumn: col, toTable: matched, toColumn: 'id' };
      edgeMap.set(edgeKey(e), e);
    }
  }
  for (const f of fks) {
    if (!tableSet.has(f.REFERENCED_TABLE_NAME)) continue;
    const e: Edge = { fromTable: f.TABLE_NAME, fromColumn: f.COLUMN_NAME, toTable: f.REFERENCED_TABLE_NAME, toColumn: f.REFERENCED_COLUMN_NAME };
    edgeMap.set(edgeKey(e), e); // declared FK overwrites an inferred duplicate — more authoritative
  }
  const adj = new Map<string, Edge[]>();
  for (const e of edgeMap.values()) {
    if (!adj.has(e.fromTable)) adj.set(e.fromTable, []);
    adj.get(e.fromTable)!.push(e);
  }

  function bfsToSchools(start: string): Edge[] | null {
    const visited = new Set([start]);
    const queue: Array<{ table: string; path: Edge[] }> = [{ table: start, path: [] }];
    while (queue.length) {
      const { table, path } = queue.shift()!;
      for (const e of adj.get(table) ?? []) {
        if (visited.has(e.toTable)) continue;
        const nextPath = [...path, e];
        if (e.toTable === ROOT_TABLE) return nextPath;
        visited.add(e.toTable);
        queue.push({ table: e.toTable, path: nextPath });
      }
    }
    return null;
  }

  const scopes: TableScope[] = [];
  for (const t of tableSet) {
    if (t === ROOT_TABLE) continue; // the school row itself is handled separately, not as a "table dump"
    if (!/^[A-Za-z0-9_]+$/.test(t)) continue; // identifier safety, same guard as schoolScopedTables()
    if (colsByTable.get(t)?.has('school_id')) {
      scopes.push({ table: t, ownership: 'direct', whereClause: 'school_id = ?' });
      continue;
    }
    const path = bfsToSchools(t);
    if (path) scopes.push({ table: t, ownership: 'indirect', whereClause: buildIndirectWhere(path) });
    // else: global/platform table — excluded from school backups entirely.
  }

  scopes.sort((a, b) => a.table.localeCompare(b.table));
  cache = { at: Date.now(), scopes };
  return scopes;
}
