/**
 * Device inventory polling — the device's OWN answer to "who is stored
 * on you right now".
 *
 * Two methods:
 *   tcp  — connect over LAN and call getUsers() (full list: PIN, name,
 *          card, privilege). Reliable when DRAIS shares the device LAN
 *          (offline / relay build). This is the source of truth.
 *   adms — queue DATA QUERY USERINFO; the device POSTs its USER rows to
 *          /api/zk-handler, which calls completeAdmsInventoryRun(). Works
 *          for cloud deployments that can't reach the LAN, but K40
 *          firmware support is inconsistent (run may stay pending).
 *
 * Every pull is recorded in device_inventory_runs. The displayed
 * on-device count comes from the latest COMPLETED run — never from
 * DRAIS-side tables. Returned users are snapshotted into
 * device_user_directory stamped with the run id; rows for this device
 * not seen in the run are marked has_recent_echo = 0 (stale on device).
 */
import { query } from '@/lib/db';

const ZKLib = require('node-zklib');

export interface InventoryUser {
  pin: string;
  name: string;
  card?: string | null;
  privilege?: number | null;
}

export interface InventoryRunResult {
  ok: boolean;
  runId: number;
  status: 'completed' | 'failed' | 'pending';
  method: 'tcp' | 'adms';
  usersReturned?: number;
  users?: InventoryUser[];
  error?: string;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

async function openRun(
  schoolId: number, sn: string, method: 'tcp' | 'adms',
  triggeredBy: number | null, commandId: number | null,
): Promise<number> {
  const ins = (await query(
    `INSERT INTO device_inventory_runs (school_id, device_sn, method, status, command_id, triggered_by)
     VALUES (?, ?, ?, 'running', ?, ?)`,
    [schoolId, sn, method, commandId, triggeredBy],
  )) as any;
  return ins.insertId;
}

/**
 * Snapshot a returned user list into device_user_directory, stamping
 * the run id. Marks directory rows for this device NOT in the snapshot
 * as has_recent_echo = 0. Returns how many rows were written.
 */
async function snapshotDirectory(
  schoolId: number, sn: string, runId: number, users: InventoryUser[],
): Promise<void> {
  for (const u of users) {
    const pin = String(u.pin).trim();
    const name = (u.name || '').trim();
    if (!pin) continue;
    await query(
      `INSERT INTO device_user_directory
         (school_id, device_sn, device_user_id, device_name, device_card, device_priv,
          last_sync_run_id, has_recent_echo, directory_status, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'active', NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         device_name = COALESCE(NULLIF(VALUES(device_name), ''), device_name),
         device_card = COALESCE(NULLIF(VALUES(device_card), ''), device_card),
         device_priv = COALESCE(NULLIF(VALUES(device_priv), ''), device_priv),
         last_sync_run_id = VALUES(last_sync_run_id),
         has_recent_echo = 1,
         directory_status = 'active',
         school_id = COALESCE(school_id, VALUES(school_id)),
         last_seen = NOW()`,
      [schoolId, sn, pin, name || `PIN ${pin}`, u.card ?? null,
       u.privilege != null ? String(u.privilege) : null, runId],
    );
  }
  // Anything for this device NOT in this run is stale on the device.
  await query(
    `UPDATE device_user_directory
        SET has_recent_echo = 0
      WHERE device_sn = ? AND (school_id = ? OR school_id IS NULL)
        AND (last_sync_run_id IS NULL OR last_sync_run_id <> ?)`,
    [sn, schoolId, runId],
  );
}

async function completeRun(runId: number, count: number): Promise<void> {
  await query(
    `UPDATE device_inventory_runs
        SET status = 'completed', completed_at = NOW(), users_returned_count = ?
      WHERE id = ?`,
    [count, runId],
  );
}

async function failRun(runId: number, error: string): Promise<void> {
  await query(
    `UPDATE device_inventory_runs
        SET status = 'failed', completed_at = NOW(), error_message = ?
      WHERE id = ?`,
    [error.slice(0, 2000), runId],
  );
}

/** Persist the device's confirmed count onto the device row (source of
 *  truth for the UI), tagged so we know it came from an inventory pull. */
async function stampDeviceCount(sn: string, count: number, method: string): Promise<void> {
  await query(
    `UPDATE devices
        SET device_user_count = ?, device_user_count_at = NOW(),
            device_user_count_source = ?, updated_at = CURRENT_TIMESTAMP
      WHERE sn = ?`,
    [count, `inventory_${method}`, sn],
  );
}

/**
 * TCP inventory pull. Returns the full user list. getUsers() is flaky on
 * a cold connection (can return 0 while the device actually holds N) —
 * we cross-check getInfo().userCounts and retry once if the list looks
 * empty but the counter says otherwise.
 */
export async function runTcpInventory(opts: {
  schoolId: number; sn: string; lanIp: string; port?: number; triggeredBy?: number | null;
}): Promise<InventoryRunResult> {
  const { schoolId, sn, lanIp } = opts;
  const port = opts.port ?? 4370;
  const runId = await openRun(schoolId, sn, 'tcp', opts.triggeredBy ?? null, null);

  const readOnce = async (): Promise<InventoryUser[]> => {
    const zk = new ZKLib(lanIp, port, 8000, 5200);
    try {
      await withTimeout(zk.createSocket(), 9000, 'connect');
      try { await withTimeout(zk.zklibTcp.enableDevice(), 5000, 'enable'); } catch { /* optional */ }
      let expected = 0;
      try { const info: any = await withTimeout(zk.getInfo(), 8000, 'getInfo'); expected = Number(info?.userCounts) || 0; } catch { /* ignore */ }
      let list: any[] = [];
      try { const r: any = await withTimeout(zk.getUsers(), 15000, 'getUsers'); list = r?.data || []; } catch { /* ignore */ }
      // Flaky cold read: counter says users exist but list came back empty.
      if (list.length === 0 && expected > 0) {
        try { const r2: any = await withTimeout(zk.getUsers(), 15000, 'getUsers#2'); list = r2?.data || []; } catch { /* ignore */ }
      }
      return list.map((u: any) => ({
        pin: String(u.userId ?? u.uid ?? '').trim(),
        name: String(u.name ?? '').trim(),
        card: u.cardno ? String(u.cardno) : null,
        privilege: u.role != null ? Number(u.role) : null,
      })).filter((u: InventoryUser) => u.pin);
    } finally {
      try { await zk.disconnect(); } catch { /* ignore */ }
    }
  };

  try {
    const users = await readOnce();
    await snapshotDirectory(schoolId, sn, runId, users);
    await completeRun(runId, users.length);
    await stampDeviceCount(sn, users.length, 'tcp');
    return { ok: true, runId, status: 'completed', method: 'tcp', usersReturned: users.length, users };
  } catch (e: any) {
    await failRun(runId, e.message || String(e));
    return { ok: false, runId, status: 'failed', method: 'tcp', error: e.message || String(e) };
  }
}

/**
 * ADMS inventory pull — queue DATA QUERY USERINFO and open a pending
 * run. Completion happens later in the zk-handler when the device POSTs
 * its USER rows (completeAdmsInventoryRun). Returns immediately.
 */
export async function queueAdmsInventory(opts: {
  schoolId: number; sn: string; triggeredBy?: number | null;
}): Promise<InventoryRunResult> {
  const { schoolId, sn } = opts;
  // Dedup an in-flight command.
  const existing = (await query(
    `SELECT id FROM zk_device_commands
      WHERE device_sn = ? AND command = 'DATA QUERY USERINFO' AND status IN ('pending','sent') LIMIT 1`,
    [sn],
  )) as Array<{ id: number }>;
  let commandId = existing[0]?.id ?? null;
  if (!commandId) {
    const ins = (await query(
      `INSERT INTO zk_device_commands (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
       VALUES (?, ?, 'DATA QUERY USERINFO', 10, 3, DATE_ADD(NOW(), INTERVAL 1 HOUR), ?)`,
      [schoolId, sn, opts.triggeredBy ?? null],
    )) as any;
    commandId = ins.insertId;
  }
  const runId = await openRun(schoolId, sn, 'adms', opts.triggeredBy ?? null, commandId);
  // Mark pending (not running) — it only "runs" once the device responds.
  await query(`UPDATE device_inventory_runs SET status = 'pending' WHERE id = ?`, [runId]);
  return { ok: true, runId, status: 'pending', method: 'adms' };
}

/**
 * Called from the zk-handler when a device POSTs USERINFO rows. If an
 * open ADMS inventory run exists for the device, stamp those rows to it
 * and complete it. Best-effort; never throws into the ingest path.
 */
export async function completeAdmsInventoryRun(
  schoolId: number, sn: string, users: InventoryUser[],
): Promise<void> {
  try {
    const open = (await query(
      `SELECT id FROM device_inventory_runs
        WHERE device_sn = ? AND method = 'adms' AND status IN ('pending','running')
        ORDER BY id DESC LIMIT 1`,
      [sn],
    )) as Array<{ id: number }>;
    if (open.length === 0) return; // no operator-requested run; directory still updated elsewhere
    const runId = open[0].id;
    await snapshotDirectory(schoolId, sn, runId, users);
    await completeRun(runId, users.length);
    await stampDeviceCount(sn, users.length, 'adms');
  } catch (err) {
    console.warn('[inventory] completeAdmsInventoryRun failed:', err);
  }
}

/** Latest inventory run for a device (any status). */
export async function getLatestInventoryRun(sn: string): Promise<any | null> {
  const rows = (await query(
    `SELECT id, method, status, users_returned_count, started_at, completed_at, error_message
       FROM device_inventory_runs WHERE device_sn = ? ORDER BY id DESC LIMIT 1`,
    [sn],
  )) as any[];
  return rows[0] ?? null;
}
