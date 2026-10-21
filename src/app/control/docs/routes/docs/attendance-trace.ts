import type { RouteDoc } from '@/lib/devdocs/route-doc';

const PAGE = 'src/app/attendance/trace/page.tsx';
const API = 'src/app/api/attendance/trace/route.ts';

const doc: RouteDoc = {
  route: '/attendance/trace',
  reviewed: { [PAGE]: 'c470ed4b084d', [API]: '5de9945440e4' },

  identity: {
    purpose: 'Event Explorer + Trace Viewer (Phase 2, "digital twin"): search punches by name or PIN for a day, then open one punch\'s full lifecycle — capture, device, device time, server receive, clock correction, identity, verdict, popup, SMS, audit — as a timeline where the first red stage answers "where did it break?".',
    users: 'Support staff and attendance officers diagnosing a single punch ("why did this parent not get an SMS?").',
    permissions: 'Page: session (middleware). API: session only.',
    upstream: 'attendance_raw_events (the punch, its derived event, popup_at, matched/provisional, source), people, and the stage data gathered by buildPunchTrace (device, clock, verdict, notification_outbox, audit) — src/lib/attendance/trace.ts.',
    downstream: 'Read-only. Deep-linked from /attendance/logs (the branch icon beside each time: /attendance/trace?event=<raw event id>).',
  },

  files: [
    { path: PAGE, role: 'Route entry: search bar, event list, trace timeline. Wrapped in Suspense because it reads useSearchParams.', shared: false },
    { path: API, role: 'GET /api/attendance/trace — the list (q, date) or one trace (event_id).', shared: false },
  ],

  layout: `- **src/middleware.ts** → **AuthenticatedShell** → **MainLayout**; **src/app/attendance/layout.tsx** gradient.
- The default export only renders \`<Suspense>\` around TracePageInner — required in the App Router when a client component calls \`useSearchParams()\`, otherwise static rendering bails out.
- Raw fetch, no toasts. Stage labels and details come from the server in the request language (\`lang\` cookie).`,

  tree: `TracePage › Suspense › TracePageInner     src/app/attendance/trace/page.tsx
  ├─ header: icon · title · subtitle
  ├─ search: text (Enter searches) · date · Search
  └─ grid (1 → 2 columns on lg)
       ├─ event list (max 560 px, scroll): name/PIN · time · #id · device · source · derived event · 3 flag dots
       └─ trace viewer: name · #id · date-time · device · summary chip · <ol> stages (icon · label · time · detail)`,

  notes: {
    [PAGE]: {
      'import:react': '`useState`, `useEffect`, `useCallback`, and `Suspense` for the wrapper.',
      'import:@/lib/datetime/local-date': '`toLocalDateStr()` — browser-local today for the date field.',
      'import:next/navigation': '`useSearchParams` — reads `?event=` for deep links.',
      'import:@/components/i18n/I18nProvider': '`useI18n()` — t, lang, digits, formatDate.',
      'import:lucide-react': 'Icons.',
      STAGE_ICON: 'Icon per stage status: ok (green check), warn (amber), fail (rose X), skip (grey minus), info (sky).',
      STAGE_LINE: 'Timeline connector colour per status.',
      DOT: 'Flag-dot colour per status in the list.',
      TracePageInner: 'The actual page (inside Suspense).',
      'TracePageInner.params': 'URL search parameters.',
      'TracePageInner.{ t, lang, digits, formatDate }': 'i18n helpers.',
      'TracePageInner.clock': 'Hour:minute in the interface language.',
      'TracePageInner.[q, setQ]': 'Search text.',
      'TracePageInner.[date, setDate]': 'Day filter (school-local date; browser today by default). Clearing it searches all days (newest 50).',
      'TracePageInner.[rows, setRows]': 'Event list.',
      'TracePageInner.[loading, setLoading]': 'Search running (spins the button icon).',
      'TracePageInner.[trace, setTrace]': 'The opened trace {event, stages, summary}.',
      'TracePageInner.[traceLoading, setTraceLoading]': 'Trace loading.',
      'TracePageInner.search': 'GET trace?q&date → rows (missing rows → empty). No error message.',
      'TracePageInner.openTrace': 'GET trace?event_id= → set the trace only on success; a 404 leaves the previous trace (or the "select an event" hint) on screen with no message.',
      'TracePageInner.effect#1': 'On mount only: if `?event=` is present open that trace, and run the search for today. The deep-linked punch may be from another day and therefore not appear in the list (its trace still shows).',
      'TracePageInner.render#1': 'Header; search row (Enter or button); two-column grid on large screens — the list (selected row highlighted; three dots = identity / verdict / popup flags) and the viewer (spinner, hint, or the trace with a summary chip "Complete" or the label of the first failing/warning stage, then the stage timeline using a logical start border so it mirrors in RTL).',
      TracePage: 'Default export: Suspense with a spinner fallback around TracePageInner.',
      'TracePage.render#1': 'The Suspense boundary.',
    },
    [API]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      'import:@/lib/attendance/trace': '`buildPunchTrace(school, rawEventId, lang)` — gathers everything about one punch and composes the stages (composeStages, pure) plus traceSummary (first fail, else first warn, else ok); `searchTraceEvents(school, {q, date, limit})` — newest punches matching name (LIKE) or exact PIN, on a school-local date (DATE(punch_at + offset) = date — not index-friendly, scans the school\'s events), limit 1–200 (default 50), with flags identity (ok / warn provisional / fail unmatched), verdict (ok when derived_event, else info), popup (ok when popup_at).',
      'import:@/lib/i18n/localize': '`langFromRequest`.',
      runtime: "'nodejs'.",
      GET: 'Session only, school-scoped.',
      'GET.session': 'Session.',
      'GET.guard#1': 'No session → 401.',
      'GET.sp': 'Query parameters.',
      'GET.guard#2': '`event_id` → one trace or 404 "Event not found" (also for another school\'s id).',
      'GET.rows': 'Explorer list. A non-numeric `limit` would become NaN in the LIMIT clause and fail with 500 (the page never sends one).',
      'GET.return#1': '{success, rows}.',
      'GET.catch#1': '500 with the message.',
    },
  },

  ui: [
    { title: 'Header', text: 'Branch icon, "Event Explorer", subtitle.' },
    { title: 'Search', text: 'Name or PIN (Enter to search), date, Search button.' },
    { title: 'Event list', text: 'Up to 50 punches: name or "PIN n", time, "#id · device · source · derived event", and three dots (identity, verdict, popup) coloured green / amber / red / blue. Click to open.' },
    { title: 'Trace viewer', text: '"Select an event" until one is opened; then the person, event id, date-time and device, a status chip ("Complete" or the failing stage\'s name) and the vertical timeline of stages with icon, label, time and a one-line detail (failures in red).' },
  ],

  interactions: [
    { action: 'Open from /attendance/logs', steps: ['Click the branch icon on a row → /attendance/trace?event=<id> → effect#1 opens that trace and lists today\'s punches.'] },
    { action: 'Search', steps: ['Type a name or PIN, choose a date → Enter / Search → GET ?q&date → list.'] },
    { action: 'Open a trace', steps: ['Click a row → GET ?event_id= → buildPunchTrace → stages + summary → timeline.'] },
  ],

  data: `**GET /api/attendance/trace?q=&date=YYYY-MM-DD&limit=** → \`{ success, rows: [{ id, device_sn, device_user_id, punch_at, matched, person_id, role_type, display_name, derived_event, popup_at, is_provisional, source, flags: { identity, verdict, popup } }] }\`.
**GET /api/attendance/trace?event_id=** → \`{ success, event: { id, name, device_user_id, punch_at, device_sn, … }, stages: [{ key, label, status: ok|warn|fail|skip|info, at?, detail }], summary: { status, failedStage } }\` (TraceStage in trace.ts).`,

  states: `- **Searching**: spinner in the button.
- **No results**: "No events".
- **No trace open**: "Select an event to see its trace".
- **Trace loading**: spinner in the viewer.
- **Errors**: silent (empty list; trace unchanged).`,

  security: `- Session only; the list shows names and PINs of the school's punches, the trace's SMS stage shows the message count, statuses and the provider's last error (no phone number or message body). School-scoped: another school's event id answers 404.`,

  styling: `Tailwind with dark variants; max-w-6xl; list and viewer side by side from lg, stacked below. The timeline uses \`border-s-2\`, \`ps-6\`, \`-start-[9px]\` (logical properties), so it mirrors correctly in RTL. Status is icon + colour + text.`,

  testing: `- **Tests**: src/lib/attendance/__tests__/trace.test.mjs (composeStages / traceSummary). Run \`npm run test:attendance\`.
- **Typical use**: a parent got no SMS → find the punch → the first red stage is identity (unmatched), verdict (not evaluated), or SMS (failed / skipped by policy).`,

  extend: [
    { change: 'Add a stage', how: 'Gather its data in buildPunchTrace, add it to TraceInput, emit it from composeStages (with English and Arabic text) in pipeline order, and add a case to trace.test.mjs. The viewer renders any stage generically.' },
    { change: 'Make the date filter fast', how: 'Replace DATE(punch_at + offset) = ? with a UTC range (punch_at >= start AND < end, computed from the offset) so the (school_id, punch_at) index is used.' },
  ],
};

export default doc;
