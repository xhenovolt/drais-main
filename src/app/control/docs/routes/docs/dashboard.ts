import type { RouteDoc } from '@/lib/devdocs/route-doc';

const PAGE = 'src/app/dashboard/page.tsx';
const KPIS = 'src/components/dashboard/DashboardKPIs.tsx';
const CLOCK = 'src/components/attendance/ClockHealthBadges.tsx';
const STRIP = 'src/components/attendance/IntelligenceStrip.tsx';
const SMS = 'src/components/dashboard/SmsBalanceCard.tsx';
const DEVICES = 'src/components/dashboard/DeviceStatusWidget.tsx';
const INSIGHTS = 'src/components/dashboard/AttendanceInsights.tsx';
const FETCHER = 'src/utils/fetcher.ts';
const API = 'src/app/api/dashboard/overview/route.ts';

const doc: RouteDoc = {
  route: '/dashboard',
  reviewed: {
    [PAGE]: '449be3a561dc', [KPIS]: '4d29586f784f', [CLOCK]: '3d94e4050175', [STRIP]: 'c00c857dd2a1',
    [SMS]: '74568b2a716a', [DEVICES]: '3276dc44d1b7', [INSIGHTS]: 'c3a9e0a61dc9', [FETCHER]: '38a5bc80b4c6', [API]: '62131237cf05',
  },

  identity: {
    purpose: 'The first screen after sign-in ("Overview" in the sidebar). One glance at today: staff and learner attendance, device clock trust, the attendance-intelligence summary, attendance insights over a chosen window, intelligence signals, SMS balance and device status — each linking to the page that owns it.',
    users: 'Every signed-in school user. Nothing on the page is hidden by role; each card shows whatever its API returns for the user.',
    permissions: 'No permission code is checked by the page or by `GET /api/dashboard/overview` — only a valid session (`getSessionSchoolId`). Each card\'s own API applies its own rules; a card whose API refuses simply shows its empty/hidden state.',
    upstream: 'Sign-in (AuthContext supplies `user.schoolId`), the attendance engine (attendance_records verdicts behind the counts), device heartbeats, the SMS usage ledger, the intelligence APIs.',
    downstream: 'Nothing writes from this page. Every card is a link into its owning page: /intelligence (tabs risk, classes, patterns, subjects, trends, attendance), /students/list, /attendance/* (health, profiles, recovery, time-health, identity-intelligence, device-intelligence, trends, trace, founder-independence), /admin/sms/buy, /admin/communications, /attendance/devices/monitor.',
  },

  files: [
    { path: PAGE, role: 'Route entry point. Owns the page frame, the overview fetch, and three page-local components (SignalCard, IntelligenceSummary, AttendanceInsightCard).', shared: false },
    { path: KPIS, role: 'Top row: role-labelled attendance cards (staff, learners) and the non-attendance KPI tiles, from the overview response.', shared: false },
    { path: CLOCK, role: 'One chip per attendance device showing how far its clock can be trusted. Also used on /attendance/logs.', shared: true },
    { path: STRIP, role: 'Six-tile summary of the attendance-intelligence layers with links. Also used on /attendance.', shared: true },
    { path: INSIGHTS, role: 'Attendance distribution donut and most-absent / most-late / best lists per role, with a 7/14/30/90-day selector. Loaded client-only (recharts).', shared: false },
    { path: SMS, role: 'SMS units left, from the usage ledger, with buy/send links.', shared: false },
    { path: DEVICES, role: 'Total / online / offline device counts.', shared: false },
    { path: FETCHER, role: 'The fetch wrapper this page passes to useSWR: parses the JSON body even on failure and throws the API\'s own error message.', shared: true },
    { path: API, role: 'GET /api/dashboard/overview — the one request the page itself makes. Builds `kpis` and `attendance` (the only parts the page reads) plus many other blocks it does not.', shared: false },
  ],

  layout: `Only the root layout wraps this route (there is no src/app/dashboard/layout.tsx):

- **src/middleware.ts** — no session cookie → redirect to /login before anything renders.
- **src/app/layout.tsx** — providers (React Query, progress, Auth, Theme, I18n). \`LayoutContent\` sees \`/dashboard\` is not a bare route and wraps it in **AuthenticatedShell**: toasts, the global \`SWRConfig\` (fetcher \`swrFetcher\`, no focus revalidation, no error retry), the error boundary, and **MainLayout** (sidebar + top bar). \`/dashboard\` is in OFFLINE_SAFE_PREFIXES, so it also renders in offline mode.
- **src/app/loading.tsx** — shown by Next.js while the route's JavaScript loads.

Inherited, not implemented here: authentication redirect, sidebar/top bar, theme, language, toasts, the error boundary. Implemented here: everything inside the page frame.

Note: the page passes its own fetcher (src/utils/fetcher.ts) to its useSWR calls, which overrides the shell's \`swrFetcher\` for those calls only; the global options (no error retry) still apply.`,

  tree: `DashboardPage                              src/app/dashboard/page.tsx
  ├─ top bar: title · Intelligence link · Students link
  ├─ DashboardKPIs        (data = overview.kpis, attendance = overview.attendance)
  │    ├─ RoleAttendanceCard ×2 (staff, learners) ── StatusDonut
  │    └─ KPI tiles (Total Students, Fee Defaulters; + 2 learner tiles only without role data)
  ├─ ClockHealthBadges     own fetch: /api/attendance/time-health?banner=1
  ├─ IntelligenceStrip     own fetch: /api/attendance/intelligence-summary
  ├─ AttendanceInsights    dynamic, client-only; own fetch: /api/attendance/insights?days=N
  │    └─ RolePanel ×2 ── DistributionDonut · ResidenceSplit · TopList ×3
  ├─ grid
  │   ├─ IntelligenceSummary    own fetch: /api/intelligence/overview ── SignalCard ×≤6
  │   ├─ AttendanceInsightCard  own fetch: /api/intelligence/attendance-overview
  │   ├─ SmsBalanceCard         own fetch: /api/sms/quota
  │   └─ DeviceStatusWidget     own fetch: /api/devices/summary
  └─ quick links ×6 → /intelligence?tab=…`,

  notes: {
    [PAGE]: {
      'import:react': 'Only for the `React.FC` and `React.ReactNode` types. JSX itself needs no import (automatic runtime).',
      'import:lucide-react': 'Icon components (Users, Brain, ArrowRight, …). Each is an inline SVG; size and colour come from the className passed.',
      'import:swr': '`useSWR(key, fetcher, options)` — cached, deduplicated data fetching. A `null` key means "do not fetch yet", which this page uses to wait for the user\'s schoolId.',
      'import:next/dynamic': 'Loads AttendanceInsights in the browser only (`ssr: false`), keeping the recharts library out of the server compile of the route every user opens first.',
      'import:@/utils/fetcher': 'The fetch function given to every useSWR call in this file. It throws on HTTP errors and on `{ success: false }` — see that file\'s notes; the page does not read SWR\'s `error`, which matters for the failure states below.',
      'import:next/link': 'Client-side navigation for every card and quick link (no full page reload).',
      'import:@/components/dashboard/DashboardKPIs': 'The KPI block at the top.',
      'import:@/components/attendance/ClockHealthBadges': 'Device clock-trust chips (shared with /attendance/logs).',
      'import:@/components/attendance/IntelligenceStrip': 'Attendance-intelligence tiles (shared with /attendance).',
      'import:@/components/dashboard/DeviceStatusWidget': 'Device count card in the right column.',
      'import:@/components/dashboard/SmsBalanceCard': 'SMS balance card in the right column.',
      'import:@/contexts/AuthContext': '`useAuth()` gives the signed-in user; the page needs only `user.schoolId`, to decide whether to fetch.',
      'import:@/components/i18n/I18nProvider': '`useI18n()` — the current language (`lang`) and the translator `t(key)`.',
      'import:@/lib/i18n/format': '`toArabicDigits` — rewrites 0-9 as Arabic-Indic digits when the interface is Arabic.',
      ad: 'Helper: a number or string in Arabic-Indic digits when `isAr`, unchanged otherwise. Used for every count shown in Arabic.',
      AttendanceInsights: 'The insights component, imported through `dynamic(…, { ssr: false })`. It renders nothing on the server and nothing until its chunk has loaded in the browser; there is no `loading` placeholder, so the space simply fills in.',
      SIGNAL_STYLES: 'Background/border/text classes and icon per signal type (warning, decline, positive, info). A type not in the map falls back to `info` inside SignalCard.',
      Signal: 'Shape of one item in `/api/intelligence/overview` → `signals[]`: type, icon, label, detail, value, action (a URL the card links to). `icon` and `value` are received but not displayed.',
      SignalCard: 'One clickable signal: a Link to `signal.action`, the type\'s icon, label and detail (both truncated to one line).',
      'SignalCard.style': 'Looks up the styles for `signal.type`, defaulting to `info` for unknown types.',
      'SignalCard.render#1': 'A `<Link>` row: icon, label (coloured by type), detail (muted), arrow. The whole card is the link target.',
      IntelligenceSummary: 'Card listing up to six intelligence signals for the current term, with links to /intelligence. Receives `schoolId` only to know whether to fetch.',
      'IntelligenceSummary.{ lang }': 'Current interface language.',
      'IntelligenceSummary.isAr': 'True when Arabic — selects the Arabic literal strings written inline in this component (it uses literal ternaries rather than `t()` keys).',
      'IntelligenceSummary.{ data, isLoading }': 'useSWR on `/api/intelligence/overview` (key is null until schoolId is known), refreshed every 120 s. `error` is not read.',
      'IntelligenceSummary.guard#1': 'While loading: the card title plus three grey pulsing bars (skeleton).',
      'IntelligenceSummary.signals': '`data.signals`, or an empty list when there is no data.',
      'IntelligenceSummary.meta': '`data.meta` (the current term is shown as a pill when present).',
      'IntelligenceSummary.render#1': 'Header (title, term pill, "Full analysis" link). Body: if no signals — "No signals this term" when data arrived, "No data yet for this term" when it did not (which is also what a failed request shows); otherwise the first six signals as SignalCards. When there are signals, a full-width "View Full Intelligence Report" button.',
      AttendanceInsightCard: 'Biometric-attendance summary card (today scanned, week trend, coverage). Hides itself entirely for schools without biometric data.',
      'AttendanceInsightCard.{ lang }': 'Current interface language.',
      'AttendanceInsightCard.isAr': 'Arabic or not, for the inline Arabic strings.',
      'AttendanceInsightCard.{ data, isLoading }': 'useSWR on `/api/intelligence/attendance-overview` (null key until schoolId), every 120 s.',
      'AttendanceInsightCard.d': '`data.data` — the metrics object.',
      'AttendanceInsightCard.guard#1': 'Not loading and (no data or `tracked_days === 0`) → render nothing. A failed request also lands here, so the card disappears instead of showing an error.',
      'AttendanceInsightCard.TREND_ICON': 'Icon per week trend: improving (green up), declining (red down), stable / no_data (grey activity).',
      'AttendanceInsightCard.guard#2': 'While loading: a pulsing skeleton of the title and three metric boxes. (It is placed after guard#1, so it only shows while `isLoading` is true — guard#1 never hides a loading card.)',
      'AttendanceInsightCard.trend': '`d.week_trend` or `no_data`.',
      'AttendanceInsightCard.weekDelta': '`d.week_delta_pct` — percentage change against the previous week; may be null.',
      'AttendanceInsightCard.deltaLabel': '"+N%" / "N%" text, or empty when the delta is null. Note: an `undefined` delta (field absent) is not `=== null`, so it would render "undefined%" — [unverified] whether the API can omit the field.',
      'AttendanceInsightCard.trendColor': 'Green for improving, red for declining, grey otherwise.',
      'AttendanceInsightCard.render#1': 'Header (title, "N days tracked" pill, "Full report" link), a 3-column grid (Today Scanned of enrolled; Week Trend with icon and delta; Biometric Coverage % and students scanned), and a "View Attendance Intelligence" button to /intelligence?tab=attendance.',
      DashboardPage: 'The route component (default export). Reads the user, fetches the overview, lays out every card.',
      'DashboardPage.{ t }': 'Translator for the page\'s own labels (nav.dashboard, modules.intelligence, people.students, quick-link labels).',
      'DashboardPage.{ user }': 'The signed-in user from AuthContext.',
      'DashboardPage.schoolId': '`user.schoolId` or null. Null until the session has loaded — every fetch in this file waits for it by passing a null SWR key.',
      'DashboardPage.{ data: overviewData, isLoading }': 'useSWR on `/api/dashboard/overview`, refetched every 60 s while the page is open. `isLoading` is read but unused; `error` is not read.',
      'DashboardPage.overview': '`overviewData.data` — the whole overview object. Only `overview.kpis` and `overview.attendance` are used on this page.',
      'DashboardPage.render#1': 'Page frame: top bar (title, links to /intelligence and /students/list), then a vertical stack — DashboardKPIs, ClockHealthBadges, IntelligenceStrip, AttendanceInsights — then a responsive grid (signals + attendance card on the left, 1 column on md and 2 on lg; SMS and devices on the right), then six quick links into /intelligence tabs, built from an inline array mapped to Links (key = href).',
      default: 'Next.js renders the default export of page.tsx for the route.',
    },

    [KPIS]: {
      'import:react': '`React.FC` type.',
      'import:lucide-react': 'Icons for the KPI tiles.',
      'import:@/components/i18n/I18nProvider': '`useI18n()` for `t` and `lang`.',
      'import:@/lib/i18n/format': '`toArabicDigits` for Arabic counts.',
      ad: 'Arabic-Indic digits when Arabic.',
      KPIData: 'Shape of `overview.kpis` from GET /api/dashboard/overview. `feesCollectedToday` is always 0 from the API and not shown.',
      RoleCounts: '{ total, present, late, absent } for one role — from getDashboardAttendanceCounts().',
      AttendanceByRole: '`overview.attendance`: the date plus learner and staff RoleCounts.',
      DashboardKPIsProps: 'Both props optional: `data` (kpis) and `attendance`.',
      KPISkeleton: 'Loading placeholder: four grey pulsing tiles.',
      'KPISkeleton.render#1': 'A 2-column (4 on large screens) grid of pulsing boxes.',
      STATUS_HEX: 'Present green, late amber, absent red — the same palette as AttendanceInsights, always paired with labelled counts.',
      StatusDonut: 'Tiny SVG donut of present/late/absent shares for one role.',
      'StatusDonut.total': 'Sum of the three counts, at least 1 so an empty role never divides by zero.',
      'StatusDonut.r': 'Geometry: radius 26, centre (32,32), stroke width 10 in a 64×64 viewBox (r, cx, cy, sw are declared together).',
      'StatusDonut.cx': 'See r.',
      'StatusDonut.cy': 'See r.',
      'StatusDonut.sw': 'See r.',
      'StatusDonut.C': 'Circumference 2πr — dash lengths are fractions of it.',
      'StatusDonut.segs': 'The three segments with their colours, in drawing order.',
      'StatusDonut.offset': 'Running start position (as a fraction) of the next segment; mutated inside the map, which is why the segments sit end to end.',
      'StatusDonut.render#1': 'A grey background ring, then one circle per non-zero segment whose dash array draws only its share (minus 2 px gap) and whose dash offset starts where the previous ended. The SVG is rotated −90° so the first segment starts at 12 o\'clock; aria-hidden because the numbers beside it carry the meaning.',
      RoleAttendanceCard: 'One role\'s card: title, "N% of total", donut, three labelled counts, and a coloured progress bar.',
      'RoleAttendanceCard.pct': 'present / total as a whole percentage (0 when total is 0). Late is NOT counted as present here.',
      'RoleAttendanceCard.barColor': 'Green ≥ 80 %, amber ≥ 60 %, red below.',
      'RoleAttendanceCard.cells': 'The three labelled numbers (present, late, absent) with their colours.',
      'RoleAttendanceCard.render#1': 'Card layout: header row, donut + three counts, bar whose width is the percentage (capped at 100).',
      DashboardKPIs: 'The top KPI block. With role data: two role cards + Total Students and Fee Defaulters tiles. Without role data (older API): the four classic tiles.',
      'DashboardKPIs.{ t, lang }': '`t` is destructured but not used; labels are inline English/Arabic literals.',
      'DashboardKPIs.guard#1': 'No `data` yet → KPISkeleton. Because the page never passes an error state, a FAILED overview request also leaves this skeleton on screen indefinitely. [defect]',
      'DashboardKPIs.attendancePct': '`data.attendancePercentage` (computed by the API as present / total learners).',
      'DashboardKPIs.attendanceColor': 'Text colour by the same 80 / 60 thresholds.',
      'DashboardKPIs.isAr': 'Arabic or not.',
      'DashboardKPIs.allCards': 'The four tile definitions: Total Students (with "N enrolled this month" from enrollmentGrowth), Learners Present Today and Learners Absent Today (both flagged `attendanceTile`), Fee Defaulters (orange ring and "action required" above 10).',
      'DashboardKPIs.cards': 'With `attendance` present, the two `attendanceTile` cards are dropped — the role cards already show those numbers, labelled.',
      'DashboardKPIs.render#1': 'Role cards (when attendance exists) in a 1/2-column grid, then the tiles; the tile grid is 2 columns when there are ≤ 2 cards, otherwise 2 → 4 on large screens. Tile key = label.',
      default: 'Default export used by the page.',
    },

    [CLOCK]: {
      'import:react': 'JSX types.',
      'import:swr': 'Fetches the device clock status.',
      'import:lucide-react': 'Clock / warning / check icons.',
      'import:@/components/i18n/I18nProvider': '`t`, `lang`, `digits` — this component is fully key-translated (attendancePages.clockBadges.*).',
      DeviceChip: 'One device in `/api/attendance/time-health?banner=1` → `devices[]`: serial, status (trusted | review | anomaly), confidence %, clock offset in minutes, cause, batch.',
      fetcher: 'Local fetch with `cache: no-store`; does not check HTTP status (a failure yields whatever JSON came back, or a rejected promise for non-JSON).',
      ClockHealthBadges: 'Row of chips, one per device, each linking to /attendance/time-health. Prop `quiet`: hide everything when all devices are trusted — the dashboard does NOT pass it, so chips always show when there are devices.',
      'ClockHealthBadges.{ data }': 'useSWR every 5 minutes, no refetch on focus.',
      'ClockHealthBadges.{ t, lang, digits }': 'Translation and digit helpers.',
      'ClockHealthBadges.devices': '`data.devices` or empty.',
      'ClockHealthBadges.guard#1': 'No devices (or still loading, or failed) → render nothing. No skeleton by design.',
      'ClockHealthBadges.guard#2': 'quiet mode and every device trusted → nothing.',
      'ClockHealthBadges.render#1': 'Label then chips. Per device: red for anomaly (with "±Nh" offset and a FIX tag), amber for review, green for trusted; shows the last 6 characters of the serial and the confidence. Chips are plain `<a>` tags (full navigation), tooltip text from the translation.',
    },

    [STRIP]: {
      'import:react': 'JSX and ReactNode type.',
      'import:swr': 'Fetches the intelligence summary.',
      'import:next/link': 'Tile and footer links.',
      'import:lucide-react': 'Tile icons.',
      'import:@/components/i18n/I18nProvider': '`t`, `lang`, `digits` (attendancePages.strip.* keys).',
      fetcher: 'Local fetch, no-store, no status check.',
      Tile: 'One tile: link, label, icon, value text, subtitle, tone.',
      TONE: 'Value colour per tone: ok green, warn amber, bad rose, muted grey.',
      IntelligenceStrip: 'Six linked tiles summarising attendance health. Prop `compact` changes the grid only (the dashboard uses the full width: 2/3/6 columns).',
      'IntelligenceStrip.{ data }': 'useSWR on `/api/attendance/intelligence-summary` every 5 minutes, no focus refetch.',
      'IntelligenceStrip.d': '`data` or `{}` — every tile checks its own section and shows "—" with a muted tone while missing.',
      'IntelligenceStrip.{ t, lang, digits }': 'Translation helpers.',
      'IntelligenceStrip.pct': 'Formats a percentage in the interface digits.',
      'IntelligenceStrip.tiles': 'Health (score; ok ≥ 90, warn ≥ 70), Watch list (people.watch; roster review count), Gaps (gaps.gaps; bad when > 0), Clock (clock.anomalies), Identity (duplicates + unknowns), Fleet (devices.fleet %, needMaint). Each links to its full page.',
      'IntelligenceStrip.links': 'Three footer links: trends, event explorer, founder independence.',
      'IntelligenceStrip.render#1': 'Card with title and "Full center" link, the tile grid (key = href), and the footer links.',
    },

    [SMS]: {
      'import:react': 'JSX.',
      'import:swr': 'Fetches the quota.',
      'import:next/link': 'Buy / Send links.',
      'import:lucide-react': 'Icons.',
      'import:@/components/i18n/I18nProvider': '`lang` only (strings are inline English/Arabic).',
      'import:@/lib/i18n/format': '`toArabicDigits`.',
      ad: 'Arabic-Indic digits when Arabic.',
      fetcher: 'Local fetch, no status check.',
      Level: 'ok | low | empty | unlimited — drives colours and the warning line.',
      SmsBalanceCard: 'SMS units remaining for this school, read from `/api/sms/quota` (computed from the usage ledger every send path writes to).',
      'SmsBalanceCard.{ lang }': 'Language.',
      'SmsBalanceCard.isAr': 'Arabic or not.',
      'SmsBalanceCard.{ data, isLoading }': 'useSWR every 30 s and on window focus.',
      'SmsBalanceCard.guard#1': 'Loading → pulsing skeleton.',
      'SmsBalanceCard.guard#2': 'Response without `success` (including a failure) → render nothing.',
      'SmsBalanceCard.quota': 'Units allowed (null = no limit).',
      'SmsBalanceCard.used': 'Units used.',
      'SmsBalanceCard.remaining': 'Units left (null with no limit).',
      'SmsBalanceCard.platformDown': 'API reason PLATFORM_BALANCE_DEPLETED — the platform\'s own provider balance is out, whatever this school\'s quota says.',
      'SmsBalanceCard.level': 'unlimited when quota is null; empty when remaining ≤ 0; low when remaining ≤ 200 or ≤ 10 % of quota; ok otherwise; forced to empty when platformDown. Declared with `let` as "ok" and then set by guard#3 (the if / else-if chain) and guard#4.',
      'SmsBalanceCard.guard#3': 'The if / else-if chain that picks unlimited, empty or low (see `level`).',
      'SmsBalanceCard.guard#4': 'platformDown overrides to empty.',
      'SmsBalanceCard.styles': 'Border / bar / text classes per level.',
      'SmsBalanceCard.s': 'The styles for the current level.',
      'SmsBalanceCard.pctUsed': 'used / quota as a capped percentage for the bar (0 without a quota).',
      'SmsBalanceCard.fmt': 'Thousands separators + Arabic digits.',
      'SmsBalanceCard.render#1': 'Coloured top bar, header with Buy SMS (/admin/sms/buy) and Send (/admin/communications), then either "No limit set" + used, or "N SMS left" + progress bar (role=progressbar) + "used of quota"; for low/empty a warning line, with a separate message when the platform is down.',
    },

    [DEVICES]: {
      'import:react': 'JSX.',
      'import:swr': 'Fetches the device summary.',
      'import:next/link': 'Monitor link.',
      'import:lucide-react': 'Icons.',
      'import:@/components/i18n/I18nProvider': '`lang`.',
      'import:@/lib/i18n/format': '`toArabicDigits`.',
      ad: 'Arabic-Indic digits when Arabic.',
      fetcher: 'Local fetch, no status check.',
      DeviceStatusWidget: 'Total / online / offline device counts from `/api/devices/summary`, linking to /attendance/devices/monitor. (The file header still says /admin/devices — the code links to /attendance/devices/monitor.)',
      'DeviceStatusWidget.{ lang }': 'Language.',
      'DeviceStatusWidget.isAr': 'Arabic or not.',
      'DeviceStatusWidget.{ data, isLoading }': 'useSWR every 30 s and on focus.',
      'DeviceStatusWidget.summary': '`data.data` or zeros. A failed request therefore shows as zero devices.',
      'DeviceStatusWidget.hasDevices': 'total > 0.',
      'DeviceStatusWidget.allOnline': 'Devices exist and none offline — green styling.',
      'DeviceStatusWidget.guard#1': 'Loading → skeleton.',
      'DeviceStatusWidget.render#1': 'Border and top bar green (all online), red (any offline) or grey; header with Monitor link; either "No devices registered" or a 3-column count grid.',
    },

    [INSIGHTS]: {
      'import:react': '`useState` for the day window.',
      'import:swr': 'Fetches insights for the chosen window.',
      'import:recharts': 'PieChart/Pie/Cell/Tooltip/ResponsiveContainer for the distribution donut — the reason the page loads this component client-only.',
      'import:lucide-react': 'Icons.',
      'import:@/components/i18n/I18nProvider': '`lang`.',
      'import:@/lib/i18n/format': '`toArabicDigits`.',
      ad: 'Arabic-Indic digits when Arabic.',
      pp: 'A percentage with the correct digits and sign (٪ in Arabic).',
      STATUS_HEX: 'Present / late / absent colours (same as DashboardKPIs).',
      TopPerson: 'One person in a top list: id, name, detail (class or department), and their absents / lates / presents over `days` school days.',
      Dist: '{ present, late, absent } counts of verdicts.',
      RoleInsights: 'Per role: distribution, optional day/boarding split, three top lists, number of people, school days counted.',
      DistributionDonut: 'Donut + legend of verdict shares, with the number of school days it is based on.',
      'DistributionDonut.data': 'Non-zero slices only (recharts would draw empty slices otherwise).',
      'DistributionDonut.total': 'All verdicts in the window.',
      'DistributionDonut.guard#1': 'No verdicts → "No verdicts in this window yet".',
      'DistributionDonut.pct': 'Share of total as a whole percentage.',
      'DistributionDonut.render#1': 'A 112 px responsive pie (inner radius 30 → donut) with a tooltip showing "% (count)", a legend of all three statuses (including zero ones), and the "Based on N school days" note.',
      ResidenceSplit: 'Day scholars vs boarders percentages, shown only when the API returns `byResidence`.',
      'ResidenceSplit.row': 'One labelled line: present / late / absent percentages, or "no data".',
      'ResidenceSplit.render#1': 'Heading and the two rows.',
      TopList: 'A titled ordered list of people with one metric each (chosen by the `metric` function prop).',
      'TopList.render#1': '"None" when empty, otherwise name · detail and the coloured metric with its unit (key = personId).',
      RolePanel: 'One role\'s panel: donut, residence split, then three TopLists (most absent, most late, best attendance).',
      'RolePanel.render#1': 'Card layout; the three lists sit in 1 column on phones, 3 from the sm breakpoint.',
      AttendanceInsights: 'Header with a window selector, then a Staff and a Learners panel.',
      'AttendanceInsights.{ lang }': 'Language.',
      'AttendanceInsights.isAr': 'Arabic or not.',
      'AttendanceInsights.[days, setDays]': 'Selected window in days (default 30). Changing it changes the SWR key, so SWR fetches the new window (and caches each window separately).',
      'AttendanceInsights.{ data }': 'useSWR on `/api/attendance/insights?days=N` with an inline fetcher; no refresh interval (the shell\'s global options apply).',
      'AttendanceInsights.guard#1': 'No successful response → render nothing ("silent until verdicts exist"). Loading and failure look the same: no section.',
      'AttendanceInsights.render#1': 'Title and `<select>` (7/14/30/90 days → setDays), then two RolePanels side by side on large screens.',
    },

    [FETCHER]: {
      fetcher: 'Generic `fetcher<T>(url)` for SWR: GET the URL, parse JSON, throw when the HTTP status is not ok OR the body says `success: false`. The thrown Error carries the API\'s own message and `.status`.',
      'fetcher.response': 'The raw fetch Response (same-origin, so the session cookie is sent).',
      'fetcher.body': 'Parsed JSON, or null when the body is not JSON.',
      'fetcher.catch#1': 'A non-JSON body is ignored rather than thrown — the status check below still reports the failure.',
      'fetcher.guard#1': 'Failure → throw `Error(body.error || body.message || "HTTP error! status: N")` with `.status`, so a permission refusal and an outage read differently to whoever displays the error.',
      'fetcher.return#1': 'Success → the parsed body (the whole object, e.g. `{ success, data }`).',
      default: 'Same function as the named export.',
    },

    [API]: {
      'import:next/server': '`NextRequest` (incoming request) and `NextResponse.json` (responses).',
      'import:@/lib/datetime/local-date': '`schoolLocalToday()` — today\'s date in the school\'s timezone (not the server\'s UTC date).',
      'import:@/lib/db': '`getConnection()` — a dedicated MySQL/TiDB connection used for the 13 parallel queries; closed in `finally`.',
      'import:@/lib/attendance/dashboard-counts': '`getDashboardAttendanceCounts(schoolId)` — the single source of today\'s present/late/absent per role, read from attendance_records verdicts (documented with the Attendance module).',
      'import:@/lib/db/db-mode': '`getDbMode()` — routes local-SQLite installs to `offlineDashboardOverview`.',
      'import:@/lib/auth': '`getSessionSchoolId(req)` — validates the session cookie and returns the user\'s school. The school always comes from here, never from the request.',
      offlineDashboardOverview: 'Same response shape for a local SQLite install. Real numbers where local data exists; zeros where the data is not in local installs by policy (results, fees, attendance verdicts, live device status). Returns the JSON response itself.',
      'offlineDashboardOverview.{ getSqliteDb }': 'Dynamic import so the SQLite driver is only loaded in local mode.',
      'offlineDashboardOverview.db': 'The open local database (throws LOCAL_DB_MISSING if the file is gone — surfaces as the 500 below).',
      'offlineDashboardOverview.today': 'School-local date (computed but not used by the SQLite queries, which use SQLite\'s `date(\'now\')`, i.e. UTC). [defect] admissions "today/yesterday" can be off near midnight.',
      'offlineDashboardOverview.classCount': 'Classes of this school.',
      'offlineDashboardOverview.genderData': 'Active, not deleted learners by gender.',
      'offlineDashboardOverview.staffCount': 'Active, not deleted staff.',
      'offlineDashboardOverview.parentCount': 'Learners with at least one contact (counted as "parents").',
      'offlineDashboardOverview.admissionData': 'Admissions today / yesterday / last week / month / 3 months / this year / last year.',
      'offlineDashboardOverview.termData': 'The newest active term with days covered and remaining.',
      'offlineDashboardOverview.deviceData': 'Registered devices — [defect] no school_id filter: counts every school\'s devices in the file (harmless in a one-school local file, wrong in principle).',
      'offlineDashboardOverview.dashCounts': 'Per-role attendance counts (zeros in local mode, by policy).',
      'offlineDashboardOverview.presentToday': 'Learners present.',
      'offlineDashboardOverview.totalStudentsToday': 'Learner population.',
      'offlineDashboardOverview.attendancePercentage': 'present / total, rounded.',
      'offlineDashboardOverview.overview': 'The response object — same keys as the online path; finance, performance and live device figures fixed at 0.',
      'offlineDashboardOverview.return#1': '`{ success: true, data: overview }`.',
      GET: 'The handler. Authenticates, branches for local SQLite, otherwise runs 13 queries in parallel on one connection, then computes attendance via getDashboardAttendanceCounts and returns `{ success, data }`.',
      'GET.connection': 'Declared outside try so `finally` can close it.',
      'GET.session': 'Session for this request.',
      'GET.guard#1': 'No session → 401 `{ error: "Not authenticated" }`. (The page\'s fetcher turns this into a thrown Error; the page then shows the KPI skeleton — see the failure states.)',
      'GET.schoolId': 'The school, from the session only.',
      'GET.guard#2': 'Local SQLite mode → offlineDashboardOverview.',
      'GET.{ searchParams }': 'Query string.',
      'GET.from': '`from` query parameter or today — read but not used by any query. [defect] dead parameter.',
      'GET.to': 'Same as `from`: read, unused.',
      'GET.today': 'School-local date, used by the legacy student_attendance query.',
      'GET.[ totalClasses, genderCounts, totalStaff, totalParents, admissions, paymentStats, learnerPerformance, bestLearner, worstLearner, termProgress, todayAttendance, activeDevices, todayBiometricPunches ]': 'Thirteen queries run in parallel with Promise.all on the same connection (mysql2 queues them on the wire). All but activeDevices filter by `school_id = ?`. **activeDevices has no school filter** — it counts every school\'s devices and how many sent a heartbeat in the last 120 s. [defect] tenant leak of a count (no device details). The page does not display these device numbers, but other consumers of this response would.',
      'GET.classCount': 'Row 0 of each result — `Array.isArray` handles both result shapes mysql2 can return. The same pattern repeats for every result below.',
      'GET.genderData': 'Boys/girls among active, not deleted learners.',
      'GET.staffCount': 'Active, not deleted staff.',
      'GET.parentCount': 'Learners with any contact.',
      'GET.admissionData': 'Admissions timeline (MySQL CURDATE — the database server\'s date, which may differ from the school\'s timezone).',
      'GET.paymentData': 'Fee ITEM counts by status and outstanding totals from student_fee_items.',
      'GET.performanceData': 'Counts of result ROWS above 75 / below 40 and the average score from class_results.',
      'GET.bestStudentData': 'Learner with the highest average result.',
      'GET.worstStudentData': 'Learner with the lowest non-zero average.',
      'GET.termData': 'Newest active term and day counts.',
      'GET.attendanceData': 'From the legacy student_attendance table — used only as a fallback population when getDashboardAttendanceCounts returns 0.',
      'GET.deviceData': 'From activeDevices (unfiltered — see above).',
      'GET.biometricData': 'Today\'s punches for this school, with the day computed as UTC+180 minutes (East Africa time hard-coded here).',
      'GET.dashCounts': 'The authoritative per-role attendance numbers.',
      'GET.totalStudentsToday': 'Learner population: dashCounts, else the legacy count.',
      'GET.presentToday': 'Learners present today.',
      'GET.attendancePercentage': 'present / population, rounded.',
      'GET.overview': 'Response object. The dashboard reads **kpis** (totalStudents, presentToday, absentToday, attendancePercentage, enrollmentGrowth = admissions in the last month, defaultersCount) and **attendance** (date, learners, staff). defaultersCount = not_paid + partially_paid **fee items**, not distinct learners. [defect] the "Fee Defaulters" tile overstates when a learner has several unpaid items. Everything else (schoolStats, biometrics, admissions, paymentStats, performance, top/worst performers, fees, termProgress) is not used by /dashboard.',
      'GET.return#1': '`{ success: true, data: overview }`.',
      'GET.catch#1': 'Any thrown error → logged on the server, 500 `{ success: false, error: "Failed to fetch dashboard overview" }` (message details only in development).',
      'GET.finally#1': 'Always closes the connection — a leaked connection would exhaust the pool under the 60-second refresh.',
    },
  },

  ui: [
    { title: 'Top bar', text: 'Page title from `t(\'nav.dashboard\')`, a link to /intelligence and a link to /students/list. Not sticky; scrolls with the page (the shell\'s main area scrolls).' },
    { title: 'Attendance and KPI block (DashboardKPIs)', text: 'Two role cards — "Staff Attendance Today (date)" and "Learners Attendance Today (date)" — each with a donut, present/late/absent counts and a coloured bar; then the Total Students and Fee Defaulters tiles. Until the overview arrives: four grey tiles.' },
    { title: 'Device clock chips (ClockHealthBadges)', text: 'One chip per device; nothing at all for a school without devices.' },
    { title: 'Intelligence strip', text: 'Six tiles with live values; "—" in grey while their data has not arrived.' },
    { title: 'Attendance insights', text: 'Appears once its chunk and data load and the API reports success. Window selector, then Staff and Learners panels.' },
    { title: 'Signals and attendance card (left column)', text: 'Up to six signal cards linking to their pages; below, the biometric card (hidden for schools without biometric data).' },
    { title: 'SMS and devices (right column)', text: 'SMS balance (hidden if the quota API fails) and device counts.' },
    { title: 'Quick links', text: 'Six tiles into /intelligence tabs; 2 columns on phones, 3 from sm, 6 from md.' },
  ],

  interactions: [
    { action: 'Open /dashboard', steps: [
      'middleware.ts: session cookie present → continue (else redirect to /login).',
      'AuthContext resolves the user → `schoolId` becomes non-null → the null SWR keys become real URLs.',
      'useSWR GET /api/dashboard/overview (page) — in parallel each card issues its own GET.',
      'GET handler: getSessionSchoolId → (local SQLite → offline branch) → 13 queries + getDashboardAttendanceCounts → JSON.',
      'fetcher: ok → body; SWR stores it → DashboardKPIs re-renders with data.',
      'Every 60 s (overview), 120 s (signals, biometric card), 30 s (SMS, devices), 5 min (clock chips, strip) SWR refetches while the tab is open.',
    ] },
    { action: 'Change the insights window (select 7/14/30/90 days)', steps: [
      '`onChange` → setDays(N).',
      'Re-render → SWR key `/api/attendance/insights?days=N` changes → fetch (cached per window).',
      'Response → RolePanels re-render. While the new window loads, SWR keeps showing the previous data (SWR default).',
    ] },
    { action: 'Click any card, tile, chip or quick link', steps: [
      'Next.js `<Link>` (or `<a>` for the clock chips) navigates to the owning page. Nothing is written.',
    ] },
  ],

  data: `**Overview response** (GET /api/dashboard/overview → \`{ success, data }\`) — fields used here:

- \`data.kpis\`: totalStudents, presentToday, absentToday, lateToday, attendancePercentage, enrollmentGrowth, feesCollectedToday (always 0), defaultersCount (fee items).
- \`data.attendance\`: { date, learners: {total, present, late, absent}, staff: {…} } from getDashboardAttendanceCounts.

**Card APIs** (contracts as consumed by the components; their handlers are documented on their own API route pages):
- /api/intelligence/overview → \`{ signals: Signal[], meta: { currentTerm? } }\`
- /api/intelligence/attendance-overview → \`{ data: { tracked_days, today_scans, total_enrolled, week_trend, week_delta_pct, scan_rate_pct, total_scanned_students } }\`
- /api/attendance/time-health?banner=1 → \`{ devices: DeviceChip[] }\`
- /api/attendance/intelligence-summary → \`{ health?, people?, gaps?, clock?, identity?, devices? }\`
- /api/attendance/insights?days=N → \`{ success, staff: RoleInsights, learners: RoleInsights }\`
- /api/sms/quota → \`{ success, quota|null, used, remaining|null, reason? }\`
- /api/devices/summary → \`{ data: { total, online, offline } }\`

Database (overview API): classes, students, people, staff, student_contacts, student_fee_items, class_results, terms, enrollments, student_attendance (legacy), devices, attendance_raw_events, and attendance_records via dashboard-counts.`,

  states: `- **Loading**: KPI skeleton; signals skeleton; biometric-card skeleton; SMS and device skeletons; clock chips, strip values and insights simply absent/grey.
- **No data**: "No signals this term — all clear" (signals present but empty) / "No data yet for this term" (no response); biometric card hidden when tracked_days is 0; "No devices registered"; insights hidden until verdicts exist; "No verdicts in this window yet" inside a panel.
- **Request fails**: [defect] none of the cards shows an error. Overview failure → KPI skeleton forever (the page ignores SWR \`error\`). Signals failure → "No data yet for this term". Biometric/insights/SMS → hidden. Devices → zero devices. Clock chips/strip → absent / "—".
- **Not signed in**: middleware redirects to /login; an expired session makes the APIs return 401, which looks like the failure case above.
- **Offline (local SQLite)**: page renders (OFFLINE_SAFE_PREFIXES); overview comes from offlineDashboardOverview with zeros for out-of-scope data.`,

  security: `- **Tenant isolation**: every number is for the session's school because each API derives the school from \`getSessionSchoolId\` — the page sends no school id. Exception: [defect] the overview's activeDevices query counts devices of all schools (not displayed here).
- **No permission gate**: any signed-in user of the school sees every card. Adding sensitive figures here must add a permission check in the API, not only hide the card.
- **Read-only**: the route writes nothing; it is safe to refresh repeatedly.
- **Connection hygiene**: the overview API must keep closing its connection in \`finally\`.`,

  styling: `Tailwind utility classes only; no stylesheet of its own. Light/dark via \`dark:\` variants (theme from ThemeProvider in the root layout). Page background slate-50 / slate-950; cards are white / slate-900 with rounded-2xl borders (the SMS and device cards use gray-* and rounded-xl — a slightly different card style).
Responsive: KPI tiles 2 → 4 columns (lg); role cards 1 → 2 (sm); main grid 1 → 2 (md) → 3 (lg) with the signals column spanning 2 on lg; quick links 2 → 3 (sm) → 6 (md); insights panels 1 → 2 (lg).
Right-to-left: \`rtl-flip\` on arrow icons mirrors them in Arabic; digits switch through \`ad\` / \`digits\`.
Accessibility: colour is never the only signal (counts are labelled beside every donut); the SMS bar has role=progressbar; donuts are aria-hidden.`,

  testing: `- **Existing tests**: none import these files. Related: src/lib/i18n/__tests__/core.test.mjs (translation core), src/lib/datetime/__tests__/local-date.test.mjs (schoolLocalToday). The dashboard-counts logic is exercised by the attendance tests.
- **Untested**: the overview response shape, the KPI thresholds, empty/failed states.
- **Debugging**: open DevTools → Network, filter "/api/". A KPI skeleton that never goes away = GET /api/dashboard/overview failed — read its JSON error and the server log line "Dashboard overview error:". Wrong attendance numbers → check getDashboardAttendanceCounts, not the page. A card missing → its own API returned no success (look at that request).
- **Check a change locally**: \`npm run dev\`, sign in, open /dashboard in English and Arabic (\`node scripts/l10n-render.mjs src/components/dashboard/DashboardKPIs.tsx\` renders a component in both languages), and in local-SQLite mode if you touched the API.`,

  extend: [
    { change: 'Add a KPI tile from data the overview already returns', how: 'Add an entry to `allCards` in DashboardKPIs.tsx (label in English and Arabic, value via `ad`). Read it from `data` (kpis). If the value is not in `kpis`, add it to `overview.kpis` in BOTH the online GET and offlineDashboardOverview so local installs keep the same shape.' },
    { change: 'Add a new card with its own data', how: 'Write a self-contained component like SmsBalanceCard (its own useSWR, skeleton, empty state, and — unlike the current cards — an error state), backed by its own API route that calls getSessionSchoolId (and requirePermission if the data is sensitive). Render it in the right column of DashboardPage. Do not add more fields to the overview API for it.' },
    { change: 'Show an error instead of the endless skeleton', how: '[recommended] Destructure `error` from the overview useSWR in DashboardPage and pass it to DashboardKPIs (new prop), which renders a message instead of KPISkeleton when set. The fetcher already puts the API\'s message on the Error.' },
    { change: 'Change a refresh rate', how: 'The `refreshInterval` option of the relevant useSWR call (page: 60 s overview; components: their own). Every open dashboard multiplies the load, so keep the overview at ≥ 60 s.' },
    { change: 'Add a quick link', how: 'Add an object to the inline array at the bottom of DashboardPage\'s render (href, icon, translated label, colour classes). Keys are hrefs, so hrefs must stay unique.' },
  ],
};

export default doc;
