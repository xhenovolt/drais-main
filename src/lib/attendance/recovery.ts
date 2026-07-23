/**
 * Automatic Attendance Recovery (Phase 6 of the Intelligence Program).
 *
 * DRAIS already HAS the recovery mechanisms — TCP pull + staging + commit
 * (device-control wizard), the outbox drainer, duplicate-safe ingest. What
 * was missing is the layer that NOTICES attendance stopped and points the
 * operator at the right recovery, instead of the founder discovering a gap
 * days later. This module is that layer:
 *
 *   detectGaps()   per-device: compare today's ingest against the learned
 *                  daily volume + last-seen; classify the gap and RECOMMEND a
 *                  recovery method (LAN pull / check device / retry queue…).
 *   recommendMethod()  PURE — the decision, unit-tested with no DB.
 *
 * Nothing is auto-applied. Recovery stays operator-confirmed (the wizard and
 * drain endpoints do the actual work); this only diagnoses and routes.
 */
import { query } from '@/lib/db';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';

export type RecoveryMethod =
  | 'lan_pull' | 'check_device' | 'retry_queue' | 'resume_acquisition' | 'none';

export interface GapSignal {
  deviceKnown: boolean;
  lanIp: string | null;
  isOnline: boolean;
  minutesSinceLastPunch: number | null;   // null = never
  minutesSinceLastSeen: number | null;     // heartbeat age
  expectedByNow: number;                    // learned punches expected by this hour
  gotToday: number;                         // punches ingested today
  stuckAcquisition: boolean;                // a pull is staged/validated but uncommitted
  stuckQueue: number;                        // notifications queued > 15 min
  schoolHour: number;                        // 0..23 school-local
}

export interface GapVerdict {
  status: 'ok' | 'watch' | 'gap';
  method: RecoveryMethod;
  reason: string;
  actionLabel: string;
}

/** PURE: given the signals, what (if anything) is wrong and how to recover. */
export function recommendMethod(s: GapSignal): GapVerdict {
  // Uncommitted pull sitting in staging → just finish it.
  if (s.stuckAcquisition) {
    return { status: 'gap', method: 'resume_acquisition', reason: 'A device pull is staged but never committed.', actionLabel: 'Open Device Control to review & commit' };
  }
  // Before the school day really starts, low volume is expected.
  if (s.schoolHour < 7) {
    return { status: 'ok', method: 'none', reason: 'Before school hours — nothing expected yet.', actionLabel: '' };
  }

  const shortfall = s.expectedByNow > 0 ? 1 - s.gotToday / s.expectedByNow : (s.gotToday > 0 ? 0 : 1);
  const stalePunch = s.minutesSinceLastPunch == null || s.minutesSinceLastPunch > 180;

  // Severe: expected a real volume by now, got almost nothing.
  if (s.expectedByNow >= 5 && shortfall >= 0.7 && stalePunch) {
    if (s.deviceKnown && s.lanIp) {
      return { status: 'gap', method: 'lan_pull', reason: `Only ${s.gotToday} of ~${s.expectedByNow} expected punches, and none in over 3h — the device likely stored without uploading.`, actionLabel: 'Pull today from the device over LAN' };
    }
    return { status: 'gap', method: 'check_device', reason: `Only ${s.gotToday} of ~${s.expectedByNow} expected punches and no LAN route — check power/network at the school.`, actionLabel: 'Inspect the device on site' };
  }

  // Queue backlog is its own recoverable failure.
  if (s.stuckQueue > 0) {
    return { status: 'watch', method: 'retry_queue', reason: `${s.stuckQueue} parent SMS stuck in the queue.`, actionLabel: 'Retry the notification queue' };
  }

  // Moderate: partial shortfall or a long silent stretch, device reachable.
  if ((s.expectedByNow >= 5 && shortfall >= 0.4) || (stalePunch && s.gotToday > 0 && s.schoolHour < 16)) {
    if (s.deviceKnown && s.lanIp) {
      return { status: 'watch', method: 'lan_pull', reason: `Punch volume is below normal (${s.gotToday}/~${s.expectedByNow}) — a LAN pull will backfill anything stored offline.`, actionLabel: 'Pull today to backfill' };
    }
    return { status: 'watch', method: 'check_device', reason: 'Punch volume below normal and no LAN route.', actionLabel: 'Check the device' };
  }

  return { status: 'ok', method: 'none', reason: 'Attendance flowing normally.', actionLabel: '' };
}

/** Per-device gap detection for a school, today. */
export async function detectGaps(schoolId: number) {
  const off = (await resolveTimePolicy(schoolId).catch(() => ({ offsetMinutes: 180 }))).offsetMinutes;
  const localNow = new Date(Date.now() + off * 60_000);
  const localDate = localNow.toISOString().slice(0, 10);
  const schoolHour = localNow.getUTCHours();
  const utcStart = new Date(Date.parse(`${localDate}T00:00:00Z`) - off * 60_000);

  const devices = (await query(
    `SELECT sn, device_name, lan_ip, is_online, last_seen FROM devices WHERE school_id = ?`, [schoolId],
  )) as any[];

  const num = async (sql: string, params: any[]) => {
    const r = (await query(sql, params).catch(() => [{ n: 0 }])) as any[];
    return Number(r[0]?.n || 0);
  };
  const one = async (sql: string, params: any[]) => ((await query(sql, params).catch(() => [])) as any[])[0] || null;

  const results = [];
  for (const d of devices) {
    const [gotToday, lastPunch, expected, stuckAcq, stuckQ] = await Promise.all([
      num(`SELECT COUNT(*) n FROM attendance_raw_events WHERE school_id = ? AND device_sn = ? AND punch_at >= ?`, [schoolId, d.sn, utcStart]),
      one(`SELECT MAX(punch_at) t FROM attendance_raw_events WHERE school_id = ? AND device_sn = ?`, [schoolId, d.sn]),
      one(`SELECT median_daily_punches m FROM attendance_time_baselines WHERE school_id = ? AND device_sn = ?`, [schoolId, d.sn]),
      num(`SELECT COUNT(*) n FROM attendance_acquisitions WHERE school_id = ? AND status IN ('staged','validated')`, [schoolId]),
      num(`SELECT COUNT(*) n FROM notification_outbox WHERE school_id = ? AND status = 'queued' AND created_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`, [schoolId]),
    ]);

    const dailyMedian = Number(expected?.m || 0);
    // Pro-rate the learned daily volume against how far into the day we are
    // (school day treated as ~05:00–17:00 → 12h window).
    const dayFrac = Math.max(0, Math.min(1, (schoolHour - 5) / 12));
    const expectedByNow = Math.round(dailyMedian * dayFrac);

    const signal: GapSignal = {
      deviceKnown: true,
      lanIp: d.lan_ip || null,
      isOnline: Number(d.is_online) === 1,
      minutesSinceLastPunch: lastPunch?.t ? Math.round((Date.now() - new Date(lastPunch.t).getTime()) / 60_000) : null,
      minutesSinceLastSeen: d.last_seen ? Math.round((Date.now() - new Date(d.last_seen).getTime()) / 60_000) : null,
      expectedByNow, gotToday,
      stuckAcquisition: stuckAcq > 0,
      stuckQueue: stuckQ,
      schoolHour,
    };
    results.push({
      device_sn: d.sn, device_name: d.device_name, lan_ip: d.lan_ip, is_online: Number(d.is_online) === 1,
      got_today: gotToday, expected_by_now: expectedByNow,
      last_punch: lastPunch?.t ?? null,
      verdict: recommendMethod(signal),
    });
  }

  // School-wide signals not tied to one device (queue, orphan pulls).
  const stuckQ = await num(`SELECT COUNT(*) n FROM notification_outbox WHERE school_id = ? AND status = 'queued' AND created_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`, [schoolId]);
  const stuckAcq = await num(`SELECT COUNT(*) n FROM attendance_acquisitions WHERE school_id = ? AND status IN ('staged','validated')`, [schoolId]);

  return {
    local_date: localDate, school_hour: schoolHour,
    devices: results,
    queue: { stuck: stuckQ },
    staging: { uncommitted: stuckAcq },
    summary: {
      gaps: results.filter(r => r.verdict.status === 'gap').length,
      watch: results.filter(r => r.verdict.status === 'watch').length,
    },
  };
}
