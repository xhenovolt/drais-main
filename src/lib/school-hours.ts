/**
 * School working/study hours — DB reader + resolver.
 *
 * The shape stored in `school_hours` (see migrations/school_hours.sql)
 * is a per-day table with a fallback default row. This module hides
 * that layout behind a single resolution function:
 *
 *     resolveSchoolHours(schoolId, audience, dateOrDayIndex)
 *         → { startTime, endTime, lateAfterMinutes, isClosed } | null
 *
 * Resolution order:
 *   1. Active row matching (school_id, audience, day_of_week=<day>).
 *   2. Active row matching (school_id, audience, day_of_week=NULL).
 *   3. null — caller treats as "no schedule configured".
 *
 * Caching: 60-second in-memory cache keyed on (school, audience, day).
 * The mutation API (PUT /api/admin/school-hours) calls
 * invalidateSchoolHoursCache(schoolId) after every write.
 *
 * NEVER throws. A failed query returns null and the caller falls back
 * to schedule-less behaviour (matches pre-migration semantics).
 */

import { query } from '@/lib/db';

export type SchoolHoursAudience = 'student' | 'staff';

export interface SchoolHours {
  audience:            SchoolHoursAudience;
  /** 0-6, or null for the default row. */
  dayOfWeek:           number | null;
  /** "HH:MM" (24h). */
  startTime:           string;
  endTime:             string;
  /** null = strict (any minute after startTime is late). */
  lateAfterMinutes:    number | null;
  isClosed:            boolean;
}

interface CacheEntry {
  expires: number;
  value:   SchoolHours | null;
}

const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheKey(schoolId: number, audience: SchoolHoursAudience, dayIndex: number): string {
  return `${schoolId}::${audience}::${dayIndex}`;
}

/**
 * Resolve the effective hours for a school + audience on a given date
 * (or raw 0-6 day index). Returns null when no row applies — caller
 * treats that as "no schedule configured" and falls back to legacy
 * behaviour (no late computation, no closure).
 */
export async function resolveSchoolHours(
  schoolId: number,
  audience: SchoolHoursAudience,
  date: Date | number | string,
): Promise<SchoolHours | null> {
  const dayIndex = toDayIndex(date);
  if (dayIndex === null) return null;

  const key = cacheKey(schoolId, audience, dayIndex);
  const cached = CACHE.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    // ONE query — fetch the specific-day row AND the default row; we
    // pick the more specific one. Cheaper than two round trips.
    const rows = (await query(
      `SELECT day_of_week,
              TIME_FORMAT(start_time, '%H:%i') AS start_time,
              TIME_FORMAT(end_time,   '%H:%i') AS end_time,
              late_after_minutes,
              is_closed
         FROM school_hours
        WHERE school_id = ?
          AND audience  = ?
          AND is_active = 1
          AND (day_of_week = ? OR day_of_week IS NULL)`,
      [schoolId, audience, dayIndex],
    )) as Array<{
      day_of_week: number | null;
      start_time:  string;
      end_time:    string;
      late_after_minutes: number | null;
      is_closed:   number;
    }>;

    // Prefer the row whose day_of_week matches exactly.
    const specific = rows.find(r => r.day_of_week === dayIndex);
    const def      = rows.find(r => r.day_of_week === null);
    const winner   = specific ?? def ?? null;

    const result: SchoolHours | null = winner == null ? null : {
      audience,
      dayOfWeek:        winner.day_of_week,
      startTime:        winner.start_time,
      endTime:          winner.end_time,
      lateAfterMinutes: winner.late_after_minutes,
      isClosed:         Boolean(winner.is_closed),
    };

    CACHE.set(key, { expires: Date.now() + CACHE_TTL_MS, value: result });
    return result;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[school-hours] resolve failed:', err);
    return null;
  }
}

/**
 * Convenience — produces the "HH:MM" cutoff after which a scan counts as
 * late, OR null when there's no schedule / no grace.
 *
 * NULL means: don't flag this scan as late regardless of time. That's
 * the safe default for schools that haven't configured hours yet.
 */
export async function resolveLateAfterHHMM(
  schoolId: number,
  audience: SchoolHoursAudience,
  date: Date | number | string,
): Promise<string | null> {
  const hours = await resolveSchoolHours(schoolId, audience, date);
  if (!hours || hours.isClosed) return null;
  if (hours.lateAfterMinutes == null) {
    // Strict — late starts AT start_time.
    return hours.startTime;
  }
  return addMinutes(hours.startTime, hours.lateAfterMinutes);
}

/**
 * Fetch every row for a school — used by the settings UI to render the
 * editor grid. Returns rows sorted: default (null) first, then 0-6.
 */
export async function loadAllSchoolHours(schoolId: number): Promise<SchoolHours[]> {
  try {
    const rows = (await query(
      `SELECT audience,
              day_of_week,
              TIME_FORMAT(start_time, '%H:%i') AS start_time,
              TIME_FORMAT(end_time,   '%H:%i') AS end_time,
              late_after_minutes,
              is_closed
         FROM school_hours
        WHERE school_id = ? AND is_active = 1
        ORDER BY audience, (day_of_week IS NOT NULL), day_of_week`,
      [schoolId],
    )) as Array<{
      audience:    SchoolHoursAudience;
      day_of_week: number | null;
      start_time:  string;
      end_time:    string;
      late_after_minutes: number | null;
      is_closed:   number;
    }>;
    return rows.map(r => ({
      audience: r.audience,
      dayOfWeek: r.day_of_week,
      startTime: r.start_time,
      endTime:   r.end_time,
      lateAfterMinutes: r.late_after_minutes,
      isClosed: Boolean(r.is_closed),
    }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[school-hours] loadAll failed:', err);
    return [];
  }
}

export interface UpsertSchoolHoursInput {
  audience:          SchoolHoursAudience;
  dayOfWeek:         number | null;
  startTime:         string;     // HH:MM
  endTime:           string;     // HH:MM
  lateAfterMinutes?: number | null;
  isClosed?:         boolean;
  notes?:            string | null;
}

/**
 * Upsert one row. The UNIQUE (school_id, audience, day_of_week) handles
 * the "create or replace" semantic.
 */
export async function upsertSchoolHours(args: {
  schoolId: number;
  createdBy?: number | null;
  rows: UpsertSchoolHoursInput[];
}): Promise<{ written: number; errors: string[] }> {
  let written = 0;
  const errors: string[] = [];
  for (const r of args.rows) {
    if (!isHHMM(r.startTime) || !isHHMM(r.endTime)) {
      errors.push(`bad time: ${r.audience} day=${r.dayOfWeek}`);
      continue;
    }
    try {
      await query(
        `INSERT INTO school_hours
           (school_id, audience, day_of_week, start_time, end_time,
            late_after_minutes, is_closed, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           start_time         = VALUES(start_time),
           end_time           = VALUES(end_time),
           late_after_minutes = VALUES(late_after_minutes),
           is_closed          = VALUES(is_closed),
           notes              = VALUES(notes),
           is_active          = 1`,
        [
          args.schoolId,
          r.audience,
          r.dayOfWeek,
          r.startTime,
          r.endTime,
          r.lateAfterMinutes ?? null,
          r.isClosed ? 1 : 0,
          r.notes ?? null,
          args.createdBy ?? null,
        ],
      );
      written++;
    } catch (err) {
      errors.push(`${r.audience} day=${r.dayOfWeek}: ${String(err)}`);
    }
  }
  invalidateSchoolHoursCache(args.schoolId);
  return { written, errors };
}

export async function deleteSchoolHoursRow(args: {
  schoolId: number;
  audience: SchoolHoursAudience;
  dayOfWeek: number | null;
}): Promise<void> {
  await query(
    `UPDATE school_hours
        SET is_active = 0
      WHERE school_id = ?
        AND audience  = ?
        AND ((day_of_week IS NULL AND ? IS NULL) OR day_of_week = ?)`,
    [args.schoolId, args.audience, args.dayOfWeek, args.dayOfWeek],
  );
  invalidateSchoolHoursCache(args.schoolId);
}

export function invalidateSchoolHoursCache(schoolId: number): void {
  for (const key of Array.from(CACHE.keys())) {
    if (key.startsWith(`${schoolId}::`)) CACHE.delete(key);
  }
}

// ─── primitives ──────────────────────────────────────────────────────────────

/** Convert Date | unix-ms | ISO string into a 0-6 day index (Sun-Sat). */
function toDayIndex(date: Date | number | string): number | null {
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) return null;
    return date.getDay();
  }
  if (typeof date === 'number') {
    if (date >= 0 && date <= 6 && Number.isInteger(date)) return date;
    const d = new Date(date);
    return Number.isNaN(d.getTime()) ? null : d.getDay();
  }
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.getDay();
}

function isHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(s);
}

function addMinutes(hhmm: string, mins: number): string {
  const [hh, mm] = hhmm.split(':').map(n => Number.parseInt(n, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return hhmm;
  const total = (hh * 60 + mm + mins) % (24 * 60);
  const outH = Math.floor(total / 60);
  const outM = total % 60;
  return `${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}`;
}
