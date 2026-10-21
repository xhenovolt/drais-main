import type { RouteDoc } from '@/lib/devdocs/route-doc';

const PAGE = 'src/app/dashboard/analytics/page.tsx';
const SHELL = 'src/components/analytics/DashboardAnalytics.tsx';
const CARD = 'src/components/dashboard/DashboardCard.tsx';
const LOADING = 'src/components/dashboard/LoadingPlaceholder.tsx';
const PERF = 'src/components/analytics/StudentPerformanceAnalytics.tsx';
const FIN = 'src/components/analytics/FinanceAnalytics.tsx';
const ATT = 'src/components/analytics/AttendanceAnalytics.tsx';
const ENR = 'src/components/analytics/EnrollmentAnalytics.tsx';
const API_PERF = 'src/app/api/analytics/student-performance/route.ts';
const API_FIN = 'src/app/api/analytics/finance/route.ts';
const API_ATT = 'src/app/api/analytics/attendance/route.ts';
const API_ENR = 'src/app/api/analytics/enrollment/route.ts';

/** The same four lines open every analytics handler; one explanation, reused. */
const handlerPrelude = {
  'import:next/server': '`NextRequest` and `NextResponse.json`.',
  'import:@/lib/db': '`getConnection()` — a dedicated MySQL/TiDB connection for this request\'s sequential queries.',
  'import:@/lib/auth': '`getSessionSchoolId(req)` — the session\'s school; the only source of `schoolId` here.',
  'import:@/lib/auth/requireModule': '`checkModule(schoolId, \'analytics\')` — returns a 403 `MODULE_DISABLED` response when the school does not have the Analytics module.',
  'GET.session': 'The signed-in session.',
  'GET.guard#1': 'No session → 401 `{ error: "Not authenticated" }`.',
  'GET.__denied': 'The module check result (null when allowed).',
  'GET.guard#2': 'Module disabled → return that 403. The component shows "Error: Module \'analytics\' is not enabled for this school".',
  'GET.schoolId': 'School from the session. The `school_id` the component puts in the query string is never read — sending it is harmless but pointless.',
  'GET.{ searchParams }': 'Query string.',
  'GET.connection': 'Opened with getConnection(). Closed with `connection.end()` just before the success response — **but not on the error path**: a failing query jumps to the catch with the connection still open. [defect] connection leak per failure (no `finally`).',
  'GET.catch#1': 'Logs on the server and returns 500 `{ error: "Failed to fetch analytics" }` (no `success` field, so the component\'s `result.success` check fails and it shows that message). Leaves the connection open (see `connection`).',
};

const doc: RouteDoc = {
  route: '/dashboard/analytics',
  reviewed: {
    [PAGE]: '48aa05768a48', [SHELL]: '74194887dd3c', [CARD]: 'f14821ae9e70', [LOADING]: '427c63fde690',
    [PERF]: 'e0e21b69f160', [FIN]: 'e0e6bc391e95', [ATT]: '2adf27232b75', [ENR]: '5ec7d9833fac',
    [API_PERF]: '5ba590e4fad3', [API_FIN]: '2068723612af', [API_ATT]: '8b7e6bb0d72d', [API_ENR]: 'c082c339bede',
  },

  identity: {
    purpose: 'A four-tab analytics screen — Student Performance, Finance, Attendance, Enrollment — each tab a self-contained component with its own API call and charts (recharts).',
    users: 'Any signed-in user of a school with the Analytics module enabled. Nothing links to this page: it is not in the sidebar and no page links to it (only src/lib/routeValidator.ts lists it); it is reached by typing the URL.',
    permissions: 'Page: none (session only, via middleware). APIs: session + `checkModule(school, \'analytics\')`. No permission code — any staff member of the school, including non-finance roles, can see the finance totals and outstanding balances by learner.',
    upstream: 'AuthContext (user.schoolId), class_results, student_fee_items, finance_payments, ledger, wallets, attendance_records, students/people/enrollments/classes, location tables (villages … districts).',
    downstream: 'None — read-only, no links out.',
  },

  files: [
    { path: PAGE, role: 'Route entry. Loads DashboardAnalytics client-only and passes the school id.', shared: false },
    { path: SHELL, role: 'Header, tab bar and tab switching; renders exactly one tab component at a time.', shared: false },
    { path: CARD, role: 'Shared card wrapper (frosted background, optional title row, hover lift). Used by 9 files.', shared: true },
    { path: LOADING, role: 'Shared full-screen loading skeleton, shown by each tab while its request runs. Used by 4 files.', shared: true },
    { path: PERF, role: 'Student Performance tab.', shared: false },
    { path: FIN, role: 'Finance tab (also used elsewhere: 2 importers).', shared: true },
    { path: ATT, role: 'Attendance tab.', shared: false },
    { path: ENR, role: 'Enrollment tab (2 importers).', shared: true },
    { path: API_PERF, role: 'GET /api/analytics/student-performance.', shared: false },
    { path: API_FIN, role: 'GET /api/analytics/finance.', shared: false },
    { path: API_ATT, role: 'GET /api/analytics/attendance.', shared: false },
    { path: API_ENR, role: 'GET /api/analytics/enrollment.', shared: false },
  ],

  layout: `Root layout only (no src/app/dashboard/layout.tsx): middleware session check → src/app/layout.tsx providers → AuthenticatedShell (SWRConfig, toasts, error boundary, MainLayout sidebar). The page adds a \`p-6\` wrapper. /dashboard/analytics is under the /dashboard prefix in OFFLINE_SAFE_PREFIXES, so in local-SQLite mode the page renders — but every analytics API uses \`getConnection()\` (MySQL only) and fails there.`,

  tree: `AnalyticsPage                                   src/app/dashboard/analytics/page.tsx
  └─ DashboardAnalytics  (dynamic, ssr:false)    src/components/analytics/DashboardAnalytics.tsx
       ├─ DashboardCard  header: title · attendance window <select> · Settings button
       ├─ tab bar (4 motion.buttons)
       ├─ motion.div (key = active tab) → ONE of:
       │    ├─ StudentPerformanceAnalytics → GET /api/analytics/student-performance
       │    ├─ FinanceAnalytics            → GET /api/analytics/finance
       │    ├─ AttendanceAnalytics         → GET /api/analytics/attendance?days=N
       │    └─ EnrollmentAnalytics         → GET /api/analytics/enrollment
       │        (each: LoadingPlaceholder | error text | KPI cards + DashboardCard charts/lists)
       └─ DashboardCard  "Analytics Insights" footer (static text)`,

  notes: {
    [PAGE]: {
      'import:react': 'JSX.',
      'import:next/dynamic': 'Client-only loading of DashboardAnalytics with a "Loading analytics…" placeholder, keeping recharts out of the server compile.',
      'import:@/contexts/AuthContext': '`useAuth()` for `user.schoolId`.',
      DashboardAnalytics: 'The dynamically loaded analytics shell (see its file).',
      AnalyticsPage: 'Route component.',
      'AnalyticsPage.{ user }': 'Signed-in user.',
      'AnalyticsPage.schoolId': 'School id as a string ("" before the user loads). Only passed on; the APIs ignore it and use the session.',
      'AnalyticsPage.render#1': 'A padded wrapper around DashboardAnalytics with `termId` and `classId` explicitly undefined — so the term/class filters the tab components support are never used from this page.',
    },
    [SHELL]: {
      'import:react': '`useState` for the active tab and the attendance window.',
      'import:framer-motion': 'Animated tab buttons (`motion.button`, tap scale), the sliding active background (`layoutId="activeTab"`), and the fade-in of each tab\'s content.',
      'import:lucide-react': 'Tab and header icons.',
      'import:./StudentPerformanceAnalytics': 'Performance tab.',
      'import:./FinanceAnalytics': 'Finance tab.',
      'import:./AttendanceAnalytics': 'Attendance tab.',
      'import:./EnrollmentAnalytics': 'Enrollment tab.',
      'import:@/components/dashboard/DashboardCard': 'Card wrapper for header and footer.',
      AnalyticsTab: 'Union of the four tab ids — a misspelt id fails to compile.',
      DashboardAnalyticsProps: 'schoolId (string), optional termId and classId.',
      DashboardAnalytics: 'The tabbed analytics shell.',
      'DashboardAnalytics.[activeTab, setActiveTab]': 'Which tab is shown; starts on "performance". Local state only — not in the URL, so reloading or sharing the link always opens Performance.',
      'DashboardAnalytics.[dateRange, setDateRange]': 'Attendance window in days as a string ("30"); parsed with parseInt when passed to AttendanceAnalytics.',
      'DashboardAnalytics.tabs': 'Tab definitions: id, English label (not translated), icon, colour name.',
      'DashboardAnalytics.renderActiveAnalytics': 'Switch on activeTab → the one tab component to mount. Only the active tab exists in the tree, so switching tabs unmounts the old one and the new one fetches again on mount (no caching between switches).',
      'DashboardAnalytics.render#1': 'Header card (title, subtitle; the window `<select>` only while the Attendance tab is active; a Settings button with **no onClick** — it does nothing), the tab bar, the content area (`motion.div key={activeTab}` so each switch re-animates; min height 600 px), and a static footer card. The active tab classes are built as `bg-${tab.color}-50` etc. — Tailwind only generates classes it finds written out literally in the source, so these work only because the same class names happen to appear elsewhere in the code base. [defect] fragile styling. The footer promises "Predictive insights", "Drill-down capabilities" and "Export functionality" — none exist on this page. [defect] misleading copy.',
    },
    [CARD]: {
      'import:react': 'JSX and ReactNode.',
      'import:framer-motion': '`motion.div` with `layout` (animates size changes) and `whileHover` lift.',
      'import:clsx': 'Joins class names conditionally.',
      DashboardCardProps: 'title?, children, className?, headerActions?.',
      DashboardCard: 'Shared card: frosted white/slate background, rounded-2xl, shadow, a 2 px lift on hover. With a title, a header row (title + optional actions) and less top padding on the body.',
      'DashboardCard.render#1': 'motion.div → optional header → padded body. Changing this component restyles every card in its 9 importers; check them before changing padding or the hover behaviour.',
    },
    [LOADING]: {
      'import:react': 'JSX.',
      'import:framer-motion': 'Staggered fade-in of the skeleton blocks.',
      LoadingPlaceholder: 'A full-page skeleton (header bar, four KPI blocks, two chart blocks) and a "Loading dashboard..." pill.',
      'LoadingPlaceholder.render#1': 'Uses `min-h-screen` and its own gradient background, so inside a tab it fills more than a screen and briefly shows a second gradient. Built as a page-level loader; reused here inside a tab.',
    },
    [PERF]: {
      'import:react': '`useState`, `useEffect`.',
      'import:framer-motion': 'Entrance animations on cards and list rows.',
      'import:lucide-react': 'Icons.',
      'import:recharts': 'Bar chart (subject averages / rates) and pie chart (distribution). LineChart/Line/Cell imports partly unused.',
      'import:@/components/dashboard/DashboardCard': 'Chart and list cards.',
      'import:@/components/dashboard/LoadingPlaceholder': 'Loading state.',
      PerformanceData: 'The API data: performanceTrends, atRiskStudents, topPerformers, subjectPerformance (rows typed `any`).',
      COLORS: 'Six chart colours — declared, not used.',
      StudentPerformanceAnalytics: 'The Student Performance tab.',
      'StudentPerformanceAnalytics.[data, setData]': 'API data or null.',
      'StudentPerformanceAnalytics.[loading, setLoading]': 'True until the first request finishes.',
      'StudentPerformanceAnalytics.[error, setError]': 'Error text, or null. Never cleared before a refetch (only set).',
      'StudentPerformanceAnalytics.effect#1': 'Runs `fetchData()` after mount and whenever schoolId, termId or classId change (here: once — they never change). `fetchData` is declared after the effect, which works because the effect runs after render, by which time the const exists.',
      'StudentPerformanceAnalytics.fetchData': 'GET `/api/analytics/student-performance?school_id=…[&term_id][&class_id]`. `success` → setData(result.data); otherwise setError(result.error or a default). A thrown fetch/JSON error → "Network error occurred". Always clears loading.',
      'StudentPerformanceAnalytics.guard#1': 'Loading → LoadingPlaceholder.',
      'StudentPerformanceAnalytics.guard#2': 'Error → red "Error: …" text.',
      'StudentPerformanceAnalytics.guard#3': 'No data → "No data available".',
      'StudentPerformanceAnalytics.performanceTrendData': 'Groups score rows by subject — computed and never rendered. [defect] dead computation.',
      'StudentPerformanceAnalytics.subjectAvgScores': 'Per subject (and class) row: average score, excellent rate, failing rate, as percentages of `student_count` — which the API counts as result rows, not distinct learners.',
      'StudentPerformanceAnalytics.riskDistribution': 'Pie slices: at-risk count, top-performer count, and "Average" = **100 − those two** — a fixed 100, not the number of learners. [defect] the Average slice is meaningless.',
      'StudentPerformanceAnalytics.render#1': 'Four gradient KPI cards (at-risk count, top performers, subjects analysed, average of subject averages), the subject bar chart and the distribution pie, then two lists of up to 10: "Students Requiring Attention" (name, class, average, failing subjects, attendance %) and "Top Performing Students". Labels are English only.',
    },
    [FIN]: {
      'import:react': '`useState`, `useEffect`.',
      'import:framer-motion': 'Entrance animations.',
      'import:lucide-react': 'Icons.',
      'import:recharts': 'Area chart (daily collections), bar charts (by class; income vs expenses).',
      'import:@/components/dashboard/DashboardCard': 'Cards.',
      'import:@/components/dashboard/LoadingPlaceholder': 'Loading state.',
      FinanceData: 'feeCollectionSummary, paymentTrends, outstandingBalances, incomeExpenses, walletBalances.',
      COLORS: 'Declared, not used.',
      FinanceAnalytics: 'The Finance tab.',
      'FinanceAnalytics.[data, setData]': 'API data (normalised to arrays) or null.',
      'FinanceAnalytics.[loading, setLoading]': 'Loading flag.',
      'FinanceAnalytics.[error, setError]': 'Error text.',
      'FinanceAnalytics.effect#1': 'fetchData on mount and when schoolId/termId change.',
      'FinanceAnalytics.fetchData': 'GET `/api/analytics/finance?school_id=…[&term_id]`. On success every one of the five fields is forced to an array (a malformed response shows empty sections instead of crashing every .map). Errors as in the other tabs.',
      'FinanceAnalytics.guard#1': 'Loading → LoadingPlaceholder.',
      'FinanceAnalytics.guard#2': 'Error text.',
      'FinanceAnalytics.guard#3': 'No data.',
      'FinanceAnalytics.totalExpected': 'Sum of `total_expected` over classes.',
      'FinanceAnalytics.totalCollected': 'Sum of `total_collected`.',
      'FinanceAnalytics.totalOutstanding': 'Sum of `total_outstanding`.',
      'FinanceAnalytics.collectionRate': 'collected / expected × 100.',
      'FinanceAnalytics.paymentTrendData': 'Daily rows mapped to { date (browser locale), amount, transactions } and reversed (the API returns newest first) so the chart reads left → right in time.',
      'FinanceAnalytics.classCollectionData': 'Per class: collected, outstanding, payment rate.',
      'FinanceAnalytics.incomeExpenseData': 'Per finance category: income, expenses, net (last 90 days).',
      'FinanceAnalytics.render#1': 'KPI cards (Total Collected with rate, Outstanding with "N students" — the 50-row-limited list length, Expected Revenue labelled "This term" even without a term filter, Active Wallets labelled "Payment methods"), four chart/list cards and the top-10 outstanding table (student, class, balance, last payment, days overdue). [defect] the wallet card reads `wallet.method` and `wallet.net_balance`, but the API returns `location_type` and `current_balance` — it renders "undefined • N transactions" and "UGX NaN". [unverified] the by-class bar chart uses `layout="horizontal"` with a category Y axis, a combination recharts normally draws with `layout="vertical"`; check it renders bars. Currency is hard-coded "UGX".',
    },
    [ATT]: {
      'import:react': '`useState`, `useEffect`.',
      'import:framer-motion': 'Entrance animations.',
      'import:lucide-react': 'Icons.',
      'import:recharts': 'Imported (LineChart, BarChart, ScatterChart …) but **no chart is rendered** in this component.',
      'import:@/components/dashboard/DashboardCard': 'Imported, not used (cards here use a `card` CSS class instead).',
      'import:@/components/dashboard/LoadingPlaceholder': 'Loading state.',
      AttendanceData: 'Declares the five API arrays plus classAttendanceTrends, bestPerformingClass, worstPerformingClass, monthlyAverage, attendanceGoal — **the API returns none of these five extra fields.**',
      AttendanceAnalytics: 'The Attendance tab. Prop `days` (window).',
      'AttendanceAnalytics.[data, setData]': 'API data or null.',
      'AttendanceAnalytics.[loading, setLoading]': 'Loading flag.',
      'AttendanceAnalytics.[error, setError]': 'Error text.',
      'AttendanceAnalytics.effect#1': 'fetchData on mount and whenever schoolId or `days` changes — so the shell\'s window `<select>` refetches with the new window. (Loading is set true again, so the whole tab is replaced by the skeleton during the refetch.)',
      'AttendanceAnalytics.fetchData': 'GET `/api/analytics/attendance?school_id=…&days=N`.',
      'AttendanceAnalytics.guard#1': 'Loading → LoadingPlaceholder.',
      'AttendanceAnalytics.guard#2': 'Error text.',
      'AttendanceAnalytics.guard#3': 'No data.',
      'AttendanceAnalytics.dailyTrends': 'Pivots dailyOverview (one row per date per role) into one object per date — computed, never rendered.',
      'AttendanceAnalytics.classAttendanceData': 'Per-class average of daily rates — computed, never rendered.',
      'AttendanceAnalytics.correlationData': 'Attendance vs performance per learner — computed, never rendered.',
      'AttendanceAnalytics.avgAttendanceRate': 'The average attendance rate **of the chronic absentees only** — shown as "Average Attendance". [defect] it describes the worst learners, not the school.',
      'AttendanceAnalytics.averageAttendance': 'School-wide average of daily present/total — the meaningful figure, computed and not shown. (Divides by zero → NaN when there are no days, but it is unused.)',
      'AttendanceAnalytics.trend': 'Last row\'s rate minus first row\'s rate × 100, labelled "Weekly Trend vs last week". dailyOverview is ordered newest first and mixes staff and learner rows, so this subtracts the newest from the oldest of arbitrary roles. [defect] wrong sign and not weekly.',
      'AttendanceAnalytics.getGoalProgress': 'monthlyAverage / attendanceGoal × 100 — both always undefined from the API, so always 0.',
      'AttendanceAnalytics.getPerformanceColor': 'Green ≥ 90, yellow ≥ 75, red below — used only by the (always empty) class list.',
      'AttendanceAnalytics.render#1': 'Four KPI cards (Average Attendance, Weekly Trend, At-Risk Students = chronic absentees, Goal Progress = always 0 %), a "Class Performance" list fed by `classAttendanceTrends` (never returned → empty), Best/Needs-attention cards fed by fields never returned (blank), the chronic-absentee grid labelled "Below 75%" (the API\'s rule is < 80 % OR more than 5 absent days), a Monthly Summary (always 0.0 %, 0 %, ✓ because 0 ≥ 0), and the same absentee list a second time in a different layout. [defect] most of this tab shows placeholders; the at-risk list is the one real section.',
    },
    [ENR]: {
      'import:react': '`useState`, `useEffect`.',
      'import:framer-motion': 'Entrance animations.',
      'import:lucide-react': 'Icons.',
      'import:recharts': 'Bar, pie and line charts.',
      'import:@/components/dashboard/DashboardCard': 'Cards.',
      'import:@/components/dashboard/LoadingPlaceholder': 'Loading state.',
      EnrollmentData: 'enrollmentByClass, newAdmissions, dropoutAnalysis, retentionByYear, geographicDistribution, ageDistribution.',
      COLORS: 'Declared, not used.',
      EnrollmentAnalytics: 'The Enrollment tab.',
      'EnrollmentAnalytics.[data, setData]': 'API data or null.',
      'EnrollmentAnalytics.[loading, setLoading]': 'Loading flag.',
      'EnrollmentAnalytics.[error, setError]': 'Error text.',
      'EnrollmentAnalytics.effect#1': 'fetchData on mount and when schoolId changes.',
      'EnrollmentAnalytics.fetchData': 'GET `/api/analytics/enrollment?school_id=…`.',
      'EnrollmentAnalytics.guard#1': 'Loading → LoadingPlaceholder.',
      'EnrollmentAnalytics.guard#2': 'Error text.',
      'EnrollmentAnalytics.guard#3': 'No data.',
      'EnrollmentAnalytics.totalActiveStudents': 'Sum of active learners per class (parseInt of the SQL counts).',
      'EnrollmentAnalytics.totalInactiveStudents': 'Sum of inactive — computed, not shown.',
      'EnrollmentAnalytics.totalNewAdmissions': 'Admissions over the last 12 months.',
      'EnrollmentAnalytics.avgRetentionRate': 'Mean of the per-academic-year retention rates (each "active now / ever enrolled that year").',
      'EnrollmentAnalytics.genderDistribution': 'Two pie slices summed from the per-class male/female counts.',
      'EnrollmentAnalytics.admissionTrends': 'Monthly admissions (total, male, female) reversed to chronological order.',
      'EnrollmentAnalytics.render#1': 'KPI cards (active learners, new admissions, retention, number of classes), charts (students by class, gender pie, monthly admissions lines, age groups), the dropout list coloured by rate (> 15 % red, > 10 % yellow), top-10 districts, and retention by academic year. "Dropout" means status `inactive`, and "days before dropout" uses `updated_at` as the leaving date — any later edit of the record moves it.',
    },
    [API_PERF]: {
      ...handlerPrelude,
      GET: 'Four queries in sequence on one connection, returned as `{ success, data: { performanceTrends, atRiskStudents, topPerformers, subjectPerformance } }`.',
      'GET.termId': 'Optional term filter (applied to trends and subject performance).',
      'GET.classId': 'Optional class filter (trends only).',
      'GET.performanceTrends': 'Every result row of the school (filtered by term/class when given) with learner, class, subject, result type, term and the learner\'s previous score in that subject (a correlated subquery per row — slow on large schools). Not rendered by the page.',
      'GET.atRiskStudents': 'Active learners with average < 60, ≥ 2 failing (< 50) result rows, or attendance < 80 %. It LEFT JOINs results **and** the legacy `student_attendance` table on the learner, so each result row is repeated for each attendance row (counts multiply), and student_attendance is the pre-engine table measured empty — so the attendance part is always missing and the page shows "0% attendance". [defect] use attendance_records like the attendance analytics API.',
      'GET.topPerformers': 'Active learners averaging ≥ 75 with ≥ 3 result rows ≥ 80; top 20.',
      'GET.subjectPerformance': 'Per subject and class: average, min, max, result-row count, rows ≥ 75 and < 50.',
      'GET.return#1': 'Success JSON with the four raw mysql2 result arrays.',
    },
    [API_FIN]: {
      ...handlerPrelude,
      GET: 'Five queries, returned as `{ success, data: { feeCollectionSummary, paymentTrends, outstandingBalances, incomeExpenses, walletBalances } }`.',
      'GET.termId': 'Optional term filter on fee items and payments (through student_ledger).',
      'GET.feeCollectionSummary': 'Per class (active learners, active enrolment): expected, collected, outstanding, payment rate, and counts of fully-paid / unpaid fee ITEMS (labelled students).',
      'GET.paymentTrends': 'Daily totals of finance_payments for the last 30 days (newest first).',
      'GET.outstandingBalances': 'Top 50 learners by outstanding balance with last payment date and days since. Joining fee items and payments in one query multiplies rows when a learner has several of each, so SUM(sfi.balance) can be overstated. [unverified] magnitude.',
      'GET.incomeExpenses': 'Ledger in/out per finance category over the last 90 days.',
      'GET.walletBalances': 'Per wallet: opening balance + net ledger movement, income, expenses, transaction count, last date. Returns `location_type` and `current_balance` (the comment above it records the earlier `w.method` crash) — the component still reads `method` and `net_balance`.',
      'GET.return#1': 'Success JSON.',
    },
    [API_ATT]: {
      ...handlerPrelude,
      GET: 'Five queries over attendance_records (the engine\'s verdicts — the header explains the move off the empty legacy tables).',
      'GET.days': 'Window in days from the query (default 30). Passed as a bound parameter.',
      'GET.studentAttendanceTrends': 'Per date and class: present, absent, marked, rate — learners only.',
      'GET.chronicAbsentees': 'Active learners with rate < 80 % or more than 5 absences in the window.',
      'GET.staffAttendanceSummary': 'Per active staff member: present/absent/total and rate. Not rendered by the page.',
      'GET.dailyOverview': 'Per date and role: present, absent, total (newest first).',
      'GET.attendancePerformanceCorrelation': 'Per learner: attendance rate and average result score (joins two one-to-many tables, so counts multiply). Not rendered by the page.',
      'GET.return#1': 'Success JSON with the five arrays — and none of the extra fields the component expects.',
    },
    [API_ENR]: {
      ...handlerPrelude,
      GET: 'Six queries describing enrolment, returned under `data`.',
      'GET.enrollmentByClass': 'Per class (active enrolments): active/inactive, male/female, average days since admission.',
      'GET.newAdmissions': 'Admissions per month over the last 12 months, by gender.',
      'GET.dropoutAnalysis': 'Per class over ALL enrolments (any status): learners now inactive, total, rate, average days from admission to `updated_at`.',
      'GET.retentionByYear': 'Per academic year of enrolment: distinct learners, how many are active now, retention %.',
      'GET.geographicDistribution': 'Top 20 district/county pairs of active learners (through village → parish → subcounty → county → district).',
      'GET.ageDistribution': 'Active learners in age bands from year of birth (Unknown when missing).',
      'GET.return#1': 'Success JSON.',
    },
  },

  ui: [
    { title: 'Header card', text: '"School Analytics Dashboard" with subtitle. While the Attendance tab is active: a window select (7 / 30 / 90 / 365 days). A Settings icon button that has no action.' },
    { title: 'Tab bar', text: 'Four buttons; the active one is tinted with its colour and a spring-animated background. Not keyboard-arrow navigable (plain buttons, no tablist roles).' },
    { title: 'Tab content', text: 'Only the active tab is mounted. Each shows its skeleton, then either an error line or its KPI cards, charts and lists (see each component\'s render note).' },
    { title: 'Footer card', text: 'Static description; lists capabilities that do not exist.' },
  ],

  interactions: [
    { action: 'Open the page', steps: [
      'middleware: session → continue.',
      'AnalyticsPage → DashboardAnalytics chunk loads ("Loading analytics…").',
      'Performance tab mounts → effect → fetch GET /api/analytics/student-performance.',
      'Handler: session → module check → 4 queries → JSON → setData → render.',
    ] },
    { action: 'Switch tab', steps: [
      'onClick → setActiveTab(id).',
      'The previous tab component unmounts (its data is lost), the new one mounts → its effect fetches → skeleton → content.',
    ] },
    { action: 'Change the attendance window', steps: [
      'onChange → setDateRange("N") → AttendanceAnalytics receives days=N.',
      'Its effect depends on `days` → loading=true (whole tab becomes the skeleton) → GET ?days=N → re-render.',
    ] },
  ],

  data: `Each API returns \`{ success: true, data: {…arrays} }\` or \`{ error }\` with 401/403/500. Rows are raw mysql2 rows: numeric aggregates often arrive as strings (DECIMAL), which is why the components call parseFloat/parseInt.

- performance: performanceTrends[], atRiskStudents[], topPerformers[], subjectPerformance[]
- finance: feeCollectionSummary[], paymentTrends[], outstandingBalances[], incomeExpenses[], walletBalances[]
- attendance: studentAttendanceTrends[], chronicAbsentees[], staffAttendanceSummary[], dailyOverview[], attendancePerformanceCorrelation[]
- enrollment: enrollmentByClass[], newAdmissions[], dropoutAnalysis[], retentionByYear[], geographicDistribution[], ageDistribution[]

Contract mismatches (current implementation): Attendance expects 5 fields never sent; Finance wallets expects method/net_balance, gets location_type/current_balance.`,

  states: `- **Loading**: each tab shows LoadingPlaceholder (full-screen-height skeleton).
- **Error**: "Error: <message>" in red — "Failed to fetch analytics" (500), "Module 'analytics' is not enabled for this school" (403), "Not authenticated" (401), "Network error occurred" (fetch/JSON failure). No retry button; switching tabs and back refetches.
- **Empty**: lists render nothing, charts render empty axes; Attendance always shows zeros/placeholders in the sections fed by missing fields.
- **Local SQLite mode**: page renders, every API fails (MySQL only) → error line.`,

  security: `- Tenant isolation: every query filters by the session school; the client-supplied \`school_id\` is ignored. Keep it that way — do not start reading it.
- Module gate: Analytics must be enabled for the school (checkModule) — enforced in each API, not on the page.
- **No permission check**: any signed-in staff member of the school can read fee balances per learner and wallet balances. If that is not intended, add requirePermission to /api/analytics/finance (e.g. a finance view permission).
- Read-only: nothing is written.
- Connection handling: the handlers must close their connection on every path — today they do not on errors.`,

  styling: `Tailwind classes; framer-motion animations; recharts sized by ResponsiveContainer inside fixed-height (h-64 / h-80) boxes. KPI cards are gradient tiles (white text). Grids: KPIs 1 → 4 columns (md), chart pairs 1 → 2 (lg). The Attendance tab uses a global \`card\` class rather than DashboardCard. All text is English (no i18n on this route). Dynamic class names in the tab bar (\`bg-\${color}-50\`) depend on the same classes appearing literally elsewhere.`,

  testing: `- **Existing tests**: none import these files.
- **Manual check**: enable the Analytics module for a test school, open /dashboard/analytics, visit each tab and change the attendance window; watch DevTools → Network for the four /api/analytics/* calls.
- **Debug a red error line**: open the failing request; the server log has "Error fetching <tab> analytics:" with the SQL error.
- **Connection leaks**: repeated failures on a tab exhaust the connection pool — watch for "Too many connections" in other routes after analytics errors.`,

  extend: [
    { change: 'Add a fifth tab', how: 'Add the id to `AnalyticsTab`, an entry to `tabs` (pick a colour whose classes already exist literally, or write the classes out in full), and a `case` in `renderActiveAnalytics`. Build the tab as its own component like the others (own state, fetch on mount, LoadingPlaceholder / error / empty), backed by a new GET handler under /api/analytics/ that uses getSessionSchoolId + checkModule(\'analytics\') and closes its connection in `finally`. If the tab should survive reloads, move activeTab into the URL (`?tab=`) with useSearchParams.' },
    { change: 'Make the attendance cards real', how: 'Either compute classAttendanceTrends / best / worst / monthlyAverage in the attendance API (it already has studentAttendanceTrends to aggregate) and add an attendance goal setting, or remove those sections. Replace `avgAttendanceRate` with `averageAttendance` for the "Average Attendance" card, and compute the trend per role with the list in chronological order.' },
    { change: 'Fix the wallet card', how: 'In FinanceAnalytics, read `wallet.location_type` and `wallet.current_balance` (the API\'s actual field names).' },
    { change: 'Close connections on errors', how: 'In each handler: `let connection; try { connection = await getConnection(); … } catch … finally { await connection?.end().catch(() => {}); }` — the pattern GET /api/dashboard/overview already uses.' },
    { change: 'Add a term filter', how: 'The Performance and Finance components and APIs already accept termId; add a term `<select>` in DashboardAnalytics (load terms from /api/terms), hold it in state and pass it as `termId`. The page currently passes undefined.' },
  ],
};

export default doc;
