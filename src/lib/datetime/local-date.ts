/**
 * Timezone-safe YYYY-MM-DD helpers.
 *
 * The footgun this replaces: `new Date(...).toISOString().slice(0, 10)`.
 * `toISOString()` renders in UTC, so for any timezone EAST of UTC (EAT is
 * +03:00) it rolls a *local* day back by one — turning "today" into yesterday.
 * Two safe primitives, one for each side of the wire:
 */

/** EAT (Africa/Kampala) — the DRAIS default school timezone. */
export const DEFAULT_OFFSET_MINUTES = 180;

/**
 * Format a Date as YYYY-MM-DD from its LOCAL calendar components — never via
 * UTC. Use on the CLIENT, where the browser clock is the operator's local
 * (on-site) time, so the local components ARE the school-local date.
 */
export function toLocalDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * School-local "today" (YYYY-MM-DD) for a tz offset in minutes (default EAT).
 * Use on the SERVER, where the process clock is UTC: shift the instant by the
 * offset first, THEN read the (now-local) date. Passing the school's resolved
 * offset makes it correct for any timezone; the default matches DEFAULT_CONFIG.
 */
export function schoolLocalToday(offsetMinutes: number = DEFAULT_OFFSET_MINUTES, now: Date = new Date()): string {
  return new Date(now.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}
