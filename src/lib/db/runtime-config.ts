/**
 * Runtime DB configuration — lets an admin change database credentials from the
 * UI (no source access needed in the packaged exe).
 *
 * - read()  : current effective values (secrets masked).
 * - test()  : try a connection with given creds WITHOUT persisting.
 * - apply() : update process.env live + reset the pools (takes effect on the next
 *             query, no restart) AND persist to the desktop config file
 *             (DRAIS_CONFIG_FILE = userData/drais.env) so it survives restarts.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import mysql from 'mysql2/promise';
import { resetPool } from '@/lib/db/pools';

const ONLINE_KEYS = ['TIDB_HOST', 'TIDB_PORT', 'TIDB_USER', 'TIDB_PASSWORD', 'TIDB_DB'] as const;
const LOCAL_KEYS = ['LOCAL_MYSQL_HOST', 'LOCAL_MYSQL_PORT', 'LOCAL_MYSQL_USER', 'LOCAL_MYSQL_PASSWORD', 'LOCAL_MYSQL_DATABASE'] as const;
// DRAIS_SQLITE_PATH is read-only surfaced here (not editable via
// buildCfg/testConfig, which are mysql-only) — it's consumed directly by
// src/lib/repo/resolve.ts, not by this module's apply/test flow.
const FLAG_KEYS = ['DRAIS_ALLOW_LOCAL', 'DRAIS_DB_MODE', 'DRAIS_SQLITE_PATH'] as const;
export const EDITABLE_KEYS = [...ONLINE_KEYS, ...LOCAL_KEYS, ...FLAG_KEYS] as const;
type EditableKey = typeof EDITABLE_KEYS[number];

const SECRET_RE = /(PASSWORD|SECRET|TOKEN|KEY)/i;

/** Where to persist. Packaged: userData/drais.env (set by electron/config.cjs). */
function configFilePath(): string {
  return process.env.DRAIS_CONFIG_FILE || path.join(os.homedir(), '.drais', 'drais.env');
}

function mask(key: string, val?: string): string {
  if (val == null || val === '') return '';
  return SECRET_RE.test(key) ? '••••••••' : val;
}

/** Current effective config (masked) + whether each secret is set. */
export function readConfig() {
  const out: Record<string, { value: string; set: boolean; secret: boolean }> = {};
  for (const k of EDITABLE_KEYS) {
    const raw = process.env[k] ?? '';
    out[k] = { value: mask(k, raw), set: !!raw, secret: SECRET_RE.test(k) };
  }
  return { fields: out, configFile: configFilePath() };
}

/** ONLINE_KEYS/LOCAL_KEYS are both mysql-flavored (TIDB_* / LOCAL_MYSQL_*)
 *  — this function only ever makes sense for the two mysql2 modes.
 *  local-sqlite has no credentials to test/apply here (it's a file path,
 *  not a server) — see src/lib/repo/resolve.ts for where that's handled. */
function buildCfg(mode: 'online' | 'local-mysql', v: Partial<Record<EditableKey, string>>) {
  if (mode === 'local-mysql') {
    return {
      host: v.LOCAL_MYSQL_HOST || process.env.LOCAL_MYSQL_HOST || '127.0.0.1',
      port: parseInt(v.LOCAL_MYSQL_PORT || process.env.LOCAL_MYSQL_PORT || '3306', 10),
      user: v.LOCAL_MYSQL_USER || process.env.LOCAL_MYSQL_USER || 'root',
      password: v.LOCAL_MYSQL_PASSWORD ?? process.env.LOCAL_MYSQL_PASSWORD ?? '',
      database: v.LOCAL_MYSQL_DATABASE || process.env.LOCAL_MYSQL_DATABASE || 'drais',
    };
  }
  return {
    host: v.TIDB_HOST || process.env.TIDB_HOST || '',
    port: parseInt(v.TIDB_PORT || process.env.TIDB_PORT || '4000', 10),
    user: v.TIDB_USER || process.env.TIDB_USER || '',
    password: v.TIDB_PASSWORD ?? process.env.TIDB_PASSWORD ?? '',
    database: v.TIDB_DB || process.env.TIDB_DB || 'drais',
    ssl: { rejectUnauthorized: false },
  };
}

/** Test a connection with the given (or current) creds — never persists. */
export async function testConfig(mode: 'online' | 'local-mysql', overrides: Partial<Record<EditableKey, string>> = {}) {
  const cfg = buildCfg(mode, overrides);
  if (!cfg.user) return { ok: false, error: `${mode === 'local-mysql' ? 'Local' : 'Online'} user is required` };
  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({ ...cfg, connectTimeout: 12000 });
    const [r] = (await conn.query('SELECT DATABASE() AS db')) as any[];
    return { ok: true, database: r?.[0]?.db ?? cfg.database, host: cfg.host };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e), host: cfg.host };
  } finally {
    if (conn) { try { await conn.end(); } catch { /* ignore */ } }
  }
}

/** Apply (live) + persist. `values` are RAW; empty/undefined keys are skipped. */
export async function applyConfig(values: Partial<Record<EditableKey, string>>) {
  // 1. Update the running process so the next query uses the new creds.
  const changed: string[] = [];
  for (const k of EDITABLE_KEYS) {
    const v = values[k];
    if (v === undefined) continue;            // not provided → leave as-is
    if (SECRET_RE.test(k) && v === '') continue; // blank secret → keep existing
    process.env[k] = v;
    changed.push(k);
  }
  // 2. Reset both mysql pools so new connections pick up the new config.
  resetPool('online');
  resetPool('local-mysql');

  // 3. Persist by merging into the config file (preserve unrelated keys).
  const file = configFilePath();
  let existing: Record<string, string> = {};
  try {
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (m) existing[m[1]] = m[2];
      }
    }
  } catch { /* unreadable → start fresh */ }
  for (const k of changed) existing[k] = process.env[k] as string;

  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = Object.entries(existing).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(file, body, { mode: 0o600 });

  return { changed, configFile: file };
}
