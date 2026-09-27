/**
 * Fingers and fingerprint "levels" — pure, shared by the API, the lists and the enrolment picker.
 *
 * ZKTeco devices number fingers 0-9 (a "slot"). The hand/finger names below follow the usual ZKTeco
 * numbering (left hand 0-4 little→thumb, right hand 5-9 thumb→little) and are guidance for the person
 * being enrolled; what the device actually stores is the slot number, so two different slots are always
 * two different fingers.
 */

export interface FingerInfo { index: number; hand: 'Left' | 'Right'; name: string; label: string }

const NAMES = ['little finger', 'ring finger', 'middle finger', 'index finger', 'thumb'];

export const FINGERS: FingerInfo[] = Array.from({ length: 10 }, (_, i) => {
  const hand = i < 5 ? 'Left' : 'Right';
  const name = i < 5 ? NAMES[i] : NAMES[4 - (i - 5)];
  return { index: i, hand, name, label: `${hand} ${name}` } as FingerInfo;
});

export const fingerLabel = (index: number): string => FINGERS[index]?.label ?? `Finger ${index}`;

/** Best fingers first: index fingers and thumbs read most reliably, little fingers least. */
const PREFERRED_ORDER = [6, 3, 5, 4, 7, 2, 8, 1, 9, 0];

/** The finger to suggest next: the most reliable one not enrolled yet (null when all ten are done). */
export function suggestNextFinger(enrolled: number[]): number | null {
  const have = new Set(enrolled);
  const next = PREFERRED_ORDER.find((f) => !have.has(f));
  return next === undefined ? null : next;
}

export function describeFingers(indices: number[]): string {
  const sorted = [...new Set(indices)].filter((i) => i >= 0 && i <= 9).sort((a, b) => a - b);
  return sorted.length ? sorted.map(fingerLabel).join(', ') : 'none';
}

export type FingerprintLevel =
  | 'none' | 'pending' | 'problem' | 'unknown' | 'one' | 'two' | 'many';

export interface LevelStyle { level: FingerprintLevel; color: string; short: string; text: string }

const STYLES: Record<FingerprintLevel, Omit<LevelStyle, 'level'>> = {
  none:    { color: '#9ca3af', short: 'None',    text: 'No fingerprint enrolled' },
  pending: { color: '#f59e0b', short: 'Waiting', text: 'Waiting for the finger to be scanned' },
  problem: { color: '#ef4444', short: 'Problem', text: 'Enrolment failed, expired or was revoked' },
  unknown: { color: '#3b82f6', short: 'Unknown', text: 'Enrolled on the device — number of fingers not known to DRAIS' },
  one:     { color: '#ea580c', short: '1 finger', text: 'Only 1 finger enrolled — add another' },
  two:     { color: '#22c55e', short: '2 fingers', text: '2 fingers enrolled' },
  many:    { color: '#15803d', short: '3+ fingers', text: '3 or more fingers enrolled' },
};

/**
 * One level per person, from the canonical status label and how many fingers DRAIS holds.
 * `fingerCount` is what DRAIS can PROVE (templates it received); a person the device knows but whose
 * templates never reached DRAIS is 'unknown' — never guessed as 1.
 */
export function fingerprintLevel(input: { label: string | null | undefined; fingerCount: number; hasFace?: boolean }): LevelStyle {
  const { label, fingerCount, hasFace } = input;
  let level: FingerprintLevel;
  if (!label || label === 'Not enrolled') level = fingerCount > 0 ? levelForCount(fingerCount) : 'none';
  else if (['Failed', 'Expired', 'Revoked', 'Suspended'].includes(label)) level = 'problem';
  else if (fingerCount > 0) level = levelForCount(fingerCount);
  else if (hasFace && label === 'Active') level = 'none';      // enrolled by face only: no fingerprint, and not "unknown"
  else if (label === 'Active' || label.startsWith('Captured on device')) level = 'unknown';
  else level = 'pending';
  return { level, ...STYLES[level] };
}

function levelForCount(n: number): FingerprintLevel {
  return n >= 3 ? 'many' : n === 2 ? 'two' : 'one';
}

export const LEVEL_ORDER: FingerprintLevel[] = ['none', 'pending', 'problem', 'unknown', 'one', 'two', 'many'];
export const levelStyle = (level: FingerprintLevel): LevelStyle => ({ level, ...STYLES[level] });
