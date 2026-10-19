/**
 * Device uptime — how long each biometric device has been online / offline.
 *
 * SOURCE OF TRUTH: contact. Every heartbeat (GET /iclock/getrequest → device_heartbeats) and every data
 * push (POST /iclock/cdata → zk_raw_logs) proves the device was reachable at that moment. Devices check
 * in every ~30–60 s, so a device is OFFLINE once nothing has been heard for the threshold
 * (platform_settings.device_offline_threshold_minutes, default 5 — a little slack over the 2-minute
 * "online now" badge so a single missed poll is not counted as an outage).
 *
 * HISTORY: device_status_events is APPEND-ONLY — one row per online⇄offline transition. It is derived
 * incrementally by syncDeviceStatusEvents(): from each device's cursor (device_status_state.last_contact_at)
 * it walks the new contact timestamps in order; a gap longer than the threshold appends
 *   offline at (previous contact + threshold)   then   online at (the next contact).
 * Running it again with no new contact appends nothing (idempotent). It runs piggybacked on the existing
 * device-status sweep and right before uptime is read, so figures are always current. History before the
 * tables existed is filled once with scripts/ops/backfill-device-uptime.ts (see its header).
 *
 * Retired devices are never synced and never appear in uptime figures.
 */
import { query } from '@/lib/db';

export const DEFAULT_OFFLINE_THRESHOLD_MINUTES = 5;
const SETTING_KEY = 'device_offline_threshold_minutes';
const DAY = 86_400_000;

let ensured: Promise<void> | null = null;
/** Additive DDL only (same as migrations/device_status_events.sql). */
export function ensureDeviceUptimeSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS device_status_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, device_sn VARCHAR(100) NOT NULL, school_id BIGINT NULL,
      status VARCHAR(10) NOT NULL, at DATETIME NOT NULL, source VARCHAR(32) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_dse_sn_at (device_sn, at), KEY idx_dse_school_at (school_id, at))`, []);
    await query(`CREATE TABLE IF NOT EXISTS device_status_state (
      device_sn VARCHAR(100) NOT NULL PRIMARY KEY, status VARCHAR(10) NOT NULL, since DATETIME NOT NULL,
      last_contact_at DATETIME NULL, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`, []);
  })().catch((e) => { ensured = null; throw e; });
  return ensured;
}

/** The configured offline threshold in minutes (1–1440), default 5. */
export async function offlineThresholdMinutes(): Promise<number> {
  try {
    const rows = (await query(`SELECT value_text FROM platform_settings WHERE key_name = ? LIMIT 1`, [SETTING_KEY])) as any[];
    const n = Number(rows[0]?.value_text);
    if (Number.isFinite(n) && n >= 1 && n <= 1440) return Math.round(n);
  } catch { /* table missing → default */ }
  return DEFAULT_OFFLINE_THRESHOLD_MINUTES;
}

export interface Transition { status: 'online' | 'offline'; at: Date; source: string }

/**
 * PURE: the transitions implied by a run of contacts, given where the device stood before them.
 * `prev` = { status, lastContact } from the cursor (or null for a device never processed);
 * `contacts` ascending; `now` closes the run (a device silent past the threshold goes offline).
 */
export function deriveTransitions(
  prev: { status: 'online' | 'offline'; lastContact: Date | null } | null,
  contacts: Array<{ at: Date; source: string }>,
  now: Date,
  thresholdMs: number,
): { transitions: Transition[]; status: 'online' | 'offline'; lastContact: Date | null } {
  const out: Transition[] = [];
  let status = prev?.status ?? null as 'online' | 'offline' | null;
  let last = prev?.lastContact ?? null;
  for (const c of contacts) {
    if (last && c.at.getTime() <= last.getTime()) continue;            // already processed
    if (status === 'online' && last && c.at.getTime() - last.getTime() > thresholdMs) {
      out.push({ status: 'offline', at: new Date(last.getTime() + thresholdMs), source: 'threshold' });
      status = 'offline';
    }
    if (status !== 'online') { out.push({ status: 'online', at: c.at, source: c.source }); status = 'online'; }
    last = c.at;
  }
  if (status === 'online' && last && now.getTime() - last.getTime() > thresholdMs) {
    out.push({ status: 'offline', at: new Date(last.getTime() + thresholdMs), source: 'threshold' });
    status = 'offline';
  }
  return { transitions: out, status: (status ?? 'offline'), lastContact: last };
}

/**
 * Append any new transitions for the given devices (default: every non-retired device).
 * Idempotent; returns how many events were appended.
 */
export async function syncDeviceStatusEvents(opts: { sns?: string[]; since?: Date; source?: string } = {}): Promise<number> {
  await ensureDeviceUptimeSchema();
  const thresholdMs = (await offlineThresholdMinutes()) * 60_000;
  const devices = (await query(
    `SELECT d.sn, d.school_id, d.last_seen, s.status, s.since, s.last_contact_at
       FROM devices d LEFT JOIN device_status_state s ON s.device_sn = d.sn
      WHERE d.deleted_at IS NULL AND LOWER(COALESCE(d.status, '')) <> 'retired'
        ${opts.sns?.length ? `AND d.sn IN (${opts.sns.map(() => '?').join(',')})` : ''}`,
    opts.sns?.length ? opts.sns : [],
  )) as any[];
  let appended = 0;
  const now = new Date();
  for (const d of devices) {
    const from: Date = d.last_contact_at ? new Date(d.last_contact_at) : (opts.since ?? new Date(now.getTime() - 30 * DAY));
    const contacts = (await query(
      `SELECT created_at AS at, 'heartbeat' AS source FROM device_heartbeats WHERE sn = ? AND created_at > ?
       UNION ALL
       SELECT created_at AS at, 'push' AS source FROM zk_raw_logs WHERE device_sn = ? AND http_method = 'POST' AND created_at > ?
       ORDER BY at`,
      [d.sn, from, d.sn, from],
    )) as any[];
    const prev = d.status ? { status: d.status as 'online' | 'offline', lastContact: d.last_contact_at ? new Date(d.last_contact_at) : null } : null;
    const { transitions, status, lastContact } = deriveTransitions(
      prev, contacts.map((c) => ({ at: new Date(c.at), source: opts.source ?? String(c.source) })), now, thresholdMs,
    );
    if (transitions.length) {
      await query(
        `INSERT INTO device_status_events (device_sn, school_id, status, at, source) VALUES ${transitions.map(() => '(?, ?, ?, ?, ?)').join(', ')}`,
        transitions.flatMap((t) => [d.sn, d.school_id ?? null, t.status, t.at, t.source]),
      );
      appended += transitions.length;
    }
    // A device with no contact in the window has been offline since it was last seen — not since "now".
    const since = transitions.length ? transitions[transitions.length - 1].at
      : d.since ? new Date(d.since) : (lastContact ?? (d.last_seen ? new Date(d.last_seen) : now));
    if (transitions.length || !d.status || (lastContact && (!d.last_contact_at || lastContact.getTime() !== new Date(d.last_contact_at).getTime()))) {
      await query(
        `INSERT INTO device_status_state (device_sn, status, since, last_contact_at, updated_at) VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE status = VALUES(status), since = VALUES(since), last_contact_at = VALUES(last_contact_at), updated_at = NOW()`,
        [d.sn, status, since, lastContact],
      );
    }
  }
  return appended;
}

let lastOpportunistic = 0;
/** Throttled (once a minute per process) — piggybacked on the device-status sweep. Never throws. */
export async function syncDeviceStatusEventsOpportunistically(): Promise<void> {
  if (Date.now() - lastOpportunistic < 60_000) return;
  lastOpportunistic = Date.now();
  try { await syncDeviceStatusEvents(); }
  catch (e) { console.error('[device-uptime] sync failed', e); }
}

export interface UptimeGap { from: string; to: string | null; minutes: number }
export interface DeviceUptime {
  sn: string; school_id: number | null; school_name: string | null; device_name: string | null;
  status: 'online' | 'offline'; since: string | null; for_minutes: number | null; last_seen: string | null;
  uptime: { today: number | null; d7: number | null; d30: number | null };
  gaps: UptimeGap[]; tracked_since: string | null; threshold_minutes: number;
}

/**
 * PURE: share of [from, to] spent online (0–100, 1 decimal), given ascending events.
 * Time before the first known event is not counted (a device added 3 days ago is not "10% up" for 30 days);
 * null when nothing of the window is known.
 */
export function uptimePercent(events: Array<{ status: string; at: Date }>, from: Date, to: Date): number | null {
  if (!events.length) return null;
  let status: string | null = null; let cursor = from.getTime(); let online = 0; let known = 0;
  for (const e of events) {
    const t = e.at.getTime();
    if (t <= from.getTime()) { status = e.status; continue; }
    if (t >= to.getTime()) break;
    if (status) { known += t - cursor; if (status === 'online') online += t - cursor; }
    status = e.status; cursor = t;
  }
  if (status) { known += to.getTime() - cursor; if (status === 'online') online += to.getTime() - cursor; }
  return known > 0 ? Math.round((online / known) * 1000) / 10 : null;
}

/** Uptime for devices (scoped to one school, or a list of schools, or all). Syncs first so it is current. */
export async function deviceUptime(opts: { schoolId?: number | null; schoolScope?: number[] | null; gapDays?: number } = {}): Promise<{ devices: DeviceUptime[]; threshold_minutes: number }> {
  await syncDeviceStatusEvents().catch((e) => console.error('[device-uptime] pre-read sync failed', e));
  const threshold = await offlineThresholdMinutes();
  const cond: string[] = [`d.deleted_at IS NULL`, `LOWER(COALESCE(d.status, '')) <> 'retired'`];
  const params: any[] = [];
  if (opts.schoolId) { cond.push('d.school_id = ?'); params.push(opts.schoolId); }
  if (Array.isArray(opts.schoolScope)) {
    if (!opts.schoolScope.length) cond.push('1 = 0');
    else { cond.push(`d.school_id IN (${opts.schoolScope.map(() => '?').join(',')})`); params.push(...opts.schoolScope); }
  }
  const devs = (await query(
    `SELECT d.sn, d.school_id, d.device_name, d.last_seen, sc.name AS school_name, st.status, st.since, st.last_contact_at
       FROM devices d LEFT JOIN schools sc ON sc.id = d.school_id LEFT JOIN device_status_state st ON st.device_sn = d.sn
      WHERE ${cond.join(' AND ')}`, params)) as any[];
  if (!devs.length) return { devices: [], threshold_minutes: threshold };

  const now = new Date();
  const from30 = new Date(now.getTime() - 30 * DAY);
  const events = (await query(
    `SELECT device_sn, status, at FROM device_status_events WHERE device_sn IN (${devs.map(() => '?').join(',')})
       AND at >= DATE_SUB(?, INTERVAL 1 DAY) ORDER BY device_sn, at, id`,
    [...devs.map((d) => d.sn), from30],
  )) as any[];
  // The status a device was in when the 30-day window opened (its last event before it).
  const before = (await query(
    `SELECT e.device_sn, e.status, e.at FROM device_status_events e
       JOIN (SELECT device_sn, MAX(at) at FROM device_status_events WHERE device_sn IN (${devs.map(() => '?').join(',')}) AND at < DATE_SUB(?, INTERVAL 1 DAY) GROUP BY device_sn) m
         ON m.device_sn = e.device_sn AND m.at = e.at`,
    [...devs.map((d) => d.sn), from30],
  )) as any[];
  const firsts = (await query(
    `SELECT device_sn, MIN(at) first_at FROM device_status_events WHERE device_sn IN (${devs.map(() => '?').join(',')}) GROUP BY device_sn`,
    devs.map((d) => d.sn),
  )) as any[];

  // "Today" in the schools' time zone (EAT, UTC+3 — every DRAIS school today).
  const eatMidnight = new Date(Math.floor((now.getTime() + 3 * 3600_000) / DAY) * DAY - 3 * 3600_000);
  const gapDays = opts.gapDays ?? 7;
  const out: DeviceUptime[] = devs.map((d) => {
    const ev = [
      ...before.filter((b) => b.device_sn === d.sn).map((b) => ({ status: b.status, at: new Date(b.at) })),
      ...events.filter((e) => e.device_sn === d.sn).map((e) => ({ status: e.status, at: new Date(e.at) })),
    ];
    const gaps: UptimeGap[] = [];
    const gapFrom = now.getTime() - gapDays * DAY;
    for (let i = 0; i < ev.length; i++) {
      if (ev[i].status !== 'offline') continue;
      const end = ev.slice(i + 1).find((x) => x.status === 'online');
      if ((end ? end.at.getTime() : now.getTime()) < gapFrom) continue;
      const mins = Math.round(((end ? end.at.getTime() : now.getTime()) - ev[i].at.getTime()) / 60000);
      gaps.push({ from: ev[i].at.toISOString(), to: end ? end.at.toISOString() : null, minutes: mins });
    }
    gaps.reverse();
    const tracked = firsts.find((x) => x.device_sn === d.sn);
    // No transition ever recorded → the honest "since" is the last time the device was heard from.
    const since = tracked && d.since ? new Date(d.since) : (d.last_contact_at || d.last_seen) ? new Date(d.last_contact_at || d.last_seen) : null;
    return {
      sn: d.sn, school_id: d.school_id ?? null, school_name: d.school_name ?? null, device_name: d.device_name ?? null,
      status: (d.status === 'online' ? 'online' : 'offline'),
      since: since ? since.toISOString() : null,
      for_minutes: since ? Math.max(0, Math.round((now.getTime() - since.getTime()) / 60000)) : null,
      last_seen: (d.last_contact_at || d.last_seen) ? new Date(d.last_contact_at || d.last_seen).toISOString() : null,
      uptime: {
        today: uptimePercent(ev, eatMidnight, now),
        d7: uptimePercent(ev, new Date(now.getTime() - 7 * DAY), now),
        d30: uptimePercent(ev, from30, now),
      },
      gaps: gaps.slice(0, 50),
      tracked_since: tracked ? new Date(tracked.first_at).toISOString() : null,
      threshold_minutes: threshold,
    };
  });
  return { devices: out, threshold_minutes: threshold };
}
