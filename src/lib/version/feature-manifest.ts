/**
 * Lightweight feature flagging — "New" / "Improved" / "Fixed" badges shown
 * in the navbar "What's new" menu (and optionally on routes). Static
 * manifest, no DB. Each entry auto-expires a number of days after it
 * shipped, so badges don't linger forever.
 *
 * To flag a change: add an entry with today's date. That's it.
 */
import pkg from '../../../package.json';

export type FeatureLabel = 'New' | 'Improved' | 'Fixed';

export interface FeatureFlag {
  route: string;             // where the change lives (clickable)
  title: string;             // human label, e.g. "Attendance settings"
  label: FeatureLabel;
  since: string;             // ISO date it shipped, e.g. "2026-06-21"
  description: string;
  expiresAfterDays?: number; // default 21
}

/** Newest first. Add an entry (with today's date) whenever you ship. */
export const FEATURE_MANIFEST: FeatureFlag[] = [
  { route: '/attendance', title: 'Attendance SMS to guardians', label: 'Fixed', since: '2026-06-21', description: 'Automatic parent SMS now sends on a scan; status shows live in the navbar.' },
  { route: '/attendance/settings', title: 'School days (weekend teaching)', label: 'New', since: '2026-06-20', description: 'Choose which days are school days so Sat/Sun count and notify.' },
  { route: '/attendance/settings', title: 'Device time policy', label: 'New', since: '2026-06-19', description: 'Per-school timezone, drift handling, and opt-in device-clock correction.' },
  { route: '/notifications', title: 'Notifications', label: 'Fixed', since: '2026-06-20', description: 'Bell + list fixed (LIMIT query error) and term-aware alerts added.' },
  { route: '/finance/ledger/fees', title: 'Fees ledger', label: 'Fixed', since: '2026-06-18', description: '"Failed to load fees" resolved (query + schema fixes).' },
  { route: '/attendance', title: 'Attendance dashboard counts', label: 'Fixed', since: '2026-06-19', description: 'Present / late / absent now show real numbers from punches.' },
  { route: '/students/enroll', title: 'Enrollment term', label: 'Improved', since: '2026-06-19', description: 'Shows the real current term + progress via the canonical resolver.' },
  { route: '/students/list', title: 'Students list', label: 'Improved', since: '2026-06-15', description: 'Balance column + instant scan popup with class/photo/fees.' },
];

const DAY = 86_400_000;

export function isFlagActive(flag: FeatureFlag, now: number = Date.now()): boolean {
  const since = Date.parse(`${flag.since}T00:00:00Z`);
  if (!Number.isFinite(since)) return false;
  const ttl = (flag.expiresAfterDays ?? 21) * DAY;
  return now - since <= ttl;
}

/** All non-expired flags, newest first. */
export function activeFeatureFlags(now: number = Date.now()): FeatureFlag[] {
  return FEATURE_MANIFEST
    .filter((f) => isFlagActive(f, now))
    .sort((a, b) => Date.parse(b.since) - Date.parse(a.since));
}

/** Map of route → newest active flag, for quick sidebar/header lookup. */
export function activeFeatureFlagByRoute(): Record<string, FeatureFlag> {
  const out: Record<string, FeatureFlag> = {};
  for (const f of activeFeatureFlags()) if (!out[f.route]) out[f.route] = f;
  return out;
}

export const APP_VERSION = pkg.version;
