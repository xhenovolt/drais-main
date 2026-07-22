/**
 * Per-weekday arrival-rule overrides.
 *
 * A single attendance rule cannot express "Saturday arrival ends at
 * 10:00 while Mon–Fri ends at 08:30". This module adds a thin override
 * layer keyed by (rule_id, weekday): any non-null override field
 * replaces the base rule's value for dates falling on that weekday.
 * No override rows ⇒ behaviour identical to before.
 *
 * Weekday convention: JavaScript Date#getDay() — 0=Sunday … 6=Saturday.
 *
 * Consumers (all resolve the SAME way so verdicts, dashboards and the
 * allowance report can never disagree):
 *   - engine.evaluateDay        → applyWeekdayOverride(rule, date)
 *   - dashboard-counts cutoff   → applyWeekdayOverride
 *   - allowance report          → loadOverridesForRules + mergeOverride
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;
export function ensureDayOverrideSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS attendance_rule_day_overrides (
         id                     BIGINT PRIMARY KEY AUTO_INCREMENT,
         rule_id                BIGINT NOT NULL,
         weekday                TINYINT NOT NULL, -- 0=Sunday … 6=Saturday
         arrival_start_time     TIME DEFAULT NULL,
         arrival_end_time       TIME DEFAULT NULL,
         late_threshold_minutes INT DEFAULT NULL,
         closing_time           TIME DEFAULT NULL,
         created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         UNIQUE KEY uk_rule_day (rule_id, weekday)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      [],
    );
  })();
  return ensured;
}

export interface DayOverride {
  rule_id: number;
  weekday: number;
  arrival_start_time: string | null;
  arrival_end_time: string | null;
  late_threshold_minutes: number | null;
  closing_time: string | null;
}

export interface OverridableRuleFields {
  id?: number | null;
  arrival_start_time?: string | null;
  arrival_end_time?: string | null;
  late_threshold_minutes?: number;
  closing_time?: string | null;
}

/** Pure merge — exported for tests. Non-null override fields win. */
export function mergeOverride<T extends OverridableRuleFields>(rule: T, ov: DayOverride | null | undefined): T {
  if (!ov) return rule;
  return {
    ...rule,
    arrival_start_time: ov.arrival_start_time ?? rule.arrival_start_time,
    arrival_end_time: ov.arrival_end_time ?? rule.arrival_end_time,
    late_threshold_minutes: ov.late_threshold_minutes ?? rule.late_threshold_minutes,
    closing_time: ov.closing_time ?? rule.closing_time,
  };
}

export function weekdayOf(date: Date | string): number {
  const d = date instanceof Date ? date : new Date(`${String(date).slice(0, 10)}T00:00:00`);
  return d.getDay();
}

/** Load + merge the override for one rule on one date (no-op without rows). */
export async function applyWeekdayOverride<T extends OverridableRuleFields>(rule: T, date: Date | string): Promise<T> {
  // Shift-derived rules (synthetic negative ids) carry their own schedule.
  if (rule?.id == null || Number(rule.id) < 0) return rule;
  try {
    await ensureDayOverrideSchema();
    const rows = (await query(
      `SELECT rule_id, weekday, arrival_start_time, arrival_end_time,
              late_threshold_minutes, closing_time
         FROM attendance_rule_day_overrides
        WHERE rule_id = ? AND weekday = ? LIMIT 1`,
      [rule.id, weekdayOf(date)],
    )) as DayOverride[];
    return mergeOverride(rule, rows[0]);
  } catch {
    return rule; // overrides are an enhancement — never break evaluation
  }
}

/** Bulk-load overrides for many rules on one weekday (allowance report). */
export async function loadOverridesForRules(ruleIds: number[], date: Date | string): Promise<Map<number, DayOverride>> {
  const map = new Map<number, DayOverride>();
  const ids = [...new Set(ruleIds.filter(n => Number.isFinite(n)))];
  if (!ids.length) return map;
  try {
    await ensureDayOverrideSchema();
    const rows = (await query(
      `SELECT rule_id, weekday, arrival_start_time, arrival_end_time,
              late_threshold_minutes, closing_time
         FROM attendance_rule_day_overrides
        WHERE rule_id IN (${ids.map(() => '?').join(',')}) AND weekday = ?`,
      [...ids, weekdayOf(date)],
    )) as DayOverride[];
    for (const r of rows) map.set(Number(r.rule_id), r);
  } catch { /* enhancement only */ }
  return map;
}

/** Replace all overrides for a rule (settings save). */
export async function saveRuleDayOverrides(
  ruleId: number,
  overrides: Array<Partial<DayOverride> & { weekday: number }>,
): Promise<void> {
  await ensureDayOverrideSchema();
  await query(`DELETE FROM attendance_rule_day_overrides WHERE rule_id = ?`, [ruleId]);
  for (const ov of overrides) {
    if (ov.weekday == null || ov.weekday < 0 || ov.weekday > 6) continue;
    const hasAny = ov.arrival_start_time || ov.arrival_end_time || ov.late_threshold_minutes != null || ov.closing_time;
    if (!hasAny) continue;
    await query(
      `INSERT INTO attendance_rule_day_overrides
         (rule_id, weekday, arrival_start_time, arrival_end_time, late_threshold_minutes, closing_time)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ruleId, ov.weekday, ov.arrival_start_time ?? null, ov.arrival_end_time ?? null,
        ov.late_threshold_minutes ?? null, ov.closing_time ?? null],
    );
  }
}
