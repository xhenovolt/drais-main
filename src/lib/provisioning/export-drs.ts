/**
 * @drais/provisioning — export one school's complete lean dataset as a
 * real .drs container. Phase 7 sub-effort 23
 * (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md).
 *
 * This is the shared engine behind BOTH scripts/db/export-drs.mjs (the
 * founder/CLI tool) and the self-service API route
 * (src/app/api/schools/offline-export/route.ts) — one implementation, two
 * callers, so the self-service path can never drift from what's already
 * been validated against real production data.
 *
 * Returns the finished .drs bytes in memory; does NOT write to disk —
 * that's the caller's job (a CLI script writes a file, an API route
 * streams an HTTP response). Keeps this module equally usable from either.
 *
 * SECURITY: schoolId here is always the caller's responsibility to have
 * already authenticated — this module does the export for WHATEVER
 * schoolId it's given, with zero session/auth awareness of its own. The
 * API route is where "which school is this?" gets answered from the
 * session, never from client input — see that route's own header.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';
import Database from 'better-sqlite3';
import { createMysqlRepos } from '../repo/mysql';
import { ensureSchema } from '../repo/sqlite/schema';
import { SHELL_SCHEMA_SQL, SHELL_SCHEMA_INDEXES_SQL } from '../repo/sqlite/shell-schema.generated';
import { provisionSchool, type ProvisionResult } from './provision-school';
import { writeDrsFile } from '../container/write-drs';
import { onlineConfig } from '../db/pools';

/** Large/historical/telemetry tables — schema always created, data
 *  deliberately excluded by policy even where ownership resolves. Named
 *  explicitly by the lean-export brief (audit_logs, class_results) plus
 *  every other table confirmed, via real information_schema stats, to be
 *  in the same shape (device/zk logs, system logs, notification/SMS
 *  delivery logs, platform/control audit, biometric BLOBs, finance import
 *  staging rows). Revisit if a future module needs one of these offline. */
const LARGE_EXCLUDED = new Set([
  'zk_parsed_logs', 'zk_device_logs', 'zk_raw_logs', 'zk_attendance_logs', 'zk_device_commands', 'zk_user_mapping',
  'system_logs', 'device_heartbeats', 'device_user_directory',
  'attendance_records', 'attendance_raw_events', 'attendance_sms_decisions',
  'class_results', 'results',
  'audit_logs', 'control_audit_logs', 'platform_api_audit',
  'notifications', 'notification_outbox', 'notification_deliveries', 'user_notifications',
  'sms_usage_events', 'sentinel_observations', 'template_distributions',
  'biometric_templates', 'finance_import_rows',
]);

/** Tables provisionSchool() already owns (structural + auth data) — never
 *  double-copied by this module's own raw-copy pass. */
const PROVISIONING_OWNED = new Set([
  'schools', 'people', 'students', 'staff', 'classes', 'enrollments', 'subjects', 'terms', 'academic_years',
  'departments', 'class_subjects', 'attendance_rules', 'permissions', 'roles', 'role_permissions', 'user_roles',
  'users', 'report_snapshots',
]);

const OWNER_COLUMN_CONVENTIONS: Array<[string, string, string]> = [
  ['student_id', 'students', 'id'], ['class_id', 'classes', 'id'], ['staff_id', 'staff', 'id'],
  ['teacher_id', 'staff', 'id'], ['person_id', 'people', 'id'], ['enrollment_id', 'enrollments', 'id'],
  ['user_id', 'users', 'id'],
];
const LEGACY_SCOPES: Record<string, string> = {
  villages: 'id IN (SELECT village_id FROM `students` WHERE school_id = ? AND village_id IS NOT NULL)',
  enrollment_programs: 'enrollment_id IN (SELECT id FROM `enrollments` WHERE school_id = ?)',
  biometric_templates: 'enrollment_id IN (SELECT id FROM `biometric_enrollments` WHERE school_id = ?)',
  student_next_of_kin: 'student_id IN (SELECT id FROM `students` WHERE school_id = ?)',
  student_requirements: 'student_id IN (SELECT id FROM `students` WHERE school_id = ?)',
  student_custom_values: 'student_id IN (SELECT id FROM `students` WHERE school_id = ?)',
  student_additional_info: 'student_id IN (SELECT id FROM `students` WHERE school_id = ?)',
};
const GLOBAL_REFERENCE_TABLES = new Set(['permissions', 'curriculums']);
const GLOBAL_REFERENCE_SCOPES: Record<string, string> = {
  role_permissions: 'role_id IN (SELECT id FROM `roles` WHERE school_id = ?)',
};

function sqlValueFor(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

export interface ExportDrsOptions {
  schoolId: number;
  passphrase: string;
  /** Observability hook — the API route uses this to report real progress,
   *  not fake/simulated steps (the brief's own "do not show fake progress"
   *  rule). Optional for the CLI caller, which just logs to console. */
  onProgress?: (step: string, detail?: unknown) => void;
}

export interface ExportDrsTableReport {
  table: string;
  policy: 'provisioning-owned' | 'school-scoped' | 'global-reference' | 'LARGE-EXCLUDED (schema kept)' | 'schema-only (ambiguous ownership)' | 'COPY-FAILED';
  rows: number;
  error?: string;
}

export interface ExportDrsResult {
  drsBuffer: Buffer;
  fileNameSafe: string;
  sizeBytes: number;
  provisionResult: ProvisionResult;
  tableReport: ExportDrsTableReport[];
  totalRows: number;
  generatedAt: string;
}

export async function exportSchoolToDrs(opts: ExportDrsOptions): Promise<ExportDrsResult> {
  const { schoolId, passphrase, onProgress } = opts;
  const progress = onProgress ?? (() => {});

  const conn = mysql.createPool({ ...onlineConfig(), waitForConnections: true, connectionLimit: 5, enableKeepAlive: true, keepAliveInitialDelay: 10000 });
  try {
    progress('resolving-school');
    const [[school]] = await conn.query('SELECT id, name FROM schools WHERE id = ?', [schoolId]) as any[];
    if (!school) throw new Error(`School ${schoolId} was not found`);

    progress('discovering-schema');
    const [tableRows] = await conn.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'") as any[];
    const tables: string[] = tableRows.map((r: any) => r.TABLE_NAME).filter((t: string) => /^[A-Za-z0-9_]+$/.test(t));
    const tableSet = new Set(tables);
    const [columnRows] = await conn.query('SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()') as any[];
    const columns = new Map<string, Set<string>>();
    for (const row of columnRows as any[]) {
      if (!columns.has(row.TABLE_NAME)) columns.set(row.TABLE_NAME, new Set());
      columns.get(row.TABLE_NAME)!.add(row.COLUMN_NAME);
    }
    const [fkRows] = await conn.query('SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL') as any[];
    const edges = new Map<string, any[]>();
    for (const fk of fkRows as any[]) {
      if (tableSet.has(fk.TABLE_NAME) && tableSet.has(fk.REFERENCED_TABLE_NAME)) {
        if (!edges.has(fk.TABLE_NAME)) edges.set(fk.TABLE_NAME, []);
        edges.get(fk.TABLE_NAME)!.push(fk);
      }
    }
    const scopeCache = new Map<string, string | null>();
    function scopeFor(table: string, seen: Set<string> = new Set()): string | null {
      if (scopeCache.has(table)) return scopeCache.get(table)!;
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
      const cols = columns.get(table);
      if (cols) {
        for (const [col, refTable, refCol] of OWNER_COLUMN_CONVENTIONS) {
          if (!cols.has(col) || !tableSet.has(refTable)) continue;
          const parentScope = scopeFor(refTable, new Set(seen));
          if (parentScope) {
            const clause = `${col} IN (SELECT ${refCol} FROM \`${refTable}\` WHERE ${parentScope})`;
            scopeCache.set(table, clause);
            return clause;
          }
        }
      }
      scopeCache.set(table, null);
      return null;
    }
    for (const [t, c] of Object.entries(LEGACY_SCOPES)) scopeCache.set(t, c);
    for (const [t, c] of Object.entries(GLOBAL_REFERENCE_SCOPES)) scopeCache.set(t, c);

    progress('creating-schema');
    const tmpSqlitePath = path.join(os.tmpdir(), `drais-export-${schoolId}-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
    let sqliteDb = new Database(tmpSqlitePath);
    sqliteDb.pragma('foreign_keys = OFF');
    ensureSchema(sqliteDb as any);
    sqliteDb.exec(SHELL_SCHEMA_SQL);
    sqliteDb.exec(SHELL_SCHEMA_INDEXES_SQL);
    sqliteDb.close();

    progress('provisioning-core-data');
    const provisionResult = await provisionSchool({ schoolId, sqlitePath: tmpSqlitePath, source: createMysqlRepos() });

    progress('copying-remaining-tables');
    sqliteDb = new Database(tmpSqlitePath);
    sqliteDb.pragma('foreign_keys = OFF');
    const tableReport: ExportDrsTableReport[] = [];
    let totalRawCopied = 0;
    for (const table of tables) {
      if (PROVISIONING_OWNED.has(table)) continue;
      const clause = scopeFor(table);
      const isGlobalRef = !clause && GLOBAL_REFERENCE_TABLES.has(table);
      if (!clause && !isGlobalRef) { tableReport.push({ table, policy: 'schema-only (ambiguous ownership)', rows: 0 }); continue; }
      if (LARGE_EXCLUDED.has(table)) { tableReport.push({ table, policy: 'LARGE-EXCLUDED (schema kept)', rows: 0 }); continue; }

      const params = isGlobalRef ? [] : [schoolId];
      const where = clause || '1 = 1';
      try {
        const [rows] = await conn.query(`SELECT * FROM \`${table}\` WHERE ${where}`, params) as any[];
        let n = 0;
        if (rows.length > 0) {
          const cols = Object.keys(rows[0]);
          const sqliteCols = new Set((sqliteDb.prepare(`PRAGMA table_info("${table}")`).all() as any[]).map((c) => c.name));
          const usableCols = cols.filter((c) => sqliteCols.has(c));
          const colList = usableCols.map((c) => `"${c}"`).join(', ');
          const placeholders = usableCols.map((c) => `@${c}`).join(', ');
          const stmt = sqliteDb.prepare(`INSERT OR REPLACE INTO "${table}" (${colList}) VALUES (${placeholders})`);
          const insertMany = sqliteDb.transaction((rs: any[]) => {
            for (const row of rs) {
              const rowParams: Record<string, unknown> = {};
              for (const c of usableCols) rowParams[c] = sqlValueFor(row[c]);
              stmt.run(rowParams);
            }
          });
          insertMany(rows);
          n = rows.length;
        }
        totalRawCopied += n;
        tableReport.push({ table, policy: isGlobalRef ? 'global-reference' : 'school-scoped', rows: n });
      } catch (e) {
        tableReport.push({ table, policy: 'COPY-FAILED', rows: 0, error: e instanceof Error ? e.message : String(e) });
      }
    }
    sqliteDb.close();
    progress('raw-copy-complete', { totalRawCopied, tablesCopied: tableReport.filter((r) => r.rows > 0).length });

    progress('encrypting');
    const payload = fs.readFileSync(tmpSqlitePath);
    const drsResult = await writeDrsFile({
      payload, passphrase, outPath: tmpSqlitePath + '.drs',
      meta: { schoolId, drAisAppVersionMin: process.env.npm_package_version || '0.0.0' },
    });
    const drsBuffer = fs.readFileSync(tmpSqlitePath + '.drs');
    fs.unlinkSync(tmpSqlitePath);
    fs.unlinkSync(tmpSqlitePath + '.drs');

    const provisionedRowTotal = Object.entries(provisionResult.counts).reduce((s, [, v]) => s + (v as number), 0);
    const totalRows = provisionedRowTotal + totalRawCopied;

    progress('done', { sizeBytes: drsBuffer.length, totalRows });

    return {
      drsBuffer,
      fileNameSafe: `${String(school.name).replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40)}-${schoolId}`,
      sizeBytes: drsBuffer.length,
      provisionResult,
      tableReport,
      totalRows,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    await conn.end();
  }
}
