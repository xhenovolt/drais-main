import type { RouteDoc } from '@/lib/devdocs/route-doc';

const PAGE = 'src/app/attendance/health/page.tsx';
const API_HEALTH = 'src/app/api/attendance/health/route.ts';
const API_DIGEST = 'src/app/api/attendance/digest/route.ts';

const doc: RouteDoc = {
  route: '/attendance/health',
  reviewed: { [PAGE]: '7f0cdbb23d49', [API_HEALTH]: '41222b5217f7', [API_DIGEST]: '4241833b55b0' },

  identity: {
    purpose: 'Attendance Health Center: answers "is attendance working right now?" without SQL — a weighted overall score, ten pipeline check cards (devices, heartbeats, punch flow, device time, SMS, identity, notification queue, background jobs, database, device clock reputation) and recommendations worst-first, refreshed every 30 s. Also hosts the daily attendance digest control (mode, preview, send now).',
    users: 'School administrators and attendance officers; support staff diagnosing a school.',
    permissions: 'Page: session (middleware). GET /api/attendance/health: session only. GET /api/attendance/digest: session (withRoute default). POST /api/attendance/digest: attendance.manage (withRoute permission).',
    upstream: 'runHealthChecks (src/lib/attendance/health.ts) reads devices, heartbeats, attendance_raw_events, device clock health, notification_outbox, background-job state and identity data for the school; the digest preview reuses /api/attendance/intelligence-summary.',
    downstream: 'Digest mode is stored in school_settings (attendance.digest_mode) and read by the daily digest cron; "Send now" creates in-app notifications for school admins. Every health GET also kicks the throttled background intelligence sweep (clock health + baselines).',
  },

  files: [
    { path: PAGE, role: 'Route entry: header with live toggle and re-check, DigestControl, overall score card, check cards grid.', shared: false },
    { path: API_HEALTH, role: 'GET /api/attendance/health — the report.', shared: false },
    { path: API_DIGEST, role: 'GET/POST /api/attendance/digest — digest mode, preview, send now.', shared: false },
  ],

  layout: `- **src/middleware.ts** → **AuthenticatedShell** → **MainLayout**; **src/app/attendance/layout.tsx** paints the gradient.
- No SWR: both components fetch with raw \`fetch\` and keep their own state; nothing on this page shows a toast. The only user-facing message box is a native \`alert()\` after "Send now".
- \`t\` is called with a third argument — the English fallback (\`t(key, vars, fallback)\`) — so a missing translation still shows English.`,

  tree: `AttendanceHealthPage                       src/app/attendance/health/page.tsx
  ├─ header: icon · title · subtitle · [Live refresh (30s)] checkbox · Re-check
  ├─ DigestControl(t)                       own fetch /api/attendance/digest
  │    title · subtitle · mode <select> · Send now · preview line
  ├─ overall card: score % (colour by band) · status badge · recommendations | "all normal" · checked at
  └─ check cards grid (1 → 2 → 3 columns): icon · label · status icon · score % · status badge · detail · → recommendation
       (6 pulsing skeletons on first load)
  data: fetch /api/attendance/health (on mount, Re-check, every 30 s while live)`,

  notes: {
    [PAGE]: {
      'import:react': '`useState`, `useEffect`, `useCallback`, `useRef` (interval handle).',
      'import:lucide-react': 'Icons for the header, statuses and each check.',
      'import:@/components/i18n/I18nProvider': '`useI18n()` — t (with English fallback as 3rd argument), lang, digits, formatDate.',
      TFn: 'Type of `t` as passed down to DigestControl.',
      CHECK_ICON: 'Icon per check key (devices, heartbeat, flow, time, sms, identity, queue, jobs, db, device_rep). Unknown keys get the Activity icon.',
      STATUS_STYLE: 'Badge classes and icon per status: healthy (green), degraded (amber), critical (rose), unknown (grey).',
      AttendanceHealthPage: 'The route\'s default export.',
      'AttendanceHealthPage.{ t, lang, digits, formatDate }': 'i18n helpers.',
      'AttendanceHealthPage.pct': 'Percentage text; Arabic digits and ٪ in Arabic.',
      'AttendanceHealthPage.[data, setData]': 'The last report (whatever JSON the API returned — also an error body).',
      'AttendanceHealthPage.[loading, setLoading]': 'A request is running (spins the Re-check icon; shows skeletons on the first load).',
      'AttendanceHealthPage.[live, setLive]': 'Auto refresh on (default).',
      'AttendanceHealthPage.timer': 'Interval handle, kept in a ref so the effect can clear it.',
      'AttendanceHealthPage.load': 'GET /api/attendance/health (no-store) → setData(JSON). No status check and no catch: a network failure leaves the old data and logs an unhandled rejection; a 401/500 body replaces the data (score becomes "—", cards disappear).',
      'AttendanceHealthPage.effect#1': 'Load once on mount.',
      'AttendanceHealthPage.effect#2': 'Start/stop the 30 s interval when `live` changes; cleared on unmount. Each tick runs all ten checks on the server (and kicks the sweep) — an open tab costs a full health run every 30 s.',
      'AttendanceHealthPage.score': 'Overall weighted score or null.',
      'AttendanceHealthPage.overall': 'Overall status.',
      'AttendanceHealthPage.scoreColor': '≥ 90 green, ≥ 70 amber, else rose; grey while null.',
      'AttendanceHealthPage.render#1': 'Header (live checkbox, Re-check with aria-label); DigestControl; the overall card — big score (tabular numerals, Arabic digits), status badge (Healthy / Degraded / Needs attention / …), recommendations list or the green "everything normal" line, and "Checked <time>"; then the check cards (score hidden as "—" for unknown checks; the recommendation only when not healthy), with six pulsing placeholders while the first load runs.',
      DigestControl: 'Daily digest settings: mode (issues only / every day / off), a live preview of what would be sent today, and Send now. Renders nothing until its GET succeeds (or if it fails).',
      'DigestControl.[data, setData]': '{success, mode, preview}.',
      'DigestControl.[busy, setBusy]': 'Disables the select and button during requests.',
      'DigestControl.load': 'GET /api/attendance/digest; errors ignored (the control just stays hidden).',
      'DigestControl.effect#1': 'Load on mount.',
      'DigestControl.setMode': 'POST {mode} then reload. The response is not checked: without attendance.manage the POST is refused (403) silently and the reload puts the select back to the stored mode.',
      'DigestControl.sendNow': 'POST {action: "send"} → `alert()` "Digest sent to N school(s)" or the error.\n\n**[defect]** The server runs `sendDailyDigests()` — the CRON entry that loops over **every school** with punches in the last 30 days — not just the caller\'s school. One school admin\'s click therefore sends the digest to all active schools\' admins (deduped once per school per day), and because of that dedupe the real scheduled digest is then skipped everywhere for the day. The "N school(s)" in the alert is the platform count, which is how this shows up.',
      'DigestControl.guard#1': 'No data → render nothing.',
      'DigestControl.p': 'Preview digest {title, hasIssues, items, …} or null.',
      'DigestControl.render#1': 'Card: title and subtitle, mode select (aria-label), Send now; preview line "<title>. N item(s) would be sent." or "Nothing to send today."',
    },

    [API_HEALTH]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      'import:@/lib/attendance/health': '`runHealthChecks(school, lang)` — ten guarded checks (a failing check becomes "unknown" with the error as detail, never a 500), each {key, label, weight, score 0–100, status by band (≥ 90 healthy, ≥ 70 degraded, else critical), detail, recommendation}; overall = weight-averaged score of the non-unknown checks; recommendations sorted worst score first. Text is English or Arabic (with Arabic digits) by `lang`.',
      'import:@/lib/i18n/localize': '`langFromRequest`.',
      'import:@/lib/attendance/intelligence-sweep': '`sweepSchoolIntelligenceInBackground` — throttled, not awaited.',
      runtime: "'nodejs'.",
      GET: 'Run the health report for the caller\'s school. Session only.',
      'GET.session': 'Session.',
      'GET.guard#1': 'No session → 401.',
      'GET.report': 'Kick the sweep, then run the checks (school-local "today" from the time policy, 180 min fallback).',
      'GET.return#1': '{success, score, status, checks, recommendations, generated_at}.',
      'GET.catch#1': '500 with the message (only for failures outside the per-check guards).',
    },

    [API_DIGEST]: {
      'import:@/lib/api/with-route': '`withRoute(options?, handler)` — wraps a handler with session auth (401), optional permission (403), read-only-maintenance blocking of writes (503), a try/catch error envelope (statusCode on the error → that status), and gives the handler `{req, session, body()}`.',
      'import:@/lib/db': '`query`.',
      'import:@/lib/attendance/digest': '`buildAttendanceDigest(summary)` (pure: summary → {title, message, items, hasIssues, priority}) and `sendDailyDigests()` (the cron: every school with recent punches → mode, dedupe, build, notify admins in-app).',
      runtime: "'nodejs'.",
      badRequest: 'Error tagged statusCode 400 so withRoute answers 400.',
      'badRequest.e': 'The error.',
      'badRequest.return#1': 'The error (thrown by the caller).',
      GET: 'Mode (default issues_only) + a preview. The preview is built by calling this app\'s own /api/attendance/intelligence-summary over HTTP with the caller\'s cookie (server-to-self request; any failure → preview null). Session only.',
      POST: 'attendance.manage. `{action: "send"}` → sendDailyDigests() for ALL schools (see the defect on the page note). `{mode}` → validate (400 otherwise) and upsert school_settings attendance.digest_mode for the caller\'s school.',
    },
  },

  ui: [
    { title: 'Header', text: 'Activity icon, "Attendance Health Center", subtitle; a "Live refresh (30s)" checkbox and a Re-check button whose icon spins while checking.' },
    { title: 'Digest card', text: '"Daily attendance digest", a one-line explanation, mode select (Only when there are issues / Every day / Off), Send now, and a preview: digest title and how many items would be sent, or "Nothing to send today".' },
    { title: 'Overall card', text: 'Large percentage coloured green/amber/rose, status badge, recommendations (worst first) with warning icons — or "Everything is operating normally" — and "Checked HH:MM:SS".' },
    { title: 'Check cards', text: 'Ten cards in a 1/2/3-column grid: icon and name, status icon, score % (or — when unknown), status badge, a one-line detail, and an amber "→ recommendation" when not healthy.' },
  ],

  interactions: [
    { action: 'Open the page', steps: [
      'load(): GET /api/attendance/health → kick background sweep → runHealthChecks → report → cards.',
      'DigestControl: GET /api/attendance/digest → mode + preview (via intelligence-summary).',
      'Every 30 s while "Live refresh" is ticked: load() again.',
    ] },
    { action: 'Re-check', steps: ['Click → load() → fresh report (icon spins).'] },
    { action: 'Change digest mode', steps: ['Select → POST {mode} (attendance.manage) → school_settings upsert → GET again → select shows the stored mode.'] },
    { action: 'Send now', steps: [
      'Click → POST {action: send} → withRoute (attendance.manage, not in read-only maintenance) → sendDailyDigests() over every active school → in-app notifications to each school\'s admins (once per school per day).',
      'alert("Digest sent to N school(s).").',
    ] },
  ],

  data: `**GET /api/attendance/health** → \`{ success, score, status: healthy|degraded|critical, checks: [{ key, label, weight, score, status: healthy|degraded|critical|unknown, detail, recommendation|null }], recommendations: string[], generated_at }\`.

**GET /api/attendance/digest** → \`{ success, mode: issues_only|daily|off, preview: { title, message, items: [{text, route, severity}], hasIssues, priority } | null }\`.
**POST /api/attendance/digest** \`{ mode }\` → \`{ success, mode }\`; \`{ action: 'send' }\` → \`{ success, schools, sent }\`.

Tables: devices, attendance_raw_events, device clock health, notification_outbox and others read by the checks; school_settings (attendance.digest_mode); notifications (digest dedupe and delivery).`,

  states: `- **First load**: score "—", badge "…", six pulsing card placeholders.
- **API error / signed out**: the error JSON becomes the data → score "—", no cards, no message.
- **Network failure**: previous report stays; nothing tells the user.
- **A single check fails**: that card shows "—" and the error text as its detail; the overall score ignores it.
- **Digest unavailable**: the digest card is simply absent.
- **Digest mode refused**: the select snaps back after the reload, silently.`,

  security: `- The health report is visible to any signed-in user of the school (session only); it exposes operational detail (device counts, queue sizes, error text), not personal data.
- Digest mode and Send now require attendance.manage (withRoute) and are blocked during read-only maintenance.
- **[defect] Cross-school action**: Send now calls the cron's sendDailyDigests(), which iterates every school — a permission in ONE school triggers digests for ALL schools. Fix: add a per-school sender (sendDigestForSchool(session.schoolId)) and call that from the route.
- The digest GET forwards the caller's cookie to the app's own intelligence-summary endpoint, so the preview has exactly the caller's access.`,

  styling: `Tailwind gray/indigo with dark variants; max-w-5xl; card grid 1 → 2 (sm) → 3 (lg) columns; tabular numerals for scores. Status colour is always paired with a word and an icon. RTL: Arabic digits and ٪ via \`pct\`/\`digits\`, flex layouts with gaps; the "→" before recommendations does not flip.`,

  testing: `- **Tests**: src/lib/attendance/__tests__/health.test.mjs (the pure rollup computeOverallHealth) and digest.test.mjs (buildAttendanceDigest). Run \`npm run test:attendance\`. No route or page tests — nothing would catch the cross-school Send now.
- **A check is red**: its detail and recommendation say what to do; the same data sources are the Devices, Time Health, Recovery and SMS pages.
- **Score not changing**: untick live refresh, press Re-check, compare generated_at.`,

  extend: [
    { change: 'Add an eleventh check', how: 'In runHealthChecks add `await guard(async () => check(key, label, weight, score, detail, recommendation), key, label, weight)` with English + Arabic text via L(); add the Arabic label to the label map at the top of health.ts and an icon to CHECK_ICON. The overall score and recommendations pick it up automatically.' },
    { change: 'Make Send now school-scoped', how: 'Extract the per-school body of sendDailyDigests into sendDigestForSchool(schoolId, {force}) and call it with session.schoolId from POST; keep the cron calling the loop.' },
    { change: 'Show errors', how: 'Check `r.ok` in load()/setMode and show showToast("error", …) instead of replacing the data with an error body.' },
  ],
};

export default doc;
