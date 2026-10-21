import type { RouteDoc } from '@/lib/devdocs/route-doc';

const PAGE = 'src/app/attendance/trends/page.tsx';
const API = 'src/app/api/attendance/patterns/route.ts';

const doc: RouteDoc = {
  route: '/attendance/trends',
  reviewed: { [PAGE]: '4ebac50a552c', [API]: '32b6fcb83a82' },

  identity: {
    purpose: 'Attendance Trends (Phase 6 — pattern analytics): daily present / late / absent verdicts for learners or staff over 14–90 days as a stacked area chart, a headline trend (present rate, first half vs second half of the window), and deterministic alerts — whole-school anomalies and per-class (learners) or per-department (staff) drift.',
    users: 'Administrators and head teachers.',
    permissions: 'Page: session (middleware). API: session only.',
    upstream: 'attendance_records (engine verdicts, school-local attendance_date), students/enrollments/classes and staff/departments for grouping. Pure detectors in src/lib/attendance/pattern-analytics.ts.',
    downstream: 'Read-only. `?banner=1` of the same API gives an alert count for inline warnings elsewhere.',
  },

  files: [
    { path: PAGE, role: 'Route entry: role toggle, window select, trend headline, chart, alerts.', shared: false },
    { path: API, role: 'GET /api/attendance/patterns — series, trend, alerts.', shared: false },
  ],

  layout: `- **src/middleware.ts** → **AuthenticatedShell** → **MainLayout**; **src/app/attendance/layout.tsx** gradient.
- SWR with a page-local no-store fetcher (no toasts). The server localises alert text to Arabic itself (arabicPatternAlert) using the \`lang\` cookie written by the theme store (src/hooks/useThemeStore.ts) — the page sends no language parameter.
- Chart: Recharts (\`AreaChart\`), client-only.`,

  tree: `AttendanceTrends                           src/app/attendance/trends/page.tsx
  ├─ header: icon · title · subtitle · [Learners|Staff] toggle · window <select> 14/30/60/90
  ├─ spinner (first load)
  ├─ trend headline: icon · "Attendance is improving (+n%)" · explanation
  ├─ chart card: ResponsiveContainer › AreaChart › CartesianGrid · XAxis · YAxis · Tooltip · Legend · Area ×3 (stacked)
  └─ alerts: one bordered card per alert (title · detail · → recommendation) | "No unusual patterns"
  data: useSWR /api/attendance/patterns?role=&days=`,

  notes: {
    [PAGE]: {
      'import:react': '`useState` for role and window.',
      'import:swr': 'The patterns request (re-keyed by role and days).',
      'import:recharts': 'AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend.',
      'import:lucide-react': 'Trend and alert icons.',
      'import:@/components/i18n/I18nProvider': '`useI18n()` — t (English fallback as 3rd argument) and digits.',
      fetcher: '`fetch(u, {cache: "no-store"}).then(r => r.json())` — no status check, no toast.',
      HEX: 'Status colours for the chart (present green, late amber, absent red) — the DRAIS status palette.',
      LEVEL_STYLE: 'Alert card border/background and icon per level: alert (rose), watch (amber), info (sky).',
      AttendanceTrends: 'The route\'s default export.',
      'AttendanceTrends.{ t, digits }': 'i18n helpers.',
      'AttendanceTrends.[role, setRole]': "'student' | 'staff'.",
      'AttendanceTrends.[days, setDays]': 'Window: 14, 30 (default), 60, 90 (server clamps 7–120).',
      'AttendanceTrends.{ data, isLoading }': 'useSWR patterns?role&days.',
      'AttendanceTrends.series': 'Chart rows: date as "MM-DD", Present (strictly on time), Late, Absent. The keys are English data keys; the Area `name` props carry the translated legend labels.',
      'AttendanceTrends.tr': 'Trend {direction improving|declining|stable, deltaPct}; stable when fewer than 4 days or |delta| < 5 %.',
      'AttendanceTrends.TrendIcon': 'Up / down / flat icon.',
      'AttendanceTrends.trendColor': 'Green / rose / slate.',
      'AttendanceTrends.dirWord': 'Translated direction word.',
      'AttendanceTrends.render#1': 'Header with the role toggle (segmented buttons) and window select; first-load spinner; headline card (direction + signed percentage, "present rate, first half vs second half of the last N days" — N is the server\'s clamped days); the chart only when there is at least one day (axis ticks and tooltip values in Arabic digits); the alerts list or "No unusual patterns detected in this window".',
    },
    [API]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/db': '`query`.',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      'import:@/lib/attendance/pattern-analytics': 'Pure detectors: analyzeSeries (whole-school anomalies over the day series), analyzeGroups (per class/department drift), trend (first half vs second half), arabicPatternAlert (Arabic text for an alert), DayPoint type.',
      'import:@/lib/i18n/localize': '`langFromRequest` — `?lang`, then `x-lang`, then the `lang` cookie.',
      runtime: "'nodejs'.",
      GET: 'Pattern analytics for one role over a window. Session only, school-scoped.',
      'GET.session': 'Session.',
      'GET.guard#1': 'No session → 401.',
      'GET.{ schoolId }': 'Tenant.',
      'GET.sp': 'Query parameters.',
      'GET.days': '7–120, default 30.',
      'GET.role': 'staff or student (default).',
      'GET.since': 'Start date = now − days, as a UTC date (not the school-local date; at most a day\'s difference near midnight).',
      'GET.list': 'Query helper: default params [school, role, since]; errors → [] (a failed sub-query yields an empty chart, not a 500).',
      'GET.dayRows': `Per day: present incl. late, late, absent and total, for statuses present/late/absent/half_day.

\`half_day\` is counted in \`total\` but in none of present/late/absent, so on days with half-days the stacked areas sum to less than the population and the present rate treats half-days as not present.`,
      'GET.series': 'DayPoint per day with present = present incl. late − late (strictly on time).',
      'GET.presentRates': '(present + late) / total per day — the input of the trend.',
      'GET.seriesAlerts': 'analyzeSeries(series).',
      'GET.groupAlerts': 'Per-group drift alerts.',
      'GET.guard#2': `Learners: verdicts per class, using one "primary" active enrollment per student (ROW_NUMBER over default programme, newest) — avoids double-counting multi-programme learners and avoids a subquery in a JOIN's ON (TiDB rejects it). Staff (else branch): per department, falling back to position, then "Unassigned".

These group queries do not filter by status, so totals include every verdict type (excused, holiday …), unlike the day series.`,
      'GET.alerts': 'Series + group alerts, translated to Arabic when the request language is Arabic.',
      'GET.guard#3': '`?banner=1` → {alert: first "alert"-level item, alerts: count of alert-level items}.',
      'GET.return#1': '{success, days, role, since, series, trend, alerts}.',
      'GET.catch#1': '500 with the message.',
    },
  },

  ui: [
    { title: 'Header', text: 'Line-chart icon, "Attendance Trends", subtitle; Learners / Staff segmented toggle; 14 / 30 / 60 / 90 days.' },
    { title: 'Trend headline', text: 'Up/down/flat icon and "Attendance is improving (+7%)" (green), "declining" (rose) or "stable" (slate), with the explanation of how it is measured.' },
    { title: 'Daily verdicts chart', text: 'Stacked areas — present, late, absent — per day (MM-DD), dashed horizontal grid, legend and tooltip.' },
    { title: 'Intelligent alerts', text: 'Cards coloured by level with an icon, title, detail and an indigo "→ recommendation"; or "No unusual patterns detected in this window".' },
  ],

  interactions: [
    { action: 'Open the page', steps: ['useSWR GET /api/attendance/patterns?role=student&days=30 → day series, trend, series + class alerts → headline, chart, alerts.'] },
    { action: 'Switch to Staff or change the window', steps: ['setRole / setDays → new SWR key → fetch → everything re-renders (the previous data stays visible until the new response arrives).'] },
  ],

  data: `**GET /api/attendance/patterns?role=student|staff&days=7..120[&banner=1]** → \`{ success, days, role, since, series: [{ date, present, late, absent, total }], trend: { direction, deltaPct }, alerts: [{ level: info|watch|alert, title, detail, recommendation? }] }\`; banner: \`{ success, alert, alerts }\`.

Source: attendance_records (status, attendance_date, role_type, person_id) joined to students/enrollments/programs/classes or staff/departments.`,

  states: `- **First load**: spinner.
- **No verdicts in the window**: headline "stable" (no delta), no chart, "No unusual patterns".
- **Error / signed out**: the error JSON becomes data → stable headline with no chart and no alerts (misleading: looks like a quiet window).`,

  security: `- Session only and school-scoped; only aggregates (counts per day / class / department names) are returned.`,

  styling: `Tailwind with dark variants; max-w-4xl; the chart is 100 % wide × 16 rem high (ResponsiveContainer). Colours follow the status palette and are always backed by a legend and labelled axes. RTL: Arabic digits on ticks and tooltip; Recharts itself does not mirror the time axis (oldest stays on the left).`,

  testing: `- **Tests**: src/lib/attendance/__tests__/pattern-analytics.test.mjs (trend, analyzeSeries, analyzeGroups, Arabic alerts). Run \`npm run test:attendance\`. The SQL and the page are untested.
- **Numbers disagree with /dashboard/analytics**: trends counts attendance_records verdicts; check for half_day and other statuses.`,

  extend: [
    { change: 'Add a detector', how: 'Write it as a pure function in pattern-analytics.ts returning PatternAlert[], add its Arabic text in arabicPatternAlert, call it in the route, and cover it in pattern-analytics.test.mjs.' },
    { change: 'Count half days', how: 'Return half_day as its own series value and add a fourth Area (with a legend label and a colour from the status palette), or count it as present in presentRates — decide with the school, then make the group queries use the same status filter.' },
    { change: 'Filter by class', how: 'Add `class_id` to the API (EXISTS on the primary enrollment) and a class select on the page; include it in the SWR key.' },
  ],
};

export default doc;
