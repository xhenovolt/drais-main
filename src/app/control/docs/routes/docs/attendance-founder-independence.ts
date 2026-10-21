import type { RouteDoc } from '@/lib/devdocs/route-doc';

const PAGE = 'src/app/attendance/founder-independence/page.tsx';
const API = 'src/app/api/attendance/founder-independence/route.ts';

const doc: RouteDoc = {
  route: '/attendance/founder-independence',
  reviewed: { [PAGE]: 'e7353972810f', [API]: '100f9c851585' },

  identity: {
    purpose: 'Founder Independence report (Phase 10 capstone): for each attendance workflow, how dependent it was on the founder before the program ("Founder / Manual / Assisted / Automated"), what it is now, which DRAIS page handles it, in which phase it changed, and an overall before → after autonomy score. Two rows carry live signals from this school (clock-drift days and unmatched punches).',
    users: 'School owners and administrators; DRAIS staff demonstrating that a trained admin can run attendance alone.',
    permissions: 'Page: session (middleware). API: session only.',
    upstream: 'WORKFLOWS — a static list in src/lib/attendance/founder-independence.ts; live counts from device_clock_health, attendance_raw_events, attendance_time_baselines.',
    downstream: 'Read-only; the "handled by" column names other pages but does not link to them.',
  },

  files: [
    { path: PAGE, role: 'Route entry: score card and the workflow table.', shared: false },
    { path: API, role: 'GET /api/attendance/founder-independence — the report.', shared: false },
  ],

  layout: `- **src/middleware.ts** → **AuthenticatedShell** → **MainLayout**; **src/app/attendance/layout.tsx** gradient.
- One raw fetch on mount, no SWR and no toasts.`,

  tree: `FounderIndependence                        src/app/attendance/founder-independence/page.tsx
  ├─ header: icon · title · subtitle
  ├─ spinner (until data)
  ├─ score card: before % → now % · "+N points" · "weighted over N workflows"
  └─ table: workflow (+ live note) · before badge · now badge · handled by (surface + phase)`,

  notes: {
    [PAGE]: {
      'import:react': '`useState`, `useEffect`.',
      'import:lucide-react': 'Icons.',
      'import:@/components/i18n/I18nProvider': '`useI18n()` — t, lang, digits.',
      AUTONOMY_STYLE: 'Badge colour per autonomy level: founder (rose), manual (amber), assisted (sky), automated (green).',
      LABEL: 'English fallback labels for the autonomy levels (passed as the third argument of t).',
      FounderIndependence: 'The route\'s default export.',
      'FounderIndependence.{ t, lang, digits }': 'i18n helpers.',
      'FounderIndependence.liveText': 'The server writes the two live notes in English in fixed shapes; in Arabic this matches them by regex and re-renders them from translation keys. Any other text gets Arabic digits only. Keep in step with buildReport.',
      'FounderIndependence.phaseText': 'Arabic: "pre-program" → translated, "Phase N …" → translated phase prefix with Arabic digits; English: unchanged.',
      'FounderIndependence.[data, setData]': 'Report; null until loaded.',
      'FounderIndependence.effect#1': 'GET once (no-store). Errors are swallowed — the spinner then stays forever (data never set). An error body (401/500) is set as data: no score, no rows, no spinner, a blank page.',
      'FounderIndependence.render#1': 'Header; spinner while no data; score card (before in rose, after in green, Arabic digits + ٪ in Arabic; "+delta" and the workflow count); table with translated workflow names (key `attendancePages.founder.wf.<key>.workflow`, English from the server as fallback), green "● live" note, before/now badges, surface and phase.',
    },
    [API]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      'import:@/lib/attendance/founder-independence': '`buildReport(school)` — copies WORKFLOWS, adds live notes to clock_drift (drift days in 30 days, baseline learned/pending) and identity_health (unmatched punches in 7 days), and scores before/after as the mean of AUTONOMY_WEIGHT per row.',
      runtime: "'nodejs'.",
      GET: 'Report for the caller\'s school. Session only.',
      'GET.session': 'Session.',
      'GET.guard#1': 'No session → 401.',
      'GET.return#1': '{success, rows, score {before, after, delta}, generated_at}.',
      'GET.catch#1': '500 with the message.',
    },
  },

  ui: [
    { title: 'Header', text: 'Shield icon, "Founder Independence", subtitle.' },
    { title: 'Score card', text: 'Baseline % (rose) → Now % (green), "+N points of autonomy", "weighted over N workflows".' },
    { title: 'Workflow table', text: 'Workflow (with a green live note on two rows), Before and Now autonomy badges, Handled by (the DRAIS surface and the phase that delivered it). Scrolls horizontally on narrow screens.' },
  ],

  interactions: [
    { action: 'Open the page', steps: ['GET /api/attendance/founder-independence → buildReport (static rows + two live counts) → score card and table.'] },
  ],

  data: `**GET /api/attendance/founder-independence** → \`{ success, rows: [{ key, workflow, before, after, surface, phase, live? }], score: { before, after, delta }, generated_at }\`. Autonomy values: founder | manual | assisted | automated.

Rows are static (WORKFLOWS); only \`live\` reflects the school. The score is therefore the same for every school.`,

  states: `- **Loading**: spinner.
- **Request throws (network)**: spinner forever.
- **Error response**: blank below the header (no message).`,

  security: `- Session only; the report contains no personal data — two aggregate counts for the school.`,

  styling: `Tailwind with dark variants; max-w-4xl; the table scrolls horizontally (\`overflow-x-auto\`). \`text-start\` keeps alignment correct in RTL; the arrow between the scores does not flip in RTL (it reads "before ← now" visually reversed).`,

  testing: `- **Tests**: src/lib/attendance/__tests__/founder-independence.test.mjs (scoreIndependence and the workflow list). Run \`npm run test:attendance\`.
- Changing WORKFLOWS changes the page for every school; update the translation keys \`attendancePages.founder.wf.<key>.*\` in both locales.`,

  extend: [
    { change: 'Add a workflow', how: 'Append to WORKFLOWS (key, workflow, before, after, surface, phase) and add `attendancePages.founder.wf.<key>.workflow` / `.surface` in en.json and ar.json. The score updates automatically.' },
    { change: 'Add a live signal', how: 'Query it in buildReport and `set(key, text)`; add a regex branch for its exact English shape in liveText with a translation key, or Arabic users will see English.' },
    { change: 'Link to the handling page', how: 'Add a `route` to WorkflowRow and render the surface as a Link.' },
  ],
};

export default doc;
