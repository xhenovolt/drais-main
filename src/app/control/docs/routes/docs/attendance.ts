import type { RouteDoc } from '@/lib/devdocs/route-doc';

const PAGE = 'src/app/attendance/page.tsx';
const BREAKDOWN = 'src/components/attendance/AttendanceBreakdown.tsx';
const STRIP = 'src/components/attendance/IntelligenceStrip.tsx';
const API_STREAM = 'src/app/api/attendance/stream/route.ts';
const API_DASH = 'src/app/api/attendance/zk/dashboard/route.ts';
const API_SUMMARY = 'src/app/api/attendance/intelligence-summary/route.ts';
const API_BREAKDOWN = 'src/app/api/attendance/breakdown/route.ts';

const doc: RouteDoc = {
  route: '/attendance',
  reviewed: {
    [PAGE]: 'd12f9eb7e111', [BREAKDOWN]: '1ed499a804cc', [API_STREAM]: 'd38653b98094',
    [API_DASH]: '57f9b9bc1c1a', [API_SUMMARY]: 'c0d37c77883d', [API_BREAKDOWN]: '5f6d64eb5fa2',
  },

  identity: {
    purpose: 'The attendance operations dashboard ("Attendance → Dashboard" in the sidebar): today\'s or a chosen day\'s learner/staff counts, a day-scholar/boarding × gender breakdown with a reconciliation check, punch and device statistics, an hourly punch chart, a live feed of punches as they arrive (server-sent events), the last 20 punches, and the device list.',
    users: 'Every signed-in school user can open the page. The breakdown card additionally requires attendance.view / attendance.record.view (or an admin role) and the attendance module — without them that card hides.',
    permissions: 'Page: session (middleware). GET /api/attendance/zk/dashboard, /stream, /intelligence-summary: session only. GET /api/attendance/breakdown: session + attendance module + attendance.view | attendance.record.view | admin role.',
    upstream: 'Attendance devices (punches → attendance_raw_events and the legacy zk_attendance_logs), the attendance engine (attendance_records verdicts → dashboard counts), the in-process event bus (attendance.event.recorded), device heartbeats (devices.last_seen), zk_device_commands, the boarding policy.',
    downstream: 'Links to /attendance/devices, /attendance/devices/commands, /attendance/logs, /attendance/identity-matching, /attendance/device-logs, and (strip) the attendance intelligence pages. Read-only.',
  },

  files: [
    { path: PAGE, role: 'Route entry. Date picker, the dashboard request, the live-feed hook, and all cards except the strip and the breakdown.', shared: false },
    { path: STRIP, role: 'Attendance-intelligence tiles — explained on the /dashboard document (same component).', shared: true },
    { path: BREAKDOWN, role: 'Residence × gender breakdown card for the chosen date, with the server\'s reconciliation verdict.', shared: false },
    { path: API_DASH, role: 'GET /api/attendance/zk/dashboard — every number on the page except the breakdown and the strip.', shared: false },
    { path: API_STREAM, role: 'GET /api/attendance/stream — the live feed (Server-Sent Events).', shared: false },
    { path: API_SUMMARY, role: 'GET /api/attendance/intelligence-summary — the strip\'s data (also used by /dashboard).', shared: true },
    { path: API_BREAKDOWN, role: 'GET /api/attendance/breakdown — the breakdown card\'s data.', shared: false },
  ],

  layout: `- **src/middleware.ts** — session cookie or redirect to /login.
- **src/app/layout.tsx** → AuthenticatedShell (global SWRConfig whose fetcher is \`swrFetcher\` from src/lib/apiClient.ts: it **shows an error toast on any failed request** and throws; no error retry) → MainLayout (sidebar).
- **src/app/attendance/layout.tsx** — only paints the slate/blue/indigo gradient background behind every /attendance/* page; no logic.

The page itself contributes everything inside its container. The dashboard useSWR call passes no fetcher, so it uses the shell's \`swrFetcher\`; AttendanceBreakdown and IntelligenceStrip pass their own plain fetchers (no toast on failure).`,

  tree: `AttendanceDashboard                         src/app/attendance/page.tsx
  ├─ header: title · <input type=date> (date state)
  ├─ IntelligenceStrip                       own fetch /api/attendance/intelligence-summary (5 min)
  ├─ AttendanceBreakdown(date)               own fetch /api/attendance/breakdown?date= (30 s)
  │    ├─ Group ×2 (day scholars, boarding) ── Line ×n
  │    └─ per gender ×2–3 ── day / boarding cells ── Line ×n
  ├─ MetricCard ×7  (learners total/present/late/absent, staff present, punches, unmatched)
  ├─ devices card · commands card · quick links
  ├─ hourly bar chart (24 divs)               only when hourly data exists
  ├─ live feed (collapsible)                   useLiveFeed → EventSource /api/attendance/stream
  ├─ recent punches table (last 20)
  └─ device list                              only when devices exist
  data for MetricCards/devices/commands/hourly/punches/device list:
       useSWR /api/attendance/zk/dashboard?date= (15 s)`,

  notes: {
    [PAGE]: {
      'import:react': '`useState`, `useEffect`, `useRef` for the date, the feed toggle and the live-feed hook.',
      'import:@/lib/datetime/local-date': '`toLocalDateStr()` — today as YYYY-MM-DD in the BROWSER\'s timezone (the initial value of the date picker).',
      'import:lucide-react': 'Icons.',
      'import:swr': 'The dashboard request (refreshes every 15 s).',
      'import:next/link': 'Links to devices, commands, logs, identity matching, device logs.',
      'import:@/components/i18n/I18nProvider': '`useI18n()` — `t`, `lang`, `formatDate` (Arabic clock formatting).',
      'import:@/lib/i18n/format': '`localizeDigitsInText` — converts digits inside a mixed string, leaving words that contain letters (like serial numbers) untouched.',
      'import:@/components/attendance/IntelligenceStrip': 'The intelligence tiles.',
      'import:@/components/attendance/AttendanceBreakdown': 'The residence × gender breakdown card.',
      arText: 'For Arabic: localise digits in a value and turn % into ٪; returns the value unchanged otherwise. Used through the `A()` wrapper and in MetricCard.',
      verifyLabel: 'Maps a device verify type (0 password, 1 fingerprint, 2 card, 15 face) to an English label. **Not used** — the table uses translation keys `attendancePages.dash.verify.<n>` instead. Dead code.',
      'verifyLabel.map': 'The verify-type table.',
      'verifyLabel.return#1': 'Label, "Type N", or "—".',
      DERIVED_LABEL: 'English fallback labels for the attendance engine\'s derived event codes (ARRIVED, ARRIVED_LATE, TEMP_EXIT, …) — used only when no translation exists.',
      DERIVED_CLASS: 'Badge colours per derived event code.',
      ioLabel: 'Device IN/OUT mode → label. **Not used** (the table shows the derived event, deliberately not the device\'s IN/OUT field). Dead code.',
      'ioLabel.map': 'The io-mode table.',
      'ioLabel.return#1': 'Label, "Mode N", or "—".',
      useLiveFeed: 'Custom hook (page-local): opens one EventSource to /api/attendance/stream and keeps the newest 30 events plus a connected flag.',
      'useLiveFeed.[events, setEvents]': 'Newest-first list of pushed punches, capped at 30.',
      'useLiveFeed.[connected, setConnected]': 'True after `onopen`, false after `onerror` (the browser reconnects SSE automatically, and onopen sets it true again).',
      'useLiveFeed.esRef': 'Holds the EventSource; only written, never read elsewhere.',
      'useLiveFeed.effect#1': 'Empty dependency array → runs once on mount: create the EventSource, wire onopen/onmessage/onerror (onmessage parses JSON and prepends the event; bad JSON is ignored), and on unmount close it. Because the deps are empty the feed does not follow the date picker — it is always "now".',
      'useLiveFeed.return#1': '`{ events, connected }`.',
      AttendanceDashboard: 'The route component (default export).',
      'AttendanceDashboard.{ t, lang, formatDate }': 'Translation and formatting.',
      'AttendanceDashboard.A': 'Shorthand for arText with the current language.',
      'AttendanceDashboard.clock': 'Formats a timestamp as HH:MM:SS — via formatDate in Arabic, the browser\'s toLocaleTimeString otherwise. Display uses the browser timezone.',
      'AttendanceDashboard.today': 'Browser-local today.',
      'AttendanceDashboard.[date, setDate]': 'Selected day (YYYY-MM-DD), from the date input. Changing it changes the dashboard and breakdown SWR keys → both refetch.',
      'AttendanceDashboard.[liveFeedOpen, setLiveFeedOpen]': 'Whether the live feed list is expanded (the SSE connection stays open either way).',
      'AttendanceDashboard.{ data, isLoading }': 'useSWR on `/api/attendance/zk/dashboard?date=…`, every 15 s, global fetcher (toast on failure).',
      'AttendanceDashboard.{ events: liveEvents, connected: sseConnected }': 'Live feed state from useLiveFeed.',
      'AttendanceDashboard.dashboard': '`data.data` or {} — every section below tolerates the empty object.',
      'AttendanceDashboard.deviceStats': 'online / offline / total / maintenance device counts.',
      'AttendanceDashboard.studentStats': 'Learner total, present, late, absent, rate.',
      'AttendanceDashboard.staffStats': 'Staff total, present, late, absent, rate.',
      'AttendanceDashboard.punchStats': 'Punch totals for the day.',
      'AttendanceDashboard.commandStats': 'Pending / sent / failed device commands (not date-filtered).',
      'AttendanceDashboard.hourly': 'Per-hour punch counts.',
      'AttendanceDashboard.recentPunches': 'Last 20 punches (not date-filtered — always the latest).',
      'AttendanceDashboard.deviceList': 'Registered devices with connection status.',
      'AttendanceDashboard.totalPunches': 'Number(punchStats.total_punches) (SUM/COUNT arrive as strings from MySQL).',
      'AttendanceDashboard.matchedPunches': 'Punches matched to a person.',
      'AttendanceDashboard.unmatchedPunches': 'Punches not matched — drives the amber "Needs mapping" card.',
      'AttendanceDashboard.render#1': 'In order: header with date input; IntelligenceStrip; AttendanceBreakdown(date); 7 MetricCards (2 columns, 5 on large screens); devices / commands / quick-links cards; the hourly chart (24 flex bars, height = punches ÷ busiest hour, minimum 4 % so small hours stay visible, labels every 3 hours); the live feed (toggle button with a pulsing radio icon and "Connected/Reconnecting"; list of events: time, name or "UID n", Learner/Staff/Unmatched badge, device name); the recent-punches table (time, person or UID, device UID, verify type, derived event badge or "Scan", matched/unmatched) with Loading / empty rows; the device grid. Note "Manage →" on the device grid is hard-coded English.',
      MetricCard: 'One statistic tile: label, big value, optional sub-line, icon on a tinted square; amber border and text when `alert`.',
      'MetricCard.{ lang }': 'Language for digit conversion.',
      'MetricCard.bgMap': 'Icon background per colour name — written out in full so Tailwind generates every class.',
      'MetricCard.render#1': 'The tile. Values pass through arText, so numbers and percentages render in Arabic-Indic digits in Arabic.',
    },

    [BREAKDOWN]: {
      'import:react': 'JSX.',
      'import:swr': 'Fetches the breakdown.',
      'import:lucide-react': 'Reconciliation icons.',
      'import:@/components/i18n/I18nProvider': '`t`, `lang`, `formatNumber`, `formatPercent`.',
      fetcher: 'Plain fetch → JSON, no status check, no toast.',
      Stats: 'One cell of the breakdown: total, present, late, absent, awaiting, reported/notReported (boarding reported-once mode), policy and other buckets, presentToday.',
      Data: 'The response: date, boardingMode (DAILY_PUNCH | REPORTED_ONCE), reportingPeriod, overall, residence (day/boarding), gender (female/male/unknown), cells (gender × residence), reconciliation { ok, issues[] }.',
      pct: 'n / d as a rounded percentage string, "—" when d is 0.',
      useCount: 'Custom hook returning a number formatter in the interface language (browser grouping in English, Arabic-Indic digits in Arabic).',
      'useCount.{ lang, formatNumber }': 'From useI18n.',
      'useCount.return#1': 'The formatter function.',
      Line: 'One labelled count row, coloured by tone (good green, bad red, warn amber, muted grey).',
      'Line.count': 'Number formatter.',
      'Line.c': 'Colour class for the tone.',
      'Line.render#1': 'Label left, count right.',
      Group: 'A residence card (day scholars or boarding). In reported-once boarding mode it shows Reported / Not reported yet / Punched today; otherwise Present, Late (only if any), Absent, Not yet recorded, Other (only if any).',
      'Group.{ t }': 'Translator.',
      'Group.count': 'Number formatter.',
      'Group.render#1': 'Card with title and learner count, then the lines for the mode.',
      AttendanceBreakdown: 'The breakdown section for `date`.',
      'AttendanceBreakdown.{ t, lang, formatPercent }': 'Translation and formatting.',
      'AttendanceBreakdown.count': 'Number formatter.',
      'AttendanceBreakdown.percent': 'Percentage in the interface language.',
      'AttendanceBreakdown.{ data, isLoading, error }': 'useSWR on `/api/attendance/breakdown?date=…`, every 30 s and on focus.',
      'AttendanceBreakdown.guard#1': 'Loading → a pulsing empty card.',
      'AttendanceBreakdown.guard#2': 'Error or no success (including 403 for users without attendance.view, or the module disabled) → render nothing.',
      'AttendanceBreakdown.reportedOnce': 'Boarding mode is REPORTED_ONCE — boarders are counted as "reported for the term" rather than present per day.',
      'AttendanceBreakdown.boardingCount': 'Number of boarders; 0 shows the "no boarders on record" hint.',
      'AttendanceBreakdown.gender': 'The three gender keys with translated labels (unknown is hidden when empty).',
      'AttendanceBreakdown.render#1': 'Header (title, summary line with overall count and present %, the boarding policy sentence), the reconciliation badge (green "reconciles" or red "N mismatches" + the issue list from the server), the no-boarders hint, the two residence Groups, and one card per gender containing boarding and day cells.',
    },

    [API_DASH]: {
      'import:next/server': 'Request/response helpers.',
      'import:@/lib/datetime/local-date': '`schoolLocalToday()` — default date when none is given.',
      'import:@/lib/db': '`query()` — pooled MySQL/TiDB queries (MySQL only; fails in local-SQLite mode).',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      'import:@/lib/attendance/dashboard-counts': '`getDashboardAttendanceCounts(school, date)` — present/late/absent per role from attendance_records (same source as /dashboard).',
      'import:@/lib/attendance/device-clock': '`resolveTimePolicy(school)` — the school\'s UTC offset in minutes, used to turn a local day into UTC instants.',
      utcBoundary: 'Local midnight of `date` (+ plusDays) as a UTC "YYYY-MM-DD HH:MM:SS" string — punch_at is stored in UTC.',
      'utcBoundary.ms': 'Midnight UTC of the date, minus the school offset, plus days.',
      'utcBoundary.return#1': 'Formatted UTC instant.',
      runtime: 'Node.js runtime (database driver).',
      GET: 'Authenticates, then runs nine queries in sequence and returns the dashboard object.',
      'GET.session': 'Session.',
      'GET.guard#1': 'No session → 401.',
      'GET.{ schoolId }': 'School from the session.',
      'GET.url': 'Request URL.',
      'GET.date': '`?date=` or the school\'s today. Not validated — a malformed value makes Date.parse return NaN and the boundary query fails (500).',
      'GET.deviceStats': 'This school\'s devices: total; online = active and seen in the last 5 minutes; offline = active and not seen for 5 minutes; maintenance.',
      'GET.studentCount': 'Active, not deleted learners — fallback population only.',
      'GET.staffCount': 'Active staff — fallback only.',
      'GET.policy': 'Time policy for the school.',
      'GET.offsetMin': 'UTC offset in minutes.',
      'GET.dayStart': 'UTC instant of local midnight.',
      'GET.dayEnd': 'UTC instant of the next local midnight.',
      'GET.punchStats': 'From attendance_raw_events for the local day: total, matched, unmatched, per-role matched punches, unique people present per role, unique device users.',
      'GET.commandStats': 'Device commands pending / sent / failed — all time, not the chosen date.',
      'GET.hourlyData': 'Punches per school-local hour of the day, with check-in / check-out counts (grouped by alias for TiDB\'s only_full_group_by).',
      'GET.recentPunches': 'The 20 newest punches of the school (ignores `date`), with names from people by role, device name, and the name stored on the device when unmatched.',
      'GET.devices': 'Device list with connection status: online < 2 min, delayed < 5 min, offline otherwise. (Note the thresholds differ from deviceStats — a "delayed" device is counted online in deviceStats.)',
      'GET.punch': 'First row of punchStats.',
      'GET.counts': 'The authoritative per-role attendance numbers for `date`.',
      'GET.totalStudents': 'Learner population: counts, else the fallback count.',
      'GET.totalStaff': 'Staff population likewise.',
      'GET.return#1': '`{ success, data: { date, devices, students{total,present,late,absent,rate}, staff{…}, punches, commands, hourly, recentPunches, deviceList } }` — rate is present ÷ total, where present/late/absent are whatever getDashboardAttendanceCounts returns ([unverified] whether a late learner is also counted in `present` — read src/lib/attendance/dashboard-counts.ts before relying on present + late + absent = total).',
      'GET.catch#1': 'Logged; 500 `{ error: "Failed to load dashboard data" }` → the global fetcher toasts it.',
    },

    [API_STREAM]: {
      'import:next/server': '`NextRequest` (the response is a plain web `Response` with a stream body).',
      'import:@/lib/auth': '`getSessionSchoolId` — the stream is per school.',
      'import:@/lib/db': '`query()` for the enrichment query.',
      'import:@/lib/events/eventbus': '`getEventBus()` — in-process publish/subscribe; the device handler publishes `attendance.event.recorded` when a punch is saved.',
      'import:@/lib/attendance/export/AttendanceFormatter': 'School-specific formatting (time zone, language) for the presentation model.',
      'import:@/lib/i18n/localize': '`langFromRequest(req)` — the viewer\'s language from the request.',
      'import:@/lib/attendance/export/AttendancePresentationModel': 'Builds the display-ready `presentation` object sent with each event (used by the logs page; this dashboard ignores it).',
      runtime: 'Node.js runtime (long-lived stream, database).',
      dynamic: '`force-dynamic` — never cached or prerendered.',
      GET: 'Opens a Server-Sent Events stream for the session\'s school.',
      'GET.session': 'Session.',
      'GET.guard#1': 'No session → plain-text 401 (EventSource then retries and keeps failing — the page shows "Reconnecting...").',
      'GET.schoolId': 'School from the session — every query below filters by it (the header comment records the earlier cross-school leak this fixed).',
      'GET.formatter': 'Formatter for this school and language.',
      'GET.encoder': 'Turns strings into bytes for the stream.',
      'GET.closed': 'Set when the client disconnects or a write fails; every send checks it.',
      'GET.stream': 'The ReadableStream. Its `start` callback: (1) writes ": connected"; (2) defines `send` (writes `data: <json>\\n\\n`), and `fetchAndSend(sinceId)` — one school-scoped query of up to 30 zk_attendance_logs rows newer than sinceId, joined to raw events (derived event), learner/staff names, device names, the device directory name, the learner\'s class (correlated subquery picking one active enrolment) and today\'s SMS status; each row not already pushed (a Set of ids, cleared at 500) is turned into `{ id, device_user_id, check_time, person_name, person_type (student|staff|unmatched), class_name, matched, verify_type, io_mode, derived_event, derived_detail, device_name, device_known_name, photo_url, sms_status, presentation }` and sent; (3) sets the starting point to the newest existing scan id so history is not replayed; (4) subscribes to `attendance.event.recorded` for this school and fetches just that scan (sinceId = scanId − 1) — instant delivery when the punch lands on the same server instance; (5) every 10 s polls from the last id (catches events from other instances) and writes a ": heartbeat" comment so proxies keep the connection open; (6) on client abort: stops the poll, unsubscribes, closes the stream.',
      'GET.return#1': 'The streaming Response with SSE headers (text/event-stream, no-cache, keep-alive, X-Accel-Buffering: no so nginx does not buffer).',
    },

    [API_SUMMARY]: {
      'import:next/server': 'Request/response.',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      runtime: 'Node.js.',
      GET: 'Six independent roll-ups in parallel; each failure degrades to null instead of failing the response.',
      'GET.session': 'Session.',
      'GET.guard#1': 'No session → 401.',
      'GET.{ schoolId }': 'School from the session.',
      'GET.safe': 'Runs a function and returns a fallback if it throws — the reason a broken layer shows "—" in the strip rather than an error.',
      'GET.[health, clock, gaps, people, identity, devices]': 'Promise.all of: health (runHealthChecks → score, status, first recommendation); clock (sweepToday → number of devices with anomalous time, worst confidence); gaps (detectGaps → gaps and watch counts); people (last 30 days of STAFF attendance_records → profilePerson per person → watch-list and roster-review counts); identity (people enrolled more than once on biometrics, plus distinct unmatched device users in the last 7 days); devices (device reputations → fleet average, number in "poor" band, count). Each module is imported dynamically so its code loads only when this route runs.',
      'GET.return#1': '`{ success, health, clock, gaps, people, identity, devices }` — the shape IntelligenceStrip reads.',
    },

    [API_BREAKDOWN]: {
      'import:next/server': 'Request/response.',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      'import:@/lib/auth/requireModule': '`checkModule(school, "attendance")`.',
      'import:@/lib/rbac/fallback': '`canAny(user, permissions, fallbackRoles)` — permission check with a role fallback for schools whose roles predate the permission catalogue.',
      'import:@/lib/attendance/device-clock': '`resolveTimePolicy` — school offset.',
      'import:@/lib/attendance/lessons/engine': '`localDateOf(ms, offset)` — today in the school\'s timezone.',
      'import:@/lib/attendance/boarding-policy': '`getBoardingPolicy`, `modeForDate`, `getPeriodFor` — whether boarders are counted daily or once per reporting period.',
      'import:@/lib/attendance/breakdown': '`loadBreakdownRows` (one aggregated query) and `buildBreakdown` (pure aggregation + reconciliation, unit-tested in src/lib/attendance/__tests__/breakdown.test.mjs).',
      runtime: 'Node.js.',
      GET: 'Authorises, resolves the day and boarding mode, loads rows, builds the breakdown.',
      'GET.s': 'Session.',
      'GET.guard#1': 'No session → 401.',
      'GET.denied': 'Module check result.',
      'GET.guard#2': 'Attendance module disabled → 403.',
      'GET.base': 'The user identity for the permission check.',
      'GET.guard#3': 'Needs attendance.view or attendance.record.view (or an admin role) → else 403 "Not allowed".',
      'GET.tp': 'Time policy.',
      'GET.q': 'Raw `?date=`.',
      'GET.date': 'The date if it is YYYY-MM-DD, else the school\'s today — validated, unlike the zk/dashboard route.',
      'GET.classId': 'Optional class filter (not used by this page).',
      'GET.policy': 'The school\'s boarding policy.',
      'GET.mode': 'DAILY_PUNCH or REPORTED_ONCE for this date.',
      'GET.period': 'The reporting period (key + label) in REPORTED_ONCE mode.',
      'GET.rows': 'Aggregated rows for the date / period / class.',
      'GET.breakdown': 'The full breakdown with reconciliation.',
      'GET.guard#4': 'A failed reconciliation is logged as a warning on the server (the numbers are still returned and the card shows the mismatch).',
      'GET.return#1': '`{ success, ...breakdown }`.',
    },
  },

  ui: [
    { title: 'Header and date', text: 'Title "Attendance — Dashboard", subtitle, and a native date input. The date drives the dashboard numbers and the breakdown; the live feed, recent punches and command counts are always current.' },
    { title: 'Intelligence strip', text: 'Six tiles (see the /dashboard document).' },
    { title: 'Breakdown', text: 'Day scholars and Boarding cards, then Girls / Boys / Not recorded with day and boarding cells; a green "reconciles" badge or a red mismatch list. Hidden for users without attendance view permission.' },
    { title: 'Metric cards', text: 'Total learners, learners present (with rate, or "No data yet" when there are no punches), late, absent ("of N"), staff present (rate), total punches (N matched), unmatched (amber "Needs mapping" when > 0).' },
    { title: 'Devices, commands, quick links', text: 'Online / offline / total devices; pending and failed commands; links to logs, identity matching and the raw pipeline.' },
    { title: 'Hourly chart', text: 'Only when the day has punches. 24 bars, labelled every 3 hours.' },
    { title: 'Live feed', text: 'Collapsible; radio icon pulses green when connected. Shows up to 30 punches as they arrive.' },
    { title: 'Recent punches', text: 'The 20 latest punches with a derived-event badge ("Arrived", "Late arrival", …) once the engine has evaluated them (about a second after the scan), "Scan" before that.' },
    { title: 'Device list', text: 'One tile per device, green online / red otherwise.' },
  ],

  interactions: [
    { action: 'Open the page', steps: [
      'middleware session check → AuthenticatedShell → page mounts.',
      'useSWR GET /api/attendance/zk/dashboard?date=<browser today> (swrFetcher).',
      'useLiveFeed opens EventSource /api/attendance/stream → server writes ": connected" → onopen → "Connected".',
      'AttendanceBreakdown GET /api/attendance/breakdown?date= ; IntelligenceStrip GET /api/attendance/intelligence-summary.',
      'Handlers authenticate from the session, query MySQL/TiDB, return JSON → cards render.',
    ] },
    { action: 'A learner scans a finger on a device', steps: [
      'Device → /iclock (ADMS) → punch saved (zk_attendance_logs + attendance_raw_events) → event bus publishes attendance.event.recorded {schoolId, scanId}.',
      'Stream subscription (same server instance) → fetchAndSend(scanId − 1) → enriched row → `data:` message.',
      'Browser onmessage → setEvents([event, …]) → the feed shows the new line. On another instance the 10 s poll delivers it instead.',
      'Within 15 s the dashboard poll refreshes counts and the recent-punches table (derived event filled in by then).',
    ] },
    { action: 'Pick another date', steps: [
      'onChange → setDate(d) → dashboard and breakdown SWR keys change → both fetch for d.',
      'Counts, hourly chart and breakdown change; live feed, recent punches and commands do not (they ignore the date).',
    ] },
    { action: 'Collapse the live feed', steps: ['setLiveFeedOpen(false) hides the list; the SSE connection and event collection continue.'] },
  ],

  data: `**GET /api/attendance/zk/dashboard?date=** → \`{ success, data }\`:
- devices { total_devices, online_devices, offline_devices, maintenance_devices } (strings from SUM — the page wraps them in Number())
- students / staff { total, present, late, absent, rate|null }
- punches { total_punches, matched_punches, unmatched_punches, student_punches, staff_punches, unique_students_present, unique_staff_present, unique_users }
- commands { total_pending, sent, failed }
- hourly [{ hour, punches, check_ins, check_outs }]
- recentPunches [{ id, device_sn, device_user_id, check_time (UTC), verify_type, io_mode, matched, student_id, staff_id, device_name, location, student_/staff_first_name/last_name, device_known_name }]
- deviceList [{ id, serial_number, device_name, location, ip_address, status, last_heartbeat, last_activity, connection_status: online|delayed|offline }]

**Stream events** — see the GET.stream note. **Breakdown** — see the Data interface in AttendanceBreakdown. **Intelligence summary** — see the /dashboard document.

Note: recentPunches has no derived_event column, so the table's derived-event badge is always "Scan" on this page (derived_event comes only through the stream). [defect]

Tables: devices, students, staff, attendance_raw_events, zk_device_commands, people, device_user_directory, attendance_records (via dashboard-counts), zk_attendance_logs and notification_outbox (stream), biometric_enrollments (summary).`,

  states: `- **Loading**: metric values show "—"/0 until data arrives; recent punches shows "Loading..."; breakdown shows a pulsing card; strip shows "—".
- **Empty day**: "No data yet" under learners present; hourly chart hidden; "No attendance data yet. Punches will appear here…" in the table; "Waiting for new attendance events..." in the feed.
- **Dashboard API fails**: the global fetcher shows an error toast (on each 15 s refresh that fails [unverified] whether SWR keeps polling after an error with retries disabled) and the cards keep their last data or empty values.
- **Stream fails / signed out**: "Reconnecting..." with a red dot; the browser retries automatically.
- **No permission for the breakdown**: the card is absent (no message).
- **Local SQLite mode**: /attendance is not in OFFLINE_SAFE_PREFIXES, so the shell shows the offline-unavailable notice instead of this page.`,

  security: `- Every query is scoped by the session's school: dashboard, stream (enrichment, starting id, bus events filtered by schoolId), summary, breakdown.
- The breakdown is the only part with a permission check; the dashboard numbers, names in recent punches, and the live feed are visible to any signed-in user of the school. Adding personal data to the stream or the dashboard response exposes it to every staff role.
- Read-only route.
- The stream keeps a database poll per open tab every 10 s; many open dashboards multiply that load.`,

  styling: `Gradient page background from src/app/attendance/layout.tsx; the page itself repeats the same gradient on its root div. Cards are white / slate-800 with gray borders. Grids: metric cards 2 → 5 columns (lg), device/command/links 1 → 3 (lg), device list 1 → 2 (md) → 3 (xl). The hourly chart is pure divs (no chart library). RTL: \`text-start\`, \`ms-*\` logical spacing, digits via arText/useCount. Status colours are paired with text labels.`,

  testing: `- **Existing tests**: src/lib/attendance/__tests__/breakdown.test.mjs (buildBreakdown aggregation and reconciliation), boarding-policy.test.mjs, gender.test.mjs, device-clock.test.mjs; the dashboard route and page have no tests.
- **Live feed debugging**: DevTools → Network → /api/attendance/stream → EventStream tab shows each message; no messages but punches arriving = check the event bus publish in the device handler and the 10 s poll (server log "[SSE poll]").
- **Wrong counts**: compare with /attendance/logs for the same date; the counts come from getDashboardAttendanceCounts (attendance_records), not from raw punches.
- **Run**: \`npm run test:attendance\`.`,

  extend: [
    { change: 'Add a metric card', how: 'Compute the value in GET /api/attendance/zk/dashboard (school-scoped, local-day boundaries via dayStart/dayEnd), add it to the response, and render another `<MetricCard>` in the grid (the grid is 5 columns on large screens — a 6th card wraps). Add translation keys `attendanceDash.*` in English and Arabic.' },
    { change: 'Show the derived event in Recent Punches', how: 'Add `ar.derived_event, ar.derived_detail` to the recentPunches SELECT (they live on attendance_raw_events, which the query already reads). The table already renders them.' },
    { change: 'Make the live feed follow the selected date', how: 'Not meaningful — the feed is live by design. To show a past day, link to /attendance/logs?date= instead.' },
    { change: 'Restrict the page to attendance staff', how: 'Add a permission check (requirePermission / canAny with attendance.view) to GET /api/attendance/zk/dashboard and /stream, as the breakdown route does. Hiding the sidebar link is not protection.' },
  ],
};

export default doc;
