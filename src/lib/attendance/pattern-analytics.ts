/**
 * Attendance Pattern Analytics (Phase 6 of the Intelligence Program).
 *
 * Turns the engine's daily verdicts into behavioural intelligence: is
 * attendance trending down? Was today a mass-absence day? Which classes /
 * departments are drifting? Every finding is deterministic and explainable —
 * simple statistics over the school's own recent history, no ML.
 *
 * The detectors are PURE and unit-tested (no DB, no clock); loaders feed them
 * `attendance_records` rollups. Nothing is written.
 */

export interface DayPoint { date: string; present: number; late: number; absent: number; total: number; }

export type AlertLevel = 'info' | 'watch' | 'alert';
export interface PatternAlert {
  key: string; level: AlertLevel; title: string; detail: string; recommendation: string | null;
}

/* ── stats ────────────────────────────────────────────────────────────── */
export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const stddev = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
};
const rate = (d: DayPoint, k: 'present' | 'late' | 'absent') => (d.total > 0 ? d[k] / d.total : 0);
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Direction of a series via first-half vs second-half mean (robust to noise). */
export function trend(values: number[]): { direction: 'improving' | 'declining' | 'stable'; deltaPct: number } {
  if (values.length < 4) return { direction: 'stable', deltaPct: 0 };
  const half = Math.floor(values.length / 2);
  const older = mean(values.slice(0, half));
  const recent = mean(values.slice(half));
  const delta = recent - older;
  const deltaPct = older > 0 ? Math.round((delta / older) * 100) : 0;
  if (Math.abs(deltaPct) < 5) return { direction: 'stable', deltaPct };
  return { direction: delta > 0 ? 'improving' : 'declining', deltaPct };
}

/* ── detectors (PURE) ─────────────────────────────────────────────────── */

/** Whole-school attendance pattern alerts from a day series (oldest→newest). */
export function analyzeSeries(days: DayPoint[]): PatternAlert[] {
  const alerts: PatternAlert[] = [];
  if (days.length < 4) return alerts;

  const presentRates = days.map(d => rate(d, 'present'));
  const lateRates = days.map(d => rate(d, 'late'));
  const absentRates = days.map(d => rate(d, 'absent'));
  const today = days[days.length - 1];
  const priorAbsent = absentRates.slice(0, -1);
  const priorLate = lateRates.slice(0, -1);

  // 1 · Attendance decline (present rate trending down)
  const t = trend(presentRates);
  if (t.direction === 'declining' && t.deltaPct <= -8) {
    alerts.push({
      key: 'attendance_decline', level: t.deltaPct <= -15 ? 'alert' : 'watch',
      title: 'Attendance is declining',
      detail: `Present rate fell ${Math.abs(t.deltaPct)}% over the window (now ${pct(rate(today, 'present'))}).`,
      recommendation: 'Review recent absentees and follow up with guardians before it entrenches.',
    });
  }

  // 2 · Mass absence today (absent rate far above the recent norm)
  const absMean = mean(priorAbsent), absSd = stddev(priorAbsent);
  const todayAbsent = rate(today, 'absent');
  if (priorAbsent.length >= 3 && todayAbsent > absMean + Math.max(0.1, 2 * absSd) && todayAbsent >= 0.25) {
    alerts.push({
      key: 'mass_absence', level: 'alert',
      title: 'Unusual mass absence today',
      detail: `${pct(todayAbsent)} absent vs a usual ${pct(absMean)} — ${today.absent} of ${today.total}.`,
      recommendation: 'Check for a local event, weather, transport or a data/device gap before treating it as real.',
    });
  }

  // 3 · Lateness spike (late rate well above norm)
  const lateMean = mean(priorLate), lateSd = stddev(priorLate);
  const todayLate = rate(today, 'late');
  if (priorLate.length >= 3 && todayLate > lateMean + Math.max(0.08, 2 * lateSd) && todayLate >= 0.2) {
    alerts.push({
      key: 'lateness_spike', level: 'watch',
      title: 'Lateness spike today',
      detail: `${pct(todayLate)} arrived late vs a usual ${pct(lateMean)}.`,
      recommendation: 'If unexpected, verify the device clock (Time Health) before assuming a real behaviour change.',
    });
  }

  // 4 · Chronic lateness (late rate persistently high, trending up)
  const lt = trend(lateRates);
  if (lt.direction === 'improving' /* i.e. lateness rising */ && lt.deltaPct >= 20 && mean(lateRates) >= 0.15) {
    alerts.push({
      key: 'chronic_lateness', level: 'watch',
      title: 'Lateness is creeping up',
      detail: `Late rate rose ${lt.deltaPct}% over the window (avg ${pct(mean(lateRates))}).`,
      recommendation: 'Consider whether arrival windows still match reality, or address repeat late-comers.',
    });
  }

  return alerts;
}

/** Per-group (class/department) drift vs the school. Groups whose present rate
 *  is materially below the school average are flagged. */
export interface GroupStat { name: string; present: number; late: number; absent: number; total: number; }
export function analyzeGroups(groups: GroupStat[], label: 'class' | 'department'): PatternAlert[] {
  const usable = groups.filter(g => g.total >= 5);
  if (usable.length < 2) return [];
  const rates = usable.map(g => g.present / g.total);
  const schoolMean = mean(rates);
  const out: PatternAlert[] = [];
  for (const g of usable) {
    const r = g.present / g.total;
    if (r < schoolMean - 0.15 && r < 0.8) {
      out.push({
        key: `group_${label}_${g.name}`, level: r < schoolMean - 0.25 ? 'alert' : 'watch',
        title: `${g.name}: attendance below the school`,
        detail: `${pct(r)} present vs school ${pct(schoolMean)} (${g.present}/${g.total}).`,
        recommendation: `Look into ${label === 'class' ? 'this class' : 'this department'} specifically — a localised cause is likely.`,
      });
    }
  }
  return out.sort((a, b) => (a.level === 'alert' ? -1 : 1) - (b.level === 'alert' ? -1 : 1)).slice(0, 8);
}
