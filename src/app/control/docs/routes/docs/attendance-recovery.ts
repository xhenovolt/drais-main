import type { RouteDoc } from '@/lib/devdocs/route-doc';

const PAGE = 'src/app/attendance/recovery/page.tsx';
const API_RECOVERY = 'src/app/api/attendance/recovery/route.ts';
const API_REPAIR = 'src/app/api/attendance/historical-repair/route.ts';

const doc: RouteDoc = {
  route: '/attendance/recovery',
  reviewed: { [PAGE]: 'e2b63dd2a7ea', [API_RECOVERY]: '09fb94b99834', [API_REPAIR]: 'eb604042c3da' },

  identity: {
    purpose: 'Recovery Center: when attendance stops flowing, show it per device (ok / watch / gap, punches today vs expected by now) with the recommended recovery — LAN pull or commit a staged pull (both done in Device Control), inspect the device, or retry the notification queue (done here). Also "Historical repair": rebuild verdicts for a past date range from the raw punches.',
    users: 'School administrators / attendance officers; support.',
    permissions: 'Page: session (middleware). GET /api/attendance/recovery: session. POST retry_queue: attendance.manage. POST /api/attendance/historical-repair: attendance.manage (withRoute).',
    upstream: 'detectGaps (src/lib/attendance/recovery.ts): devices, attendance_raw_events (today vs a learned expected volume), device last-seen and LAN IP, staged-but-uncommitted device pulls, notification_outbox rows queued > 15 min.',
    downstream: 'Links to /attendance/device-control (LAN pull / commit). Retry queue runs the notification drain. Historical repair re-runs evaluateDay → attendance_records (and anything triggered from verdicts), audited as ATTENDANCE_REEVALUATE_RANGE. The same gap data feeds the /attendance/logs attention row.',
  },

  files: [
    { path: PAGE, role: 'Route entry: device gap cards, school-wide recoverables, and the HistoricalRepair panel.', shared: false },
    { path: API_RECOVERY, role: 'GET/POST /api/attendance/recovery — gap report (also ?banner=1 for /attendance/logs) and retry_queue.', shared: false },
    { path: API_REPAIR, role: 'POST /api/attendance/historical-repair — re-evaluate a date range.', shared: false },
  ],

  layout: `- **src/middleware.ts** → **AuthenticatedShell** (react-hot-toast \`<Toaster>\`) → **MainLayout**; **src/app/attendance/layout.tsx** gradient.
- Raw \`fetch\` everywhere; react-hot-toast for the queue retry; the repair result is shown inline.
- The server returns English reasons and action labels; the page translates the known sentences itself with \`arRecovery\` (exact strings and regexes) when the interface is Arabic.`,

  tree: `RecoveryCenter                             src/app/attendance/recovery/page.tsx
  ├─ header: icon · title · subtitle · Re-scan
  ├─ spinner (first load) | green "all flowing" banner
  ├─ school-wide: staged pulls → Review & commit link · stuck SMS → Retry queue
  ├─ device cards: status icon · name · status chip · offline · "n today / ~m expected" · reason · action (actionFor)
  └─ HistoricalRepair(t): from · to · role · Re-evaluate · result line
  data: fetch /api/attendance/recovery (mount, Re-scan, after a queue retry)`,

  notes: {
    [PAGE]: {
      'import:react': '`useState`, `useEffect`, `useCallback`.',
      'import:@/lib/datetime/local-date': '`toLocalDateStr(date?)` — browser-local YYYY-MM-DD for the repair range defaults.',
      'import:lucide-react': 'Icons.',
      'import:react-hot-toast': '`toast` for the queue-retry result.',
      'import:@/components/i18n/I18nProvider': '`useI18n()` — t (English fallback as 3rd argument), lang, digits.',
      STATUS_STYLE: 'Chip classes and icon per verdict status: ok (green check), watch (amber clock), gap (rose warning).',
      arRecovery: 'Client-side Arabic for the server\'s recovery texts: an exact-match table for fixed sentences and action labels, then regexes for the sentences with numbers (re-inserting them with Arabic digits). Anything unrecognised is returned with only its digits converted — so a new server sentence silently appears in English inside the Arabic UI. Keep this table in step with recommendMethod in src/lib/attendance/recovery.ts.',
      'arRecovery.fixed': 'English sentence → Arabic sentence.',
      'arRecovery.guard#1': 'Exact match.',
      'arRecovery.m': 'Regex match holder.',
      'arRecovery.guard#2': '"Only N of ~M expected punches, and none in over 3h …" (device stored without uploading).',
      'arRecovery.guard#3': '"Only N of ~M expected punches and no LAN route …".',
      'arRecovery.guard#4': '"N parent SMS stuck in the queue."',
      'arRecovery.guard#5': '"Punch volume is below normal (N/~M) …".',
      'arRecovery.return#1': 'Fallback: the English text with Arabic digits.',
      RecoveryCenter: 'The route\'s default export.',
      'RecoveryCenter.{ t, lang, digits }': 'i18n helpers.',
      'RecoveryCenter.say': 'Arabic UI → arRecovery(text), else the text.',
      'RecoveryCenter.[data, setData]': 'Gap report (or an error body).',
      'RecoveryCenter.[loading, setLoading]': 'Scan running.',
      'RecoveryCenter.[retrying, setRetrying]': 'Queue retry running.',
      'RecoveryCenter.load': 'GET /api/attendance/recovery (no-store) → setData. No status check/catch (an error body becomes data: no devices, no banner).',
      'RecoveryCenter.effect#1': 'Scan once on mount. No polling — "Re-scan" refreshes.',
      'RecoveryCenter.retryQueue': 'POST {action: retry_queue} → toast "Queue drained" with delivered / failed counts, then rescan; error → toast.\n\nThe server runs `drainNotificationOutbox()` with no school argument — the same platform-wide drain the cron runs — so the counts include other schools\' messages. Nothing is sent that would not have been sent anyway, but the toast numbers are not "this school".',
      'RecoveryCenter.devices': 'Per-device results.',
      'RecoveryCenter.healthy': 'No gaps, nothing on watch, no stuck queue and no staged pull → green banner.',
      'RecoveryCenter.actionFor': 'Action per recommended method: lan_pull / resume_acquisition → link to /attendance/device-control; retry_queue → button calling retryQueue (its label is NOT passed through `say`, so it stays English in Arabic); check_device → grey text; none → nothing.',
      'RecoveryCenter.render#1': 'Header with Re-scan (spinning while loading); first-load spinner; healthy banner; amber school-wide rows for staged pulls (link) and stuck SMS (Retry queue button); one card per device (rose border for gap; name, status chip, "offline", today / expected counts, reason, action); "No devices registered" when empty; then HistoricalRepair.',
      HistoricalRepair: 'Re-evaluate attendance for a past range from the raw punches (replaces the founder\'s re-evaluation scripts).',
      'HistoricalRepair.[from, setFrom]': 'Start date, default 7 days ago (browser-local).',
      'HistoricalRepair.[to, setTo]': 'End date, default today.',
      'HistoricalRepair.[role, setRole]': "'' (everyone) | 'staff' | 'student'.",
      'HistoricalRepair.[busy, setBusy]': 'Request running (button shows "Re-evaluating…").',
      'HistoricalRepair.[result, setResult]': 'Server result or {error}.',
      'HistoricalRepair.run': 'window.confirm (range + scope) → POST {action: reevaluate_range, from, to, role} → result shown inline (green "Rebuilt n of m person-day verdicts" or the red error, e.g. 403 or "Range too large"). Can take minutes for a large school (route maxDuration 300 s); nothing else on the page is blocked.',
      'HistoricalRepair.render#1': 'Card: title, help text, From/To date inputs (aria-labels), role select, Re-evaluate, result line.',
    },

    [API_RECOVERY]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      'import:@/lib/rbac': '`requirePermission`.',
      'import:@/lib/attendance/recovery': '`detectGaps(school)` → {devices: [{device_sn, device_name, lan_ip, is_online, got_today, expected_by_now, verdict: {status ok|watch|gap, method, reason, actionLabel}}], summary: {gaps, watch, …}, queue: {stuck}, staging: {uncommitted}}. recommendMethod decides: staged pull → resume_acquisition; low volume and silent > 3 h with a LAN route → lan_pull; without a route → check_device; stuck SMS → retry_queue; before school hours → ok.',
      'import:@/lib/attendance/intelligence-sweep': '`sweepSchoolIntelligenceInBackground` — refresh clock health and baselines (throttled, not awaited) so "expected by now" has data.',
      runtime: "'nodejs'.",
      GET: 'Gap report for the caller\'s school (session only). `?banner=1` returns only the worst gap device and the gap count — used every 5 minutes by /attendance/logs.',
      'GET.session': 'Session.',
      'GET.guard#1': 'No session → 401.',
      'GET.report': 'Kick the sweep, then detectGaps.',
      'GET.guard#2': 'Banner: gap devices sorted by fewest punches today → first, plus summary.gaps.',
      'GET.return#1': 'Full report.',
      'GET.catch#1': '500 with the message.',
      POST: 'The one self-service recovery action: `retry_queue` (attendance.manage). Device pulls and commits stay in Device Control.',
      'POST.session': 'Session.',
      'POST.guard#1': 'No session → 401.',
      'POST.catch#1': 'No attendance.manage → 403.',
      'POST.b': 'Body.',
      'POST.guard#2': 'retry_queue → drainNotificationOutbox() (platform-wide; see the page note) → {success, result: {attempted, delivered, failed, requeued, deferred}}.',
      'POST.return#1': 'Anything else → 400 "Unknown action".',
    },

    [API_REPAIR]: {
      'import:@/lib/api/with-route': '`withRoute` — session, permission, read-only maintenance block for writes, error envelope.',
      'import:@/lib/audit': '`logAudit` — ATTENDANCE_REEVALUATE_RANGE.',
      'import:@/lib/attendance/historical-repair': '`planRange(from, to)` (pure: YYYY-MM-DD, reversed range swapped, ≤ 92 days, not starting in the future) and `reevaluateRange({school, from, to, role, personId})`.',
      runtime: "'nodejs'.",
      maxDuration: '300 s — a 92-day school-wide repair runs evaluateDay thousands of times.',
      badRequest: '400-tagged error for withRoute.',
      'badRequest.e': 'The error.',
      'badRequest.return#1': 'The error.',
      POST: `attendance.manage. Validates the action and the range, then reevaluateRange: finds every distinct (person, role, school-local date) **that has punches** in the range and re-runs evaluateDay for each (best-effort per day), then audits the counts.

Limitation: days on which a person has **no punches** are not re-evaluated, so this cannot repair verdicts that depend only on configuration (e.g. absences on a date that was later declared a holiday). Raw events are never modified.`,
    },
  },

  ui: [
    { title: 'Header', text: 'Life-buoy icon, "Recovery Center", subtitle, Re-scan button.' },
    { title: 'Healthy banner', text: 'Green: "Attendance is flowing normally across all devices — nothing to recover."' },
    { title: 'School-wide issues', text: 'Amber rows: "N device pull(s) staged but never committed" → Review & commit; "N parent SMS stuck in the queue" → Retry queue.' },
    { title: 'Device cards', text: 'Status icon, device name (monospace), status chip, "offline" when not online, "n today / ~m expected", the reason in plain language, and the recommended action (link, button or note).' },
    { title: 'Historical repair', text: 'Title, explanation that it is safe and idempotent, From / To dates (last 7 days by default), Everyone / Staff / Learners, Re-evaluate, and a result or error line.' },
  ],

  interactions: [
    { action: 'Open the page', steps: ['GET /api/attendance/recovery → background sweep → detectGaps → cards and banners.'] },
    { action: 'Retry the queue', steps: [
      'Retry queue → POST {retry_queue} → attendance.manage → drainNotificationOutbox() (all schools) → result.',
      'Toast with delivered / failed → rescan.',
    ] },
    { action: 'A device has a gap with a LAN route', steps: ['Card shows "Pull today from the device over LAN" → link to /attendance/device-control, where the pull, staging review and commit happen.'] },
    { action: 'Repair the last week', steps: [
      'Choose range/role → Re-evaluate → confirm → POST historical-repair {reevaluate_range, from, to, role}.',
      'withRoute (attendance.manage) → planRange → distinct person-days with punches → evaluateDay each → audit.',
      'Inline "Rebuilt n of m person-day verdict(s) for from → to".',
    ] },
  ],

  data: `**GET /api/attendance/recovery** → \`{ success, devices: [{ device_sn, device_name, lan_ip, is_online, got_today, expected_by_now, verdict: { status, method: lan_pull|check_device|retry_queue|resume_acquisition|none, reason, actionLabel } }], summary: { gaps, watch, … }, queue: { stuck }, staging: { uncommitted } }\`; with \`?banner=1\`: \`{ success, gap, gaps }\`.
**POST /api/attendance/recovery** \`{ action: 'retry_queue' }\` → \`{ success, result: { attempted, delivered, failed, requeued, deferred } }\`.
**POST /api/attendance/historical-repair** \`{ action: 'reevaluate_range', from, to, role?, person_id? }\` → \`{ success, ok, from, to, personDays, reevaluated }\` | 400 (bad range) | 403.

Tables: devices, attendance_raw_events, device acquisition staging, notification_outbox (read); attendance_records (rewritten by evaluateDay); audit log.`,

  states: `- **First load**: centred spinner.
- **Healthy**: green banner; device cards still listed (all ok).
- **No devices**: "No devices registered for this school."
- **Scan error**: error JSON becomes data → empty page (no message).
- **Retry refused**: error toast (403 without attendance.manage).
- **Repair**: button text "Re-evaluating…" while running; inline green result or red error.`,

  security: `- Reading the gap report needs only a session; it shows device names, counts and LAN availability (no personal data).
- Retry queue and historical repair require attendance.manage; repair is blocked during read-only maintenance (withRoute) and audited with the range and counts.
- Retry queue drains the whole platform's outbox, not only this school's (see the page note) — a school-level permission triggers a platform-level job. It sends only messages that were already queued.
- Repair is bounded to 92 days and to the caller's school.`,

  styling: `Tailwind with dark variants; max-w-4xl single column; rose border highlights gap devices. RTL: arrows use \`rtl-flip\` (except the "Review & commit" arrow, which does not flip), Arabic digits through arRecovery/digits; the date inputs use \`ml-1\` (physical margin) rather than \`ms-1\`, so in RTL the gap is on the wrong side.`,

  testing: `- **Tests**: src/lib/attendance/__tests__/recovery.test.mjs (recommendMethod verdicts) and historical-repair.test.mjs (planRange bounds). Run \`npm run test:attendance\`. When a recovery sentence changes, also update arRecovery — no test checks the Arabic mapping.
- **A device shows "gap" but punches are arriving**: compare got_today with /attendance/logs filtered to that device for today; "expected by now" comes from the learned baseline (Time Health → relearn).
- **Repair says 0 of 0**: nobody had punches in the range (or the role filter excluded them) — the tool only revisits days with punches.`,

  extend: [
    { change: 'Add a recovery method', how: 'Add the method to the union and to recommendMethod in src/lib/attendance/recovery.ts, add its sentences to arRecovery (exact or regex), and a case in actionFor. If it performs an action, add it as a POST action with attendance.manage.' },
    { change: 'Scope the queue retry to this school', how: 'Give drainNotificationOutbox an optional schoolId filter (WHERE school_id = ?) and pass session.schoolId from the route; keep the cron unscoped.' },
    { change: 'Repair days without punches', how: 'In reevaluateRange also select the roster (active learners / staff) for each date in the range, not only people with punches — expensive; keep the 92-day bound and consider a background job.' },
  ],
};

export default doc;
