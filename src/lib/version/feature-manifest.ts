/**
 * Lightweight feature flagging — "New" / "Improved" / "Updated" badges.
 * Static manifest, no DB. Each entry auto-expires after a number of
 * version bumps so badges don't linger forever. Anchor version is read
 * from package.json (the bump-version hook increments the last segment).
 */
import pkg from '../../../package.json';

export type FeatureLabel = 'New' | 'Improved' | 'Updated';

export interface FeatureFlag {
  route: string;
  label: FeatureLabel;
  version: string;           // version the change landed in, e.g. "0.0.0089"
  description: string;
  expiresAfterVersions?: number; // default 5
}

/** Newest entries first. Bump version + add an entry when shipping a feature. */
export const FEATURE_MANIFEST: FeatureFlag[] = [
  { route: '/attendance/settings', label: 'Improved', version: '0.0.0085', description: 'Device time policy (timezone, drift, opt-in auto-sync) + live popup + SMS rules', expiresAfterVersions: 8 },
  { route: '/students/enroll', label: 'Improved', version: '0.0.0089', description: 'Shows the real current term + progress (canonical resolver)', expiresAfterVersions: 8 },
  { route: '/attendance', label: 'Improved', version: '0.0.0087', description: 'Dashboard now shows real present / late / absent counts', expiresAfterVersions: 6 },
  { route: '/finance/ledger/fees', label: 'Updated', version: '0.0.0082', description: 'Fees ledger load fixed', expiresAfterVersions: 5 },
  { route: '/notifications', label: 'Improved', version: '0.0.0090', description: 'Term-aware system notifications in the bell', expiresAfterVersions: 8 },
];

/** Parse the trailing integer of a "a.b.c.dddd" / "0.0.0089" version. */
function versionOrdinal(v: string): number {
  const segs = String(v).split('.');
  const last = segs[segs.length - 1];
  const n = parseInt(last, 10);
  return Number.isFinite(n) ? n : 0;
}

const CURRENT_ORDINAL = versionOrdinal(pkg.version || '0.0.0000');

export function isFlagActive(flag: FeatureFlag, currentOrdinal = CURRENT_ORDINAL): boolean {
  const landed = versionOrdinal(flag.version);
  const ttl = flag.expiresAfterVersions ?? 5;
  return currentOrdinal <= landed + ttl;
}

/** All non-expired flags. */
export function activeFeatureFlags(): FeatureFlag[] {
  return FEATURE_MANIFEST.filter((f) => isFlagActive(f));
}

/** Map of route → active flag, for quick sidebar/header lookup. */
export function activeFeatureFlagByRoute(): Record<string, FeatureFlag> {
  const out: Record<string, FeatureFlag> = {};
  for (const f of activeFeatureFlags()) if (!out[f.route]) out[f.route] = f;
  return out;
}
