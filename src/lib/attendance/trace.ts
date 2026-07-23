/**
 * Attendance Digital Twin (Phase 2) — every punch is a fully traceable event.
 *
 *   Fingerprint → Device → Device Time → Server Receive → Correction Engine →
 *   Identity Resolution → Attendance Record → Popup → SMS → Audit
 *
 * All stage evidence already lives in existing tables (audit: every stage
 * writes status somewhere); this module is the READ MODEL that assembles it,
 * plus one lightweight hot-path stamp (attendance_raw_events.popup_at, set
 * fire-and-forget by live-scan when the popup payload is served).
 *
 * composeStages() is PURE — the whole stage state machine is unit-testable
 * without a database. If something fails, the first red stage IS the answer
 * to "where did it break?".
 */
import { query } from '@/lib/db';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';

let ensured: Promise<void> | null = null;
export function ensureTraceSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try { await query(`ALTER TABLE attendance_raw_events ADD COLUMN popup_at DATETIME DEFAULT NULL`, []); }
    catch { /* exists */ }
  })();
  return ensured;
}

export type StageStatus = 'ok' | 'warn' | 'fail' | 'skip' | 'info';

export interface TraceStage {
  key: string;
  label: string;
  status: StageStatus;
  at: string | null;        // ISO timestamp where applicable
  detail: string;
}

export interface TraceInput {
  raw: {
    id: number; device_sn: string | null; device_user_id: string | null;
    punch_at: string | Date; device_reported_time: string | Date | null; ingested_at: string | Date | null;
    source: string | null; time_source: string | null; clock_skew_seconds: number | null;
    matched: number; person_id: number | null; role_type: string | null;
    resolution_path: string | null; resolution_score: number | null;
    is_provisional: number | null; provisional_reason: string | null;
    display_name: string | null; derived_event: string | null; popup_at: string | null;
    verify_type: number | null;
  };
  corrections: Array<{ id: number; shift_minutes: number; applied_at: string; undone_at: string | null }>;
  record: {
    status: string; rule_id: number | null; first_in_at: string | null;
    late_minutes: number | null; evaluated_at: string | null;
  } | null;
  sms: Array<{ status: string; attempts: number; last_error: string | null; delivered_at: string | null; created_at: string }>;
}

const iso = (v: any): string | null => (v ? new Date(v).toISOString() : null);

/** PURE: the punch lifecycle as ordered, statused stages. */
export function composeStages(t: TraceInput): TraceStage[] {
  const s: TraceStage[] = [];
  const raw = t.raw;

  // 1 · Fingerprint / capture
  s.push({
    key: 'capture', label: 'Fingerprint / capture', status: 'ok', at: iso(raw.device_reported_time) ?? iso(raw.punch_at),
    detail: `PIN ${raw.device_user_id ?? '?'} verified on the device${raw.verify_type != null ? ` (method ${raw.verify_type})` : ''}.`,
  });

  // 2 · Device
  s.push({
    key: 'device', label: 'Device', status: raw.device_sn ? 'ok' : 'warn', at: null,
    detail: raw.device_sn ? `Recorded by ${raw.device_sn}.` : 'No device serial recorded.',
  });

  // 3 · Device time
  const skew = raw.clock_skew_seconds == null ? null : Number(raw.clock_skew_seconds);
  const skewBad = skew != null && Math.abs(skew) > 300;
  s.push({
    key: 'device_time', label: 'Device time', status: skewBad ? 'warn' : 'ok', at: iso(raw.device_reported_time),
    detail: raw.device_reported_time
      ? `Device wall time ${(raw.device_reported_time instanceof Date
          ? raw.device_reported_time.toISOString()
          : String(raw.device_reported_time)).replace('T', ' ').slice(0, 19)}${skew ? ` · skew ${Math.round(skew / 60)} min` : ''}.`
      : 'Device did not report a wall time (server instant used).',
  });

  // 4 · Server receive
  const lagMin = raw.ingested_at && raw.punch_at
    ? Math.round((new Date(raw.ingested_at).getTime() - new Date(raw.punch_at).getTime()) / 60_000) : null;
  s.push({
    key: 'receive', label: 'Server receive', status: raw.ingested_at ? 'ok' : 'warn', at: iso(raw.ingested_at),
    detail: raw.ingested_at
      ? `Received via ${raw.source || 'unknown'}${lagMin != null && lagMin > 10 ? ` · uploaded ${lagMin > 120 ? Math.round(lagMin / 60) + 'h' : lagMin + ' min'} after the punch (store-and-forward)` : ''}.`
      : 'Ingest instant missing (legacy row).',
  });

  // 5 · Correction engine
  const activeCorr = t.corrections.filter(c => !c.undone_at);
  s.push({
    key: 'correction', label: 'Time correction', status: activeCorr.length ? 'warn' : 'ok',
    at: activeCorr.length ? iso(activeCorr[activeCorr.length - 1].applied_at) : null,
    detail: activeCorr.length
      ? `Batch-corrected ${activeCorr.map(c => `${c.shift_minutes > 0 ? '+' : ''}${c.shift_minutes} min`).join(', ')} (original device time preserved).`
      : `No correction needed — punch instant trusted (${raw.time_source || 'device'}).`,
  });

  // 6 · Identity resolution
  const matched = Number(raw.matched) === 1 && raw.person_id != null;
  s.push({
    key: 'identity', label: 'Identity resolution',
    status: matched ? (Number(raw.is_provisional) ? 'warn' : 'ok') : 'fail', at: null,
    detail: matched
      ? `${raw.display_name || `person #${raw.person_id}`} (${raw.role_type || '?'}) via ${raw.resolution_path || 'enrollment'}${raw.resolution_score != null ? ` · score ${raw.resolution_score}` : ''}${Number(raw.is_provisional) ? ` · PROVISIONAL: ${raw.provisional_reason || 'unconfirmed'}` : ''}.`
      : `UNMATCHED — PIN ${raw.device_user_id ?? '?'} has no confirmed person. Use Detect & map / Identity Matching.`,
  });

  // 7 · Attendance record (verdict)
  if (!matched) {
    s.push({ key: 'verdict', label: 'Attendance record', status: 'skip', at: null, detail: 'Skipped — no identity, so no day verdict.' });
  } else if (t.record) {
    s.push({
      key: 'verdict', label: 'Attendance record', status: 'ok', at: iso(t.record.evaluated_at),
      detail: `Day verdict: ${t.record.status}${Number(t.record.late_minutes) ? ` (+${t.record.late_minutes} min late)` : ''} · rule #${t.record.rule_id ?? '—'}${raw.derived_event ? ` · this punch: ${raw.derived_event}` : ''}.`,
    });
  } else {
    s.push({ key: 'verdict', label: 'Attendance record', status: 'warn', at: null, detail: 'No day verdict found — engine may not have evaluated this date yet.' });
  }

  // 8 · Live popup
  s.push({
    key: 'popup', label: 'Live popup', status: raw.popup_at ? 'ok' : 'info', at: iso(raw.popup_at),
    detail: raw.popup_at ? 'Popup served to the live screen.' : 'Not served live (offline batch upload, or arrived before popup tracking).',
  });

  // 9 · SMS
  if (!t.sms.length) {
    s.push({ key: 'sms', label: 'Parent SMS', status: 'info', at: null, detail: 'No SMS generated for this person/day (policy-dependent).' });
  } else {
    const worst = t.sms.find(m => m.status === 'failed') || t.sms.find(m => m.status === 'queued') || t.sms[0];
    const status: StageStatus = worst.status === 'failed' ? 'fail' : worst.status === 'queued' ? 'warn' : 'ok';
    s.push({
      key: 'sms', label: 'Parent SMS', status, at: iso(worst.delivered_at) ?? iso(worst.created_at),
      detail: `${t.sms.length} message(s): ${t.sms.map(m => m.status).join(', ')}${worst.last_error ? ` · ${worst.last_error}` : ''}.`,
    });
  }

  // 10 · Audit
  s.push({
    key: 'audit', label: 'Audit', status: 'ok', at: null,
    detail: `Raw event #${raw.id} is immutable evidence: verbatim device time, ingest instant and correction history are all preserved.`,
  });

  return s;
}

/** The worst stage status → row summary. */
export function traceSummary(stages: TraceStage[]): { status: StageStatus; failedStage: string | null } {
  const fail = stages.find(x => x.status === 'fail');
  if (fail) return { status: 'fail', failedStage: fail.label };
  const warn = stages.find(x => x.status === 'warn');
  if (warn) return { status: 'warn', failedStage: warn.label };
  return { status: 'ok', failedStage: null };
}

/* ── loaders ──────────────────────────────────────────────────────────── */

export async function buildPunchTrace(schoolId: number, rawEventId: number) {
  await ensureTraceSchema();
  const off = (await resolveTimePolicy(schoolId).catch(() => ({ offsetMinutes: 180 }))).offsetMinutes;
  const raws = (await query(
    `SELECT ar.*, CAST(ar.device_user_id AS CHAR) AS device_user_id
       FROM attendance_raw_events ar WHERE ar.id = ? AND ar.school_id = ? LIMIT 1`,
    [rawEventId, schoolId],
  )) as any[];
  const raw = raws[0];
  if (!raw) return null;

  const [corrections, records, sms] = await Promise.all([
    query(
      `SELECT id, shift_minutes, applied_at, undone_at FROM attendance_time_corrections
        WHERE school_id = ? AND device_sn = ? AND local_date = DATE(DATE_ADD(?, INTERVAL ? MINUTE))
        ORDER BY id ASC`,
      [schoolId, raw.device_sn, raw.punch_at, off],
    ).catch(() => []) as Promise<any[]>,
    raw.person_id ? query(
      `SELECT status, rule_id, first_in_at, late_minutes, evaluated_at FROM attendance_records
        WHERE school_id = ? AND person_id = ? AND attendance_date = DATE(DATE_ADD(?, INTERVAL ? MINUTE)) LIMIT 1`,
      [schoolId, raw.person_id, raw.punch_at, off],
    ).catch(() => []) as Promise<any[]> : Promise.resolve([]),
    raw.person_id ? query(
      `SELECT status, attempts, last_error, delivered_at, created_at FROM notification_outbox
        WHERE school_id = ? AND subject_person_id = ? AND DATE(created_at) = DATE(?)
        ORDER BY id ASC LIMIT 10`,
      [schoolId, raw.person_id, raw.punch_at],
    ).catch(() => []) as Promise<any[]> : Promise.resolve([]),
  ]);

  const stages = composeStages({ raw, corrections, record: records[0] ?? null, sms });
  return {
    event: {
      id: Number(raw.id), device_sn: raw.device_sn, device_user_id: raw.device_user_id,
      punch_at: raw.punch_at, name: raw.display_name, role_type: raw.role_type,
    },
    stages,
    summary: traceSummary(stages),
  };
}

export async function searchTraceEvents(
  schoolId: number, opts: { q?: string; date?: string; limit?: number },
) {
  await ensureTraceSchema();
  const off = (await resolveTimePolicy(schoolId).catch(() => ({ offsetMinutes: 180 }))).offsetMinutes;
  const where = ['ar.school_id = ?'];
  const params: any[] = [schoolId];
  if (opts.date) { where.push(`DATE(DATE_ADD(ar.punch_at, INTERVAL ${Number(off)} MINUTE)) = ?`); params.push(opts.date); }
  if (opts.q) {
    where.push(`(ar.display_name LIKE ? OR CAST(ar.device_user_id AS CHAR) = ? OR p.first_name LIKE ? OR p.last_name LIKE ?)`);
    params.push(`%${opts.q}%`, opts.q, `%${opts.q}%`, `%${opts.q}%`);
  }
  const rows = (await query(
    `SELECT ar.id, ar.device_sn, CAST(ar.device_user_id AS CHAR) AS device_user_id,
            ar.punch_at, ar.matched, ar.person_id, ar.role_type, ar.display_name,
            ar.derived_event, ar.popup_at, ar.is_provisional, ar.source
       FROM attendance_raw_events ar
       LEFT JOIN people p ON p.id = ar.person_id
      WHERE ${where.join(' AND ')}
      ORDER BY ar.punch_at DESC LIMIT ${Math.min(200, Math.max(1, opts.limit ?? 50))}`,
    params,
  )) as any[];
  return rows.map(r => ({
    ...r,
    flags: {
      identity: Number(r.matched) === 1 ? (Number(r.is_provisional) ? 'warn' : 'ok') : 'fail',
      verdict: r.derived_event ? 'ok' : 'info',
      popup: r.popup_at ? 'ok' : 'info',
    },
  }));
}
