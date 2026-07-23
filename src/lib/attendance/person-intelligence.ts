/**
 * Person Attendance Intelligence (v1.91).
 *
 * DRAIS's understanding of an INDIVIDUAL's attendance character — not a raw
 * leaderboard, but a behavioural profile: how reliable is this person, is
 * their recent behaviour unusual FOR THEM, and how should an administrator
 * read it. Depends on materialised absent rows (see finalize-day.ts) to be
 * accurate.
 *
 * profilePerson() is PURE and unit-tested. It takes a person's daily verdict
 * series (oldest→newest) and returns rates, streaks, a first-half-vs-second
 * self-comparison, and a behavioural classification with an admin-facing note.
 */

export interface PersonDay { date: string; status: 'present' | 'late' | 'absent' | 'half_day' | string; }

export type Behaviour =
  | 'reliable' | 'occasionally_late' | 'chronically_late'
  | 'frequently_absent' | 'declining' | 'improving' | 'insufficient_data';

export interface PersonProfile {
  trackedDays: number;
  presentRate: number;   // 0..1 (present or late = showed up)
  lateRate: number;      // 0..1 of tracked days
  absentRate: number;    // 0..1 of tracked days
  currentAbsentStreak: number;
  longestAbsentStreak: number;
  recentAbsentRate: number;   // second half of the window
  priorAbsentRate: number;    // first half
  behaviour: Behaviour;
  label: string;              // human label
  note: string;               // admin-facing sentence
  watch: boolean;             // should this person be on the admin's watch-list?
}

const rate = (n: number, d: number) => (d > 0 ? n / d : 0);
const pct = (r: number) => `${Math.round(r * 100)}%`;

function streaks(days: PersonDay[]): { current: number; longest: number } {
  let longest = 0, run = 0, current = 0;
  for (const d of days) {
    if (d.status === 'absent') { run++; longest = Math.max(longest, run); }
    else run = 0;
  }
  // current = trailing run of absents
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].status === 'absent') current++; else break;
  }
  return { current, longest };
}

export function profilePerson(days: PersonDay[]): PersonProfile {
  const graded = days.filter(d => ['present', 'late', 'absent', 'half_day'].includes(d.status));
  const n = graded.length;
  if (n < 4) {
    return {
      trackedDays: n, presentRate: 0, lateRate: 0, absentRate: 0,
      currentAbsentStreak: 0, longestAbsentStreak: 0, recentAbsentRate: 0, priorAbsentRate: 0,
      behaviour: 'insufficient_data', label: 'Not enough data',
      note: `Only ${n} tracked day(s) — need more history to profile.`, watch: false,
    };
  }

  const absent = graded.filter(d => d.status === 'absent').length;
  const late = graded.filter(d => d.status === 'late').length;
  const showed = graded.filter(d => d.status === 'present' || d.status === 'late' || d.status === 'half_day').length;
  const absentRate = rate(absent, n), lateRate = rate(late, n), presentRate = rate(showed, n);

  const half = Math.floor(n / 2);
  const priorAbsentRate = rate(graded.slice(0, half).filter(d => d.status === 'absent').length, half);
  const recentAbsentRate = rate(graded.slice(half).filter(d => d.status === 'absent').length, n - half);
  const { current, longest } = streaks(graded);

  // Classification — order matters (most serious first).
  let behaviour: Behaviour, label: string, note: string, watch = false;
  const worsening = recentAbsentRate > priorAbsentRate + 0.12 && recentAbsentRate >= 0.15;
  const improving = priorAbsentRate > recentAbsentRate + 0.12 && priorAbsentRate >= 0.15;

  if (absentRate >= 0.2) {
    behaviour = 'frequently_absent'; label = 'Frequently absent'; watch = true;
    note = `Absent ${pct(absentRate)} of tracked days (${absent}/${n})${current >= 2 ? `, currently on a ${current}-day absence streak` : ''} — well above normal.`;
  } else if (worsening) {
    behaviour = 'declining'; label = 'Declining — unusual for them'; watch = true;
    note = `Absence rose from ${pct(priorAbsentRate)} to ${pct(recentAbsentRate)} recently — a change from their own pattern. Worth a conversation.`;
  } else if (lateRate >= 0.35) {
    behaviour = 'chronically_late'; label = 'Chronically late'; watch = true;
    note = `Late ${pct(lateRate)} of tracked days (${late}/${n}) — a persistent pattern.`;
  } else if (improving) {
    behaviour = 'improving'; label = 'Improving';
    note = `Absence fell from ${pct(priorAbsentRate)} to ${pct(recentAbsentRate)} — trending the right way.`;
  } else if (lateRate >= 0.15) {
    behaviour = 'occasionally_late'; label = 'Occasionally late';
    note = `Late ${pct(lateRate)} of days; otherwise reliable.`;
  } else {
    behaviour = 'reliable'; label = 'Reliable';
    note = `Present ${pct(presentRate)} of tracked days with little lateness.`;
  }

  return {
    trackedDays: n, presentRate, lateRate, absentRate,
    currentAbsentStreak: current, longestAbsentStreak: longest,
    recentAbsentRate, priorAbsentRate, behaviour, label, note, watch,
  };
}
