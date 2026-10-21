import type { RouteDoc } from '@/lib/devdocs/route-doc';

const PAGE = 'src/app/attendance/lessons/page.tsx';
const API_LIST = 'src/app/api/attendance/lessons/route.ts';
const API_ONE = 'src/app/api/attendance/lessons/[occurrenceId]/route.ts';

const doc: RouteDoc = {
  route: '/attendance/lessons',
  reviewed: { [PAGE]: 'db51e64abd37', [API_LIST]: '321a09a65a98', [API_ONE]: '6fa8fde55aad' },

  identity: {
    purpose: 'Per-lesson attendance: the day\'s lessons from the timetable, each with an automatic roster built from enrolment + timetable + biometric punches. Teachers follow up only on the exceptions (pending, absent, late, not biometrically enrolled, single check-in) and correct a learner with a recorded reason. Separate from school-entry attendance (attendance_records) and from teacher attendance.',
    users: 'Teachers (see only the lessons they teach — matched through their staff record) and configure-level users (see every lesson of the school).',
    permissions: 'All checks are in requireLessonAccess (src/lib/attendance/lessons/access.ts): session → attendance module enabled → view: attendance.lessons.view | attendance.view | admin role; correct: attendance.lessons.correct | attendance.manage | admin; "sees all" = attendance.lessons.configure | admin. Teachers can only open/correct lessons where they are the teacher (otherwise 404).',
    upstream: 'Lesson policy (lesson_attendance_settings — the feature is off unless enabled), the timetable (materialised into lesson_occurrences per date), class enrolments, biometric punches (attendance_raw_events) and enrolment capability (can the learner punch).',
    downstream: 'Writes lesson_occurrences (materialised on read), lesson_attendance (computed verdicts and manual corrections) and audit rows LESSON_ATTENDANCE_CORRECTED / _REVERTED. Configured on /attendance/settings (LessonAttendanceSettings component → /api/attendance/lessons/settings).',
  },

  files: [
    { path: PAGE, role: 'Route entry: date picker, lesson cards, the roster table of the opened lesson, and the correction dialog. Styled with inline styles (no Tailwind).', shared: false },
    { path: API_LIST, role: 'GET /api/attendance/lessons — the day\'s lessons with per-status counts.', shared: false },
    { path: API_ONE, role: 'GET/POST /api/attendance/lessons/:occurrenceId — one lesson\'s roster, and one learner\'s correction.', shared: false },
  ],

  layout: `- **src/middleware.ts** — session or /login.
- **src/app/layout.tsx** → AuthenticatedShell → MainLayout (sidebar "Attendance → Lessons").
- **src/app/attendance/layout.tsx** — gradient background only.

The page uses raw \`fetch\` (not SWR, not apiFetch), so the global fetcher's error toasts do not apply: every failure message on this page is raised by the page itself.`,

  tree: `LessonAttendancePage                       src/app/attendance/lessons/page.tsx
  ├─ header: title · <input type=date> · scope label (mine / all)
  ├─ loading line | disabled notice | empty/note card
  ├─ lesson cards grid (one <button> per lesson)
  │    subject · class stream · time range · room · [teacher] · 5 count pills
  ├─ roster card (when a lesson is open)
  │    ├─ summary: expected · present/late/absent/excused · unaccounted · exceptions · filter toggle
  │    └─ table: learner · status · first punch · notes · [Correct]
  └─ correction dialog (when editing): status select (+ "undo" for manual rows) · reason · Save
  data: fetch /api/attendance/lessons?date= ; fetch /api/attendance/lessons/:id (GET, POST)`,

  notes: {
    [PAGE]: {
      'import:react': '`useState`, `useEffect`, `useCallback`, `useMemo`. No data library — loads are explicit functions.',
      'import:@/lib/toast': '`showToast` for open/save errors and the save confirmation.',
      'import:@/components/i18n/I18nProvider': '`useI18n()` — t, lang, digits, formatDate.',
      Status: "'present' | 'late' | 'absent' | 'excused' | 'pending' — pending = no verdict yet (\"not yet accounted for\").",
      Lesson: 'A lesson card: occurrence id, date, start/end as epoch ms, period, room, class, stream, subject, teacher, and counts per status.',
      Row: 'A roster line: person (people.id), name, admission number, status, source (\'manual\' when corrected), first punch time, minutes late, punch count, exception code, correction reason, canPunch (has a biometric enrolment).',
      Summary: 'Roster totals from the server: expected, per status, unaccounted, exceptions.',
      COLORS: 'Background/text colour per status (hex, used inline). The `label` field is unused — labels are translated.',
      EXC: 'Known exception codes. Used only to decide whether to translate the code (`attendancePages.lessons.exc.<code>`); unknown codes are shown raw. The English values are not rendered.',
      fmtTime: 'Epoch ms → "HH:MM" in the browser\'s locale and timezone.',
      todayISO: 'Today as YYYY-MM-DD in the browser\'s timezone (subtracting the timezone offset before toISOString).',
      LessonAttendancePage: 'The route\'s default export.',
      'LessonAttendancePage.{ t, lang, digits, formatDate }': 'i18n helpers.',
      'LessonAttendancePage.tm': 'Time formatter: Arabic → formatDate with hour/minute (Arabic digits), else fmtTime.',
      'LessonAttendancePage.[date, setDate]': 'Selected day; starts at the browser\'s today.',
      'LessonAttendancePage.[lessons, setLessons]': 'Cards for the day.',
      'LessonAttendancePage.[enabled, setEnabled]': 'False when the school has lesson attendance switched off (server `enabled: false`).',
      'LessonAttendancePage.[scope, setScope]': "'mine' or 'all' — from the server, shown beside the date.",
      'LessonAttendancePage.[note, setNote]': 'Server note (e.g. "Your account is not linked to a staff record") or error text, shown in the empty card.',
      'LessonAttendancePage.[loading, setLoading]': 'Lesson list loading.',
      'LessonAttendancePage.[openId, setOpenId]': 'Opened lesson (highlighted card + roster).',
      'LessonAttendancePage.[roster, setRoster]': 'The opened lesson\'s {roster, summary, occurrence} (policy is also returned but unused).',
      'LessonAttendancePage.[rosterLoading, setRosterLoading]': 'Roster loading ("Building roster…").',
      'LessonAttendancePage.[filter, setFilter]': "'follow' (default: only rows needing attention) or 'all'.",
      'LessonAttendancePage.[editing, setEditing]': 'The roster row being corrected (opens the dialog).',
      'LessonAttendancePage.[newStatus, setNewStatus]': "Chosen status, or 'auto' = remove the manual correction and recompute.",
      'LessonAttendancePage.[reason, setReason]': 'Correction reason (required, ≥ 3 characters on both sides).',
      'LessonAttendancePage.[busy, setBusy]': 'Save in flight.',
      'LessonAttendancePage.loadLessons': 'GET /api/attendance/lessons?date=. Reads `enabled`, `lessons`, `scope` and `note` (or `error`) from the JSON regardless of HTTP status — a 403 therefore shows its error message in the empty card rather than a toast. A network failure sets a "load failed" note. Memoised on `date` only (the `t` used in the catch can be from an earlier language).',
      'LessonAttendancePage.effect#1': 'Whenever the date changes (through loadLessons\' identity): reload lessons and close any open roster.',
      'LessonAttendancePage.openLesson': 'Select the lesson, clear the old roster, GET /api/attendance/lessons/:id. `success` → show; otherwise toast the server error (403/404). The server RECOMPUTES the lesson\'s verdicts from punches on every open when auto-roster is on, so opening a lesson is also how its roster refreshes.',
      'LessonAttendancePage.submit': 'POST /api/attendance/lessons/:id {personId, status, reason}. Not OK → toast the server error (403 without the correct permission; 400 for a short reason or bad status). OK → success toast, close the dialog, reload this roster and the lesson list (so card counts update).',
      'LessonAttendancePage.shown': "Rows to display: in 'follow' mode only pending, absent, late, or rows with an exception; else all.",
      'LessonAttendancePage.card': 'Inline card style: white background, slate text, light border. Fixed light colours — the page does not follow dark mode.',
      'LessonAttendancePage.btn': 'Inline button style.',
      'LessonAttendancePage.render#1': 'Header with date and scope; loading / disabled / empty states; a responsive grid of lesson cards (auto-fill, min 250 px), each showing subject · class stream, time range · room (· teacher when scope is all) and five count pills; the roster card with the summary line, the follow/everyone toggle and the table (status pill with minutes late, "corrected" for manual rows, first punch time, exception or reason, Correct); the fixed-position correction dialog (status select, "undo correction" option only for manual rows, reason, Save disabled until 3 characters).\n\nThe Correct button is shown to everyone who can view; users without the correct permission get a 403 toast on Save.',
    },

    [API_LIST]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/attendance/lessons/access': '`requireLessonAccess(req, need)` → LessonSession {userId, schoolId, staffId, seesAll} or an error response; `isResponse` tells them apart.',
      'import:@/lib/attendance/lessons/service': '`getLessonPolicy(school)` (cached 30 s; disabled defaults if the table does not exist) and `listLessonsForDay(school, date, {teacherStaffId, classId})`.',
      'import:@/lib/attendance/device-clock': '`resolveTimePolicy` — the school\'s UTC offset for the default date.',
      'import:@/lib/attendance/lessons/engine': '`localDateOf(ms, offset)` — school-local date of an instant.',
      runtime: "'nodejs'.",
      maxDuration: '60 s — materialising and counting a full day can be slow on a large school.',
      GET: 'The day\'s lessons.',
      'GET.s': 'Lesson session (view permission).',
      'GET.guard#1': 'Not signed in (401), module off, or no view permission (403) → that response.',
      'GET.tp': 'Time policy.',
      'GET.q': '`?date=`.',
      'GET.date': 'Valid YYYY-MM-DD, else the school\'s today.',
      'GET.classId': 'Optional class filter (not sent by the page).',
      'GET.policy': 'Lesson policy.',
      'GET.guard#2': 'Feature disabled → {enabled: false, lessons: []}.',
      'GET.mineOnly': 'Not a "sees all" user → only own lessons.',
      'GET.guard#3': 'Teacher view but the user has no staff record → empty list with a note.',
      'GET.lessons': 'listLessonsForDay: ensureOccurrences materialises (idempotently) the timetable\'s lessons for that date into lesson_occurrences — **a GET that writes**; occurrences that already hold attendance are frozen so timetable edits never rewrite history. Then names (class, stream, subject, teacher) and counts per status from lesson_attendance.\n\nCounts include only learners that HAVE a lesson_attendance row; learners never evaluated are not in any pill, so the five pills need not add up to the class size (the roster\'s "unaccounted" covers them).',
      'GET.return#1': '{success, enabled, date, scope, lessons}.',
    },

    [API_ONE]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/attendance/lessons/access': 'Permission gate (see the list route).',
      'import:@/lib/attendance/lessons/service': '`getOccurrence`, `buildRoster` (recompute + roster + summary), `correctLessonAttendance` (manual verdict or revert, audited).',
      runtime: "'nodejs'.",
      maxDuration: '60 s.',
      Ctx: 'Route context; params is a Promise in Next 15.',
      parseId: 'Positive integer or null.',
      'parseId.n': 'Number(v).',
      'parseId.return#1': 'Valid id or null.',
      GET: 'One lesson\'s roster.',
      'GET.s': 'Lesson session (view).',
      'GET.guard#1': 'Gate failed → its response.',
      'GET.id': 'Occurrence id.',
      'GET.guard#2': 'Invalid → 400.',
      'GET.occ': 'Occurrence, school-scoped.',
      'GET.guard#3': 'Missing, or a teacher asking for someone else\'s lesson → 404 (not 403, so existence is not revealed).',
      'GET.roster': 'buildRoster: loads the class (and stream) learners, recomputes the day\'s lesson verdicts when policy is enabled with auto-roster (manual rows are never overwritten), then one row per learner — status (default pending), source, first punch, minutes late, punch count, exception (`not_biometrically_enrolled` when the learner cannot punch), reason — sorted by name, plus the summary.',
      'GET.guard#4': 'Roster could not be built → 404.',
      'GET.return#1': '{success, occurrence, policy, roster, summary}.',
      POST: 'Correct one learner on one lesson.',
      'POST.s': 'Lesson session (correct permission).',
      'POST.guard#1': 'Gate failed → its response (403 without attendance.lessons.correct / attendance.manage / admin).',
      'POST.id': 'Occurrence id.',
      'POST.guard#2': 'Invalid → 400.',
      'POST.occ': 'Occurrence.',
      'POST.guard#3': 'Missing or not the teacher\'s lesson → 404.',
      'POST.body': 'JSON body (invalid → null).',
      'POST.personId': 'people.id of the learner.',
      'POST.guard#4': 'Missing person or status → 400.',
      'POST.r': 'correctLessonAttendance: the learner must be on this lesson\'s roster (404 otherwise). `auto` deletes the manual row, recomputes that learner and audits LESSON_ATTENDANCE_CORRECTION_REVERTED. Otherwise the status must be present/late/absent/excused (400) and the reason ≥ 3 characters (400); upsert with source=manual, corrected_by/at, exception cleared; audit LESSON_ATTENDANCE_CORRECTED with from/to and reason.',
      'POST.guard#5': 'Refused → its status and error.',
      'POST.return#1': '{success: true}.',
    },
  },

  ui: [
    { title: 'Header', text: 'Title, a date input, and "Your lessons" / "All lessons" depending on the server\'s scope.' },
    { title: 'Status messages', text: '"Loading…"; amber card when lesson attendance is switched off for the school; a card with the server note or "No lessons scheduled" when the day has none.' },
    { title: 'Lesson cards', text: 'Grid of cards, one per lesson: subject · class (stream), start–end time · room (· teacher in all-lessons view), and five pills — present, late, absent, excused, not yet accounted for. The open lesson has a blue outline.' },
    { title: 'Roster', text: 'Summary line: expected learners, four status pills, "N unaccounted", "N exceptions" (amber) and a toggle between "needs follow-up" and "everyone". Table: learner (admission number below), status pill (late shows minutes; "corrected" note for manual rows), first punch time, notes (exception in amber, else the correction reason), Correct button. "Everyone is accounted for" when the filtered list is empty.' },
    { title: 'Correction dialog', text: '"Correct <name>": status select (present / late / absent / excused, plus "undo correction" for manually corrected rows), reason textarea, Cancel / Save (disabled until the reason has 3 characters).' },
  ],

  interactions: [
    { action: 'Open the page', steps: [
      'GET /api/attendance/lessons?date=<browser today> → requireLessonAccess(view) → policy → ensureOccurrences (materialise today\'s timetable) → names + counts.',
      'Cards render; nothing is open.',
    ] },
    { action: 'Open a lesson', steps: [
      'Click a card → openLesson(id) → GET /api/attendance/lessons/:id.',
      'Server: teacher ownership check → load class learners → recompute verdicts from punches (auto-roster) → roster + summary.',
      'Roster card shows the follow-up rows.',
    ] },
    { action: 'Correct a learner', steps: [
      'Correct → dialog (status pre-set to present for pending rows, else the current status) → type a reason → Save.',
      'POST {personId, status, reason} → requireLessonAccess(correct) → ownership → correctLessonAttendance (roster membership, status, reason) → upsert manual row → audit.',
      'Toast → roster reloaded (and recomputed) → lesson list reloaded so the card counts change.',
    ] },
    { action: 'Undo a correction', steps: [
      'Correct on a "corrected" row → choose "undo correction" → reason → Save → POST status=auto → manual row deleted, learner recomputed, revert audited.',
    ] },
    { action: 'Change the date', steps: [
      'Date input → setDate → loadLessons changes → effect#1 reloads lessons and closes the roster. Lessons for a future date are materialised as soon as they are viewed.',
    ] },
  ],

  data: `**GET /api/attendance/lessons?date=YYYY-MM-DD[&classId=]** → \`{ success, enabled, date, scope: 'mine'|'all', lessons: [{ id, lessonDate, startMs, endMs, periodName, room, classId, streamId, subjectId, teacherId, className, streamName, subjectName, teacherName, counts {present, late, absent, excused, pending} }], note? }\` (occurrence fields beyond those the page uses come from the Occurrence interface in service.ts).

**GET /api/attendance/lessons/:id** → \`{ success, occurrence, policy, roster: RosterRow[], summary: {expected, present, late, absent, excused, pending, unaccounted, exceptions} }\`. RosterRow adds \`studentId\` to the page's Row type.

**POST /api/attendance/lessons/:id** body \`{ personId, status: 'present'|'late'|'absent'|'excused'|'auto', reason }\` → \`{ success: true }\` or \`{ error }\` with 400/403/404.

Tables: lesson_attendance_settings (policy), lesson_occurrences, lesson_attendance (unique occurrence + person; source policy|manual), the timetable tables (via ensureOccurrences), students, people, enrollments, staff, classes, streams, subjects, attendance_raw_events and biometric enrolments (via computeLessonDay / loadClassLearners), audit log.`,

  states: `- **Loading**: "Loading…" for the list; "Building roster…" inside the roster card.
- **Feature off**: amber card; no cards.
- **No lessons / no staff record**: the card shows the server note or "No lessons scheduled".
- **List request fails**: network → "Could not load lessons" note; HTTP error (403/500 JSON) → its \`error\` text in the note.
- **Roster fails**: error toast; the roster card stays empty.
- **Save fails**: error toast with the server reason; the dialog stays open.
- **Everyone accounted for**: one-line message in the table.`,

  security: `- All three handlers go through requireLessonAccess: session, attendance module, permission (view or correct), then the "sees all" flag.
- **Ownership**: a user without the configure permission (or admin role) sees and edits only lessons where \`teacher_id\` equals their staff id; another teacher's lesson answers 404.
- **Corrections** need attendance.lessons.correct or attendance.manage (or admin), a reason of at least 3 characters (checked on the server, not only in the dialog), and the learner must be on the lesson's roster. Every correction and revert is audited with the reason; manual rows are never overwritten by recomputation.
- **Writes on read**: listing materialises lesson occurrences and opening a lesson recomputes verdicts. Both are idempotent upserts, so repeated reads converge.
- School scoping: occurrences, rosters and corrections are all filtered by the session's school.`,

  styling: `Inline style objects (\`card\`, \`btn\`, COLORS hex values) instead of Tailwind. Consequences: fixed light colours in dark mode (white cards, slate text); no responsive breakpoints except the auto-fill grid (cards ≥ 250 px, wrapping) and the horizontally scrollable table; the dialog is a fixed 380 px wide box (narrower phones scroll). RTL: \`textAlign: 'start'\` and \`marginInlineStart\` are used, so cards and the select align correctly; times use Arabic digits through formatDate. Status is always text plus colour.`,

  testing: `- **Existing tests**: src/lib/attendance/__tests__/lesson-engine.test.mjs (the pure verdict engine) and lesson-isolation.test.mjs (static guards: tenant scoping, permission gating, and that lessons never touch the school-entry pipeline's outputs). Run \`npm run test:attendance\`.
- **No lessons appear**: confirm lesson attendance is enabled (lesson_attendance_settings.enabled = 1), the timetable has entries for that weekday, and — for a teacher — that the user is linked to a staff record that teaches them.
- **Everyone pending**: auto_roster off, or no punches yet; check attendance_raw_events for the learners and the policy's check-in window.
- **Correction refused**: read the toast — 403 permission, 400 reason/status, 404 not on roster / not your lesson.`,

  extend: [
    { change: 'Add a class filter to the page', how: 'The API already accepts `classId`. Add a select (classes from /api/classes), include `&classId=` in loadLessons\' URL and its deps.' },
    { change: 'Support dark mode', how: 'Replace the inline `card`/`btn` styles with Tailwind classes (bg-white dark:bg-slate-800, borders, text colours) like the other attendance pages; keep COLORS for the pills or map them to Tailwind status classes.' },
    { change: 'Bulk-mark a lesson', how: 'Add a server action that loops correctLessonAttendance for the chosen people (same permission, reason and audit per row), not a client loop — so the audit carries one reason and the roster check applies to each.' },
    { change: 'Change late/absent timing', how: 'Do not touch the page — the windows (check-in before, grace, late until, minimum presence, absent finalise delay) are the lesson policy, saved through saveLessonPolicy and applied by the engine.' },
  ],
};

export default doc;
