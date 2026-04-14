// ─────────────────────────────────────────────────────────────────────────────
// DRAIS Narrative Engine
// Converts raw metrics into human-readable interpretations.
// Every function ALWAYS returns a non-empty result.
// ─────────────────────────────────────────────────────────────────────────────

export interface AttendanceNarrative {
  headline: string;
  body: string;
  tone: 'positive' | 'neutral' | 'warning' | 'critical' | 'empty';
  bullets: string[];
  action: string | null;
}

export interface TrendNarrative {
  direction: 'up' | 'down' | 'flat' | 'unknown';
  sentence: string;
}

export interface SchoolHealthScore {
  score: number;           // 0–100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  label: string;
  breakdown: { label: string; score: number; weight: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE NARRATIVE
// ─────────────────────────────────────────────────────────────────────────────
export function generateAttendanceNarrative(params: {
  totalStudents: number;
  present: number;
  absent: number;
  late: number;
  rate: number;       // 0-100
  yesterdayPresent: number;
  changePct: number;  // positive = up, negative = down
  hasRecords: boolean;
}): AttendanceNarrative {
  const { totalStudents, present, absent, late, rate, yesterdayPresent, changePct, hasRecords } = params;

  // Case 0: No learners in system
  if (totalStudents === 0) {
    return {
      headline: 'No learners registered',
      body: 'There are no active learners registered in this school. The dashboard will populate once students are enrolled.',
      tone: 'empty',
      bullets: [],
      action: 'Go to Students → Add learners to the system',
    };
  }

  // Case 1: No attendance recorded today
  if (!hasRecords || (present === 0 && absent === 0)) {
    return {
      headline: 'No attendance recorded today',
      body: 'Attendance has not been marked yet for today. This may indicate:',
      tone: 'empty',
      bullets: [
        'Biometric devices are offline or not syncing',
        'The school day has not yet started',
        'Attendance marking is pending',
      ],
      action: 'Check device connectivity or mark attendance manually',
    };
  }

  // Case 2: Critical attendance (< 60%)
  if (rate < 60) {
    const bullets: string[] = ['Unusually high absenteeism for a school day'];
    if (absent > totalStudents * 0.3) bullets.push(`${absent} learners unaccounted for — this is abnormal`);
    bullets.push('Possible causes: transport disruptions, illness outbreak, or institutional issue');
    return {
      headline: `Attendance critically low — ${rate}% present`,
      body: `Only ${present} of ${totalStudents} students are present today. This is far below expected levels and requires immediate investigation.`,
      tone: 'critical',
      bullets,
      action: `Contact class teachers and investigate absences — especially the ${Math.min(absent, 10)} most impacted classes`,
    };
  }

  // Case 3: Below normal (60–74%)
  if (rate < 75) {
    return {
      headline: `Attendance below normal — ${rate}% present`,
      body: `${present} students are present today out of ${totalStudents}. This is lower than the acceptable range (≥75%).`,
      tone: 'warning',
      bullets: [
        `${absent} students absent — follow up with class teachers`,
        late > 0 ? `${late} students arrived late` : 'No late arrivals recorded',
        changePct < -10 ? `Attendance has dropped ${Math.abs(changePct)}% since yesterday` : 'Attendance is slightly below yesterday',
      ].filter(Boolean) as string[],
      action: 'Review class-level breakdown and identify patterns',
    };
  }

  // Case 4: Good attendance (75–89%)
  if (rate < 90) {
    const trend = changePct > 0
      ? `up ${changePct}% from yesterday`
      : changePct < 0
        ? `down ${Math.abs(changePct)}% from yesterday`
        : 'unchanged from yesterday';
    return {
      headline: `Attendance is stable — ${rate}% present`,
      body: `${present} out of ${totalStudents} students attended today. Attendance is within normal range${yesterdayPresent > 0 ? `, ${trend}` : ''}.`,
      tone: 'neutral',
      bullets: [
        `${absent} students absent today`,
        late > 0 ? `${late} arrived late` : 'No late arrivals',
      ],
      action: absent > 20 ? `Monitor the ${absent} absent students — follow up if absence persists` : null,
    };
  }

  // Case 5: Excellent (≥ 90%)
  return {
    headline: `Excellent attendance — ${rate}% present`,
    body: `${present} of ${totalStudents} students are present. Today's attendance is strong and above the 90% target.`,
    tone: 'positive',
    bullets: [
      `Only ${absent} student${absent !== 1 ? 's' : ''} missing`,
      late > 0 ? `${late} late arrivals noted` : 'All arrivals on time',
      changePct > 0 ? `Improved ${changePct}% from yesterday` : '',
    ].filter(Boolean) as string[],
    action: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TREND NARRATIVE (for 7-day / 30-day series)
// ─────────────────────────────────────────────────────────────────────────────
export function generateTrendNarrative(
  series: { date: string; present: number; absent: number }[],
  totalStudents: number,
): TrendNarrative {
  if (series.length < 2) {
    return { direction: 'unknown', sentence: 'Insufficient data to identify a trend yet.' };
  }

  // Calculate rates for each data point
  const rates = series.map(d => {
    const total = d.present + d.absent;
    return total > 0 ? (d.present / total) * 100 : 0;
  }).filter(r => r > 0);

  if (rates.length < 2) {
    return { direction: 'unknown', sentence: 'Not enough attendance records to analyse a trend.' };
  }

  const first = rates[0];
  const last  = rates[rates.length - 1];
  const delta = last - first;

  // Detect monotone decline over last 4 days
  const last4 = rates.slice(-4);
  const steadyDecline = last4.every((r, i) => i === 0 || r <= last4[i - 1]);
  const steadyRise    = last4.every((r, i) => i === 0 || r >= last4[i - 1]);

  if (steadyDecline && delta < -5) {
    return {
      direction: 'down',
      sentence: `Attendance has declined steadily over the last ${last4.length} days — from ${first.toFixed(1)}% to ${last.toFixed(1)}%. This pattern warrants investigation before it becomes a systemic issue.`,
    };
  }
  if (steadyRise && delta > 3) {
    return {
      direction: 'up',
      sentence: `Attendance has improved consistently over the last ${last4.length} days — up from ${first.toFixed(1)}% to ${last.toFixed(1)}%. This is a positive trend.`,
    };
  }
  if (Math.abs(delta) < 3) {
    return {
      direction: 'flat',
      sentence: `Attendance has been relatively stable over this period, hovering around ${(rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1)}%.`,
    };
  }
  if (delta < 0) {
    return {
      direction: 'down',
      sentence: `Attendance has dropped ${Math.abs(delta).toFixed(1)} percentage points over this period — from ${first.toFixed(1)}% down to ${last.toFixed(1)}%.`,
    };
  }
  return {
    direction: 'up',
    sentence: `Attendance has improved ${delta.toFixed(1)} percentage points over this period — rising from ${first.toFixed(1)}% to ${last.toFixed(1)}%.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHOOL HEALTH SCORE CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────
export function calculateHealthScore(params: {
  attendanceRate: number;         // 0-100
  weeklyTrend: { present: number; absent: number }[];
  riskStudentsPct: number;        // percent of total students at risk
  deviceOnlinePct: number;        // percent of devices online (0-100)
  feeCompliancePct: number;       // percent NOT in arrears (0-100)
  avgAcademicScore: number;       // 0-100 (0 if no data)
}): SchoolHealthScore {
  const { attendanceRate, weeklyTrend, riskStudentsPct, deviceOnlinePct, feeCompliancePct, avgAcademicScore } = params;

  // Weights
  const components = [
    { label: 'Attendance',        raw: attendanceRate,                               weight: 35 },
    { label: 'Attendance Trend',  raw: trendScore(weeklyTrend),                      weight: 15 },
    { label: 'Student Risk',      raw: Math.max(0, 100 - riskStudentsPct * 3),       weight: 20 },
    { label: 'Device Health',     raw: deviceOnlinePct >= 0 ? deviceOnlinePct : 100, weight: 10 },
    { label: 'Fee Compliance',    raw: feeCompliancePct,                             weight: 10 },
    { label: 'Academic Standing', raw: avgAcademicScore > 0 ? avgAcademicScore : 60, weight: 10 },
  ];

  const total = components.reduce((acc, c) => acc + (Math.min(100, Math.max(0, c.raw)) * c.weight / 100), 0);
  const score = Math.round(total);
  const grade: SchoolHealthScore['grade'] =
    score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'F';
  const label =
    score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 55 ? 'Needs Attention' : score >= 40 ? 'At Risk' : 'Critical';

  return {
    score,
    grade,
    label,
    breakdown: components.map(c => ({
      label:  c.label,
      score:  Math.round(Math.min(100, Math.max(0, c.raw))),
      weight: c.weight,
    })),
  };
}

function trendScore(series: { present: number; absent: number }[]): number {
  if (series.length < 3) return 70;
  const rates = series.map(d => {
    const t = d.present + d.absent;
    return t > 0 ? (d.present / t) * 100 : 0;
  }).filter(r => r > 0);
  if (rates.length < 2) return 70;
  const last = rates[rates.length - 1];
  const first = rates[0];
  const delta = last - first;
  return Math.min(100, Math.max(0, last + (delta > 0 ? 5 : delta < -5 ? -10 : 0)));
}
