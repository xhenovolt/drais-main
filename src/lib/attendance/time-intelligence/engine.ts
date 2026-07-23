/**
 * Time Intelligence Engine — orchestration.
 *
 *   learnBaseline()        Phase 0/6 — compute a school+device's attendance
 *                          fingerprint from 90 days of history. Re-running it
 *                          after corrections is the "learning": corrected
 *                          punch_at values sharpen the baseline.
 *   evaluateDeviceDay()    Phase 1/2 — batch stats + assessBatch → upsert
 *                          device_clock_health for the day.
 *   sweepToday()           evaluate every active device for today.
 *   previewCorrection()    Phase 4/5 — before/after rows, nothing written.
 *   applyCorrection()      shift punch_at, keep device_reported_time verbatim,
 *                          store originals for undo, re-evaluate verdicts.
 *   undoCorrection()       restore original punch_at values + re-evaluate.
 *   deviceHealthOverview() Phase 7/8 — per-device clock health + trend.
 */
import { query } from '@/lib/db';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';
import { ensureTimeIntelligenceSchema } from './schema';
import { assessBatch, median, mad, percentile, type Baseline, type BatchStats, type Assessment } from './confidence';

const MIN_PUNCHES_FOR_DAY = 5; // fewer looks like a holiday/weekend — not a school day

/** Minute-of-day (school-local) for a UTC instant. */
const minuteOfDay = (utc: Date, offsetMin: number): number => {
  const l = new Date(utc.getTime() + offsetMin * 60_000);
  return l.getUTCHours() * 60 + l.getUTCMinutes();
};
const localDateStr = (utc: Date, offsetMin: number): string =>
  new Date(utc.getTime() + offsetMin * 60_000).toISOString().slice(0, 10);

/** Robust "first arrival": the 3rd earliest punch minute of the day (one or
 *  two stray night punches can't fake an early opening). */
function firstArrivalOf(minutes: number[]): number | null {
  if (minutes.length < 3) return minutes.length ? Math.min(...minutes) : null;
  return [...minutes].sort((a, b) => a - b)[2];
}

/* ── Phase 0/6: learn the fingerprint ─────────────────────────────────── */

export async function learnBaseline(schoolId: number, deviceSn: string, windowDays = 90): Promise<Baseline | null> {
  await ensureTimeIntelligenceSchema();
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;

  const rows = (await query(
    `SELECT punch_at FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ?
        AND punch_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND punch_at < DATE_SUB(NOW(), INTERVAL 0 DAY)`,
    [schoolId, deviceSn, windowDays],
  )) as Array<{ punch_at: Date | string }>;

  // Group punches by school-local day.
  const byDay = new Map<string, number[]>();
  for (const r of rows) {
    const d = r.punch_at instanceof Date ? r.punch_at : new Date(r.punch_at);
    const key = localDateStr(d, off);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(minuteOfDay(d, off));
  }

  // Working days only (enough punches), excluding today (it may be the anomaly).
  const today = localDateStr(new Date(), off);
  const firsts: number[] = [];
  const dailyCounts: number[] = [];
  for (const [day, mins] of byDay) {
    if (day === today || mins.length < MIN_PUNCHES_FOR_DAY) continue;
    const f = firstArrivalOf(mins);
    if (f != null) { firsts.push(f); dailyCounts.push(mins.length); }
  }

  const baseline: Baseline & { earliest_minute: number | null; latest_first_minute?: number | null } = {
    median_first_minute: firsts.length ? median(firsts) : (null as any),
    mad_minutes: firsts.length ? mad(firsts) : (null as any),
    p10_first_minute: firsts.length ? percentile(firsts, 10) : null,
    p90_first_minute: firsts.length ? percentile(firsts, 90) : null,
    earliest_minute: firsts.length ? Math.min(...firsts) : null,
    latest_first_minute: firsts.length ? Math.max(...firsts) : null,
    median_daily_punches: dailyCounts.length ? median(dailyCounts) : null,
    sample_days: firsts.length,
  };

  await query(
    `INSERT INTO attendance_time_baselines
       (school_id, device_sn, median_first_minute, mad_minutes, p10_first_minute, p90_first_minute,
        earliest_minute, latest_first_minute, median_daily_punches, sample_days, window_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       median_first_minute=VALUES(median_first_minute), mad_minutes=VALUES(mad_minutes),
       p10_first_minute=VALUES(p10_first_minute), p90_first_minute=VALUES(p90_first_minute),
       earliest_minute=VALUES(earliest_minute), latest_first_minute=VALUES(latest_first_minute),
       median_daily_punches=VALUES(median_daily_punches), sample_days=VALUES(sample_days), window_days=VALUES(window_days)`,
    [schoolId, deviceSn,
      baseline.median_first_minute ?? null, baseline.mad_minutes ?? null,
      baseline.p10_first_minute, baseline.p90_first_minute,
      baseline.earliest_minute, baseline.latest_first_minute,
      baseline.median_daily_punches, baseline.sample_days, windowDays],
  );
  return baseline.sample_days ? baseline : null;
}

async function loadBaseline(schoolId: number, deviceSn: string): Promise<Baseline | null> {
  const rows = (await query(
    `SELECT median_first_minute, mad_minutes, p10_first_minute, p90_first_minute,
            earliest_minute, median_daily_punches, sample_days, computed_at
       FROM attendance_time_baselines WHERE school_id = ? AND device_sn = ? LIMIT 1`,
    [schoolId, deviceSn],
  )) as any[];
  const b = rows[0];
  if (!b) return null;
  // Stale baseline (>24h old) refreshes lazily.
  if (b.computed_at && Date.now() - new Date(b.computed_at).getTime() > 24 * 3600_000) return null;
  return b.median_first_minute == null ? null : {
    median_first_minute: Number(b.median_first_minute), mad_minutes: Number(b.mad_minutes ?? 10),
    p10_first_minute: b.p10_first_minute, p90_first_minute: b.p90_first_minute,
    earliest_minute: b.earliest_minute, median_daily_punches: b.median_daily_punches,
    sample_days: Number(b.sample_days || 0),
  };
}

/* ── Phase 1/2: assess one device-day ─────────────────────────────────── */

export async function evaluateDeviceDay(schoolId: number, deviceSn: string, dateStr?: string): Promise<Assessment & { local_date: string; batch_size: number }> {
  await ensureTimeIntelligenceSchema();
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const date = dateStr || localDateStr(new Date(), off);

  const utcStart = new Date(Date.parse(`${date}T00:00:00Z`) - off * 60_000);
  const utcEnd = new Date(utcStart.getTime() + 86_400_000);
  const rows = (await query(
    `SELECT punch_at, ingested_at FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ? AND punch_at >= ? AND punch_at < ?`,
    [schoolId, deviceSn, utcStart, utcEnd],
  )) as Array<{ punch_at: Date | string; ingested_at: Date | string | null }>;

  const nowMs = Date.now();
  const minutes: number[] = [];
  let futureCount = 0, maxFutureMinutes = 0, nearMidnight = 0, yearBad = false, outOfOrder = 0;
  let prevPunch = -Infinity;
  for (const r of rows) {
    const p = r.punch_at instanceof Date ? r.punch_at : new Date(r.punch_at);
    const m = minuteOfDay(p, off);
    minutes.push(m);
    const ing = r.ingested_at ? new Date(r.ingested_at as any).getTime() : nowMs;
    if (p.getTime() > ing + 2 * 60_000 && p.getTime() > nowMs + 2 * 60_000) {
      futureCount++;
      maxFutureMinutes = Math.max(maxFutureMinutes, Math.round((p.getTime() - Math.max(ing, nowMs)) / 60_000));
    }
    if (m < 180) nearMidnight++;
    const y = p.getUTCFullYear();
    if (y < 2020 || y > new Date().getUTCFullYear() + 1) yearBad = true;
    if (p.getTime() < prevPunch - 60_000) outOfOrder++;
    prevPunch = p.getTime();
  }

  const batch: BatchStats = {
    firstArrivalMinute: firstArrivalOf(minutes),
    punchCount: minutes.length,
    futureCount, maxFutureMinutes,
    nearMidnightCount: nearMidnight,
    yearOutOfRange: yearBad,
    outOfOrderCount: outOfOrder,
  };

  let baseline = await loadBaseline(schoolId, deviceSn);
  if (!baseline) baseline = await learnBaseline(schoolId, deviceSn);
  const assessment = assessBatch(baseline, batch);

  await query(
    `INSERT INTO device_clock_health
       (school_id, device_sn, local_date, confidence, status, offset_estimate_min, likely_cause, detail, batch_size, first_arrival_minute)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       confidence=VALUES(confidence), status=VALUES(status), offset_estimate_min=VALUES(offset_estimate_min),
       likely_cause=VALUES(likely_cause), detail=VALUES(detail), batch_size=VALUES(batch_size),
       first_arrival_minute=VALUES(first_arrival_minute)`,
    [schoolId, deviceSn, date, assessment.confidence, assessment.status, assessment.offsetEstimateMin,
      assessment.likelyCause, assessment.detail.slice(0, 250), batch.punchCount, batch.firstArrivalMinute],
  );

  return { ...assessment, local_date: date, batch_size: batch.punchCount };
}

/** Evaluate every device that has punches today for this school. */
export async function sweepToday(schoolId: number): Promise<Array<Assessment & { device_sn: string; local_date: string; batch_size: number }>> {
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const date = localDateStr(new Date(), off);
  const utcStart = new Date(Date.parse(`${date}T00:00:00Z`) - off * 60_000);
  const devices = (await query(
    `SELECT DISTINCT device_sn FROM attendance_raw_events
      WHERE school_id = ? AND punch_at >= ? AND device_sn IS NOT NULL`,
    [schoolId, utcStart],
  )) as Array<{ device_sn: string }>;
  const out = [];
  for (const d of devices) {
    out.push({ device_sn: d.device_sn, ...(await evaluateDeviceDay(schoolId, d.device_sn, date)) });
  }
  return out;
}

/* ── Phase 4/5: assisted correction (preview → apply → undo) ──────────── */

export interface CorrectionPreviewRow { id: number; name: string | null; before: string; after: string; }

export async function previewCorrection(
  schoolId: number, deviceSn: string, date: string, shiftMinutes: number,
): Promise<{ affected: number; sample: CorrectionPreviewRow[] }> {
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const utcStart = new Date(Date.parse(`${date}T00:00:00Z`) - off * 60_000);
  const utcEnd = new Date(utcStart.getTime() + 86_400_000);
  const rows = (await query(
    `SELECT id, display_name, punch_at FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ? AND punch_at >= ? AND punch_at < ?
      ORDER BY punch_at ASC`,
    [schoolId, deviceSn, utcStart, utcEnd],
  )) as any[];
  const fmt = (d: Date) => new Date(d.getTime() + off * 60_000).toISOString().slice(11, 16);
  return {
    affected: rows.length,
    sample: rows.slice(0, 12).map((r) => {
      const p = new Date(r.punch_at);
      return { id: Number(r.id), name: r.display_name ?? null, before: fmt(p), after: fmt(new Date(p.getTime() + shiftMinutes * 60_000)) };
    }),
  };
}

export async function applyCorrection(
  schoolId: number, deviceSn: string, date: string, shiftMinutes: number,
  userId?: number | null, source: 'assisted' | 'manual' = 'assisted',
): Promise<{ correctionId: number; affected: number; reEvaluated: number }> {
  await ensureTimeIntelligenceSchema();
  const policy = await resolveTimePolicy(schoolId);
  const off = policy.offsetMinutes;
  const utcStart = new Date(Date.parse(`${date}T00:00:00Z`) - off * 60_000);
  const utcEnd = new Date(utcStart.getTime() + 86_400_000);

  // Snapshot originals FIRST — undo depends on this.
  const rows = (await query(
    `SELECT id, person_id, role_type, punch_at FROM attendance_raw_events
      WHERE school_id = ? AND device_sn = ? AND punch_at >= ? AND punch_at < ?`,
    [schoolId, deviceSn, utcStart, utcEnd],
  )) as any[];
  if (!rows.length) return { correctionId: 0, affected: 0, reEvaluated: 0 };

  const originals = rows.map((r) => ({ id: Number(r.id), punch_at: new Date(r.punch_at).toISOString() }));
  const ins = (await query(
    `INSERT INTO attendance_time_corrections
       (school_id, device_sn, local_date, shift_minutes, affected_rows, original_times, source, applied_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [schoolId, deviceSn, date, shiftMinutes, rows.length, JSON.stringify(originals), source, userId ?? null],
  )) as unknown as { insertId: number };

  await query(
    `UPDATE attendance_raw_events
        SET punch_at = DATE_ADD(punch_at, INTERVAL ? MINUTE),
            clock_skew_seconds = ?
      WHERE school_id = ? AND device_sn = ? AND punch_at >= ? AND punch_at < ?`,
    [shiftMinutes, -shiftMinutes * 60, schoolId, deviceSn, utcStart, utcEnd],
  );

  const reEvaluated = await reevaluateAffected(schoolId, rows, shiftMinutes, off);

  await query(
    `UPDATE device_clock_health SET corrected = 1, confidence = 90, status = 'trusted',
            detail = CONCAT('Corrected ', ?, ' min by admin')
      WHERE school_id = ? AND device_sn = ? AND local_date = ?`,
    [shiftMinutes, schoolId, deviceSn, date],
  ).catch(() => {});
  // Learning: refresh the fingerprint with the corrected data.
  learnBaseline(schoolId, deviceSn).catch(() => {});

  return { correctionId: ins.insertId, affected: rows.length, reEvaluated };
}

export async function undoCorrection(schoolId: number, correctionId: number, userId?: number | null): Promise<{ restored: number }> {
  await ensureTimeIntelligenceSchema();
  const rows = (await query(
    `SELECT * FROM attendance_time_corrections WHERE id = ? AND school_id = ? AND undone_at IS NULL LIMIT 1`,
    [correctionId, schoolId],
  )) as any[];
  const c = rows[0];
  if (!c) return { restored: 0 };
  const originals: Array<{ id: number; punch_at: string }> = JSON.parse(c.original_times || '[]');
  for (const o of originals) {
    await query(`UPDATE attendance_raw_events SET punch_at = ? WHERE id = ? AND school_id = ?`,
      [new Date(o.punch_at), o.id, schoolId]);
  }
  await query(`UPDATE attendance_time_corrections SET undone_by = ?, undone_at = NOW() WHERE id = ?`, [userId ?? null, correctionId]);

  // Re-evaluate the affected person-days at BOTH the corrected and restored dates.
  const policy = await resolveTimePolicy(schoolId);
  const affected = (await query(
    `SELECT id, person_id, role_type, punch_at FROM attendance_raw_events WHERE school_id = ? AND id IN (${originals.map(() => '?').join(',')})`,
    [schoolId, ...originals.map((o) => o.id)],
  )) as any[];
  await reevaluateAffected(schoolId, affected, -Number(c.shift_minutes), policy.offsetMinutes);
  return { restored: originals.length };
}

async function reevaluateAffected(schoolId: number, rows: any[], shiftMinutes: number, off: number): Promise<number> {
  const keys = new Set<string>();
  for (const r of rows) {
    if (!r.person_id || !r.role_type) continue;
    const p = new Date(r.punch_at);
    for (const t of [p, new Date(p.getTime() + shiftMinutes * 60_000)]) {
      keys.add(`${r.person_id}|${r.role_type}|${localDateStr(t, off)}`);
    }
  }
  const { evaluateDay } = await import('@/lib/attendance/engine');
  let n = 0;
  for (const key of keys) {
    const [personId, roleType, d] = key.split('|');
    await evaluateDay(schoolId, Number(personId), roleType as any, new Date(`${d}T00:00:00`)).catch(() => {});
    n++;
  }
  return n;
}

/* ── Phase 7/8: device health overview ────────────────────────────────── */

export async function deviceHealthOverview(schoolId: number) {
  await ensureTimeIntelligenceSchema();
  const today = await sweepToday(schoolId);
  const history = (await query(
    `SELECT device_sn,
            ROUND(AVG(ABS(COALESCE(offset_estimate_min, 0)))) AS avg_drift_min,
            MAX(ABS(COALESCE(offset_estimate_min, 0))) AS max_drift_min,
            SUM(corrected) AS corrections,
            SUM(status = 'anomaly') AS anomaly_days,
            MAX(CASE WHEN status = 'trusted' THEN local_date END) AS last_accurate_day,
            COUNT(*) AS tracked_days
       FROM device_clock_health
      WHERE school_id = ? AND local_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY device_sn`,
    [schoolId],
  )) as any[];
  const baselines = (await query(
    `SELECT device_sn, median_first_minute, mad_minutes, sample_days FROM attendance_time_baselines WHERE school_id = ?`,
    [schoolId],
  )) as any[];
  const corrections = (await query(
    `SELECT c.id, c.device_sn, c.local_date, c.shift_minutes, c.affected_rows, c.source, c.applied_at, c.undone_at,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.username) AS applied_by_name
       FROM attendance_time_corrections c LEFT JOIN users u ON u.id = c.applied_by
      WHERE c.school_id = ? ORDER BY c.id DESC LIMIT 20`,
    [schoolId],
  )) as any[];
  return { today, history, baselines, corrections };
}
