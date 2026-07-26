/**
 * Control Center — platform settings + maintenance mode (Phase 23 / E-20).
 *
 * A tiny KV store for platform-wide flags, and a maintenance switch used to make
 * a risky deploy/migration safe:
 *   • 'off'        — normal.
 *   • 'banner'     — show a notice to all schools; full access.
 *   • 'read_only'  — show a notice AND block tenant writes (enforced in the
 *                    `withRoute` wrapper); reads still work. Control Center is
 *                    never blocked, so an operator can always turn it back off.
 *
 * `isReadOnly` is PURE + unit-tested. `getMaintenance` is cached (30s) so it adds
 * no per-request DB cost on the hot path.
 */
import { query } from '@/lib/db';

export type MaintenanceMode = 'off' | 'banner' | 'read_only';
export const MAINTENANCE_MODES: MaintenanceMode[] = ['off', 'banner', 'read_only'];

/** PURE: does this mode block tenant writes? */
export function isReadOnly(mode: string | null | undefined): boolean {
  return mode === 'read_only';
}

let ensured: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = query(
    `CREATE TABLE IF NOT EXISTS platform_settings (
       key_name VARCHAR(64) PRIMARY KEY,
       value_text TEXT,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, [],
  ).then(() => undefined).catch(() => undefined);
  return ensured;
}

export async function getSetting(key: string): Promise<string | null> {
  await ensureSchema();
  const r = (await query(`SELECT value_text FROM platform_settings WHERE key_name = ? LIMIT 1`, [key]).catch(() => [])) as any[];
  return r[0]?.value_text ?? null;
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  await ensureSchema();
  await query(
    `INSERT INTO platform_settings (key_name, value_text) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE value_text = VALUES(value_text)`,
    [key, value],
  ).catch(() => {});
}

export interface Maintenance { mode: MaintenanceMode; message: string }

let cache: { v: Maintenance; exp: number } | null = null;

/** Current maintenance state (30s cache — safe default 'off' on any error). */
export async function getMaintenance(): Promise<Maintenance> {
  if (cache && cache.exp > Date.now()) return cache.v;
  let v: Maintenance = { mode: 'off', message: '' };
  try {
    const raw = await getSetting('maintenance');
    if (raw) {
      const p = JSON.parse(raw);
      v = { mode: (MAINTENANCE_MODES as string[]).includes(p.mode) ? p.mode : 'off', message: String(p.message || '') };
    }
  } catch { /* default off */ }
  cache = { v, exp: Date.now() + 30_000 };
  return v;
}

export async function setMaintenance(mode: MaintenanceMode, message: string): Promise<Maintenance> {
  const v: Maintenance = { mode: (MAINTENANCE_MODES.includes(mode) ? mode : 'off'), message: String(message || '').slice(0, 300) };
  await setSetting('maintenance', JSON.stringify(v));
  cache = { v, exp: Date.now() + 30_000 };
  return v;
}
