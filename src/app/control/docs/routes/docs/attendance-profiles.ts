import type { RouteDoc } from '@/lib/devdocs/route-doc';

const PAGE = 'src/app/attendance/profiles/page.tsx';
const API_PROFILES = 'src/app/api/attendance/person-profiles/route.ts';
const API_HYGIENE = 'src/app/api/attendance/roster-hygiene/route.ts';

const doc: RouteDoc = {
  route: '/attendance/profiles',
  reviewed: { [PAGE]: 'b0a134ff947e', [API_PROFILES]: '7e678757a32c', [API_HYGIENE]: 'b5db74831e30' },

  identity: {
    purpose: 'Attendance Profiles — DRAIS\'s view of individuals: a watch-list of staff or learners whose attendance needs attention (frequently absent, declining, chronically late) with a behavioural label and a plain-language note each; a roster review of people who were tracked but never present (likely former/unenrolled), with reversible bulk deactivate/reactivate; a one-click fix for learners actively enrolled but not marked active; and everyone\'s profile on demand.',
    users: 'Head teachers, HR / bursar for staff, attendance officers.',
    permissions: 'Page: session (middleware). GET person-profiles and GET roster-hygiene: session. POST roster-hygiene (deactivate, reactivate, fix mismatch): attendance.manage via withRoute.',
    upstream: 'attendance_records (verdict per person per day) → profilePerson (src/lib/attendance/person-intelligence.ts, pure); students / staff / enrollments for roster hygiene.',
    downstream: 'students.status / staff.status changes (active ⇄ inactive), audited (ROSTER_DEACTIVATE, ROSTER_REACTIVATE, ROSTER_ENROLLMENT_FIX). Inactive people drop out of rosters that filter on status (attendance population, lists elsewhere). The same profiles feed the daily digest\'s watch/roster counts.',
  },

  files: [
    { path: PAGE, role: 'Route entry: role/window controls, summary tiles, watch-list, RosterReview, EnrollmentMismatchFixer, "show everyone".', shared: false },
    { path: API_PROFILES, role: 'GET /api/attendance/person-profiles — profiles grouped into watch-list / roster review / all.', shared: false },
    { path: API_HYGIENE, role: 'GET/POST /api/attendance/roster-hygiene — mismatch count; deactivate / reactivate / fix mismatch.', shared: false },
  ],

  layout: `- **src/middleware.ts** → **AuthenticatedShell** → **MainLayout**; **src/app/attendance/layout.tsx** gradient.
- SWR with a page-local no-store fetcher (no toasts); writes use raw fetch and report errors with \`alert()\`.
- The server sends behaviour labels and notes in English; the page rebuilds them in Arabic from the profile's numbers (Row).`,

  tree: `AttendanceProfiles                         src/app/attendance/profiles/page.tsx
  ├─ header: icon · title · subtitle · [Staff|Learners] · 30/60/90 days
  ├─ spinner (first load)
  ├─ summary tiles ×3: frequently absent · declining · chronically late
  ├─ watch-list card — Row(p) per person
  ├─ RosterReview(list, role, onChanged)     only when someone was never present
  │    select all · per-person checkbox · Mark inactive (N) · Reactivate
  ├─ EnrollmentMismatchFixer                 own useSWR /api/attendance/roster-hygiene; only when count > 0
  └─ "Show all N" → Row(p) per person
  data: useSWR /api/attendance/person-profiles?role=&days=`,

  notes: {
    [PAGE]: {
      'import:react': '`useState`, `useCallback`.',
      'import:swr': 'Profiles and the mismatch count.',
      'import:lucide-react': 'Icons.',
      'import:@/components/i18n/I18nProvider': '`useI18n()` — t, rich, lang, digits.',
      fetcher: '`fetch(u, {cache: "no-store"}).then(r => r.json())` — no status check.',
      BEHAVIOUR_STYLE: 'Chip colour and icon per behaviour: frequently_absent (rose), declining (orange), chronically_late (amber), occasionally_late (sky), improving / reliable (green), insufficient_data (grey). `never_present` has no entry — those people only appear in RosterReview, which does not use chips.',
      pct: 'Rate 0–1 → "NN%".',
      Row: 'One person: name (or #id), behaviour chip, note, and absent % / late % over tracked days.',
      'Row.st': 'Chip style (falls back to reliable).',
      'Row.{ t, rich, lang, digits }': 'i18n helpers.',
      'Row.P': 'Percentage in the interface language (Arabic digits and ٪).',
      'Row.label': 'Arabic: translation of `attendancePages.profiles.b.<behaviour>` (server English as fallback); English: the server label.',
      'Row.note': 'English: the server note. Arabic: rebuilt from the profile numbers — tracked days, absent/late/present rates, absent count, current absent streak (≥ 2), prior vs recent absent rate for "declining" — through `attendancePages.profiles.n.<behaviour>`.',
      'Row.render#1': 'Name + chip + note on the start side; two small rate lines on the end side.',
      AttendanceProfiles: 'The route\'s default export.',
      'AttendanceProfiles.{ t, digits }': 'i18n helpers.',
      'AttendanceProfiles.[role, setRole]': "'staff' (default) | 'student'.",
      'AttendanceProfiles.[days, setDays]': '30 / 60 / 90 (server clamps 14–120).',
      'AttendanceProfiles.[showAll, setShowAll]': 'Expand the full list.',
      'AttendanceProfiles.{ data, isLoading, mutate }': 'useSWR person-profiles?role&days; `mutate` after a roster change.',
      'AttendanceProfiles.watchlist': 'People flagged `watch` (frequently absent, declining, chronically late), already sorted by severity then absence rate.',
      'AttendanceProfiles.rosterReview': 'People tracked but never present.',
      'AttendanceProfiles.all': 'Everyone except roster-review people (watch-list included).',
      'AttendanceProfiles.render#1': 'Header with toggles; first-load spinner; three summary tiles; the watch-list card ("Nobody needs attention" when empty); RosterReview when needed; EnrollmentMismatchFixer; and a "Show all N / Hide" toggle only when there are more people than the watch-list.',
      RosterReview: 'Never-present people with checkboxes and reversible bulk actions. Props: list, role, onChanged (refetch).',
      'RosterReview.{ t, digits }': 'i18n helpers.',
      'RosterReview.[sel, setSel]': 'Selected person ids (people.id). Not reset when the Staff/Learners toggle changes (the component stays mounted), so a selection made under one role can be posted with the other role — the server then matches nobody (ids belong to the other table) and changes 0 rows.',
      'RosterReview.[busy, setBusy]': 'Request running.',
      'RosterReview.toggle': 'Add/remove one id.',
      'RosterReview.allSelected': 'All rows selected (header checkbox).',
      'RosterReview.act': 'Deactivate asks for confirmation; reactivate does not. POST {action, role, person_ids} → success: clear selection, refetch; failure: alert(error) (403 without attendance.manage).\n\nDeactivating does not touch enrollments, and person-profiles does not filter by status, so deactivated people stay in this list while they still have records in the window (that is how Reactivate is reached).\n\n**[defect]** For learners, deactivating someone who still has an **active enrollment** immediately makes EnrollmentMismatchFixer count them ("N enrolled learners are not active") and offer to re-activate them all — the two tools undo each other. Deactivation should also close the enrollment, or the mismatch check should exclude people deactivated through roster hygiene.',
      'RosterReview.render#1': 'Card: title with count, action buttons (only with a selection), help text, select-all, scrollable list (max-h-56) of checkbox rows with "tracked N days, never present".',
      EnrollmentMismatchFixer: 'Banner + button to set students.status = active for every non-deleted learner who has an active enrollment but a non-active status. Hidden when the count is 0 (or the request fails).',
      'EnrollmentMismatchFixer.{ t }': 'Translate.',
      'EnrollmentMismatchFixer.{ data, mutate }': 'useSWR GET roster-hygiene → {enrollment_mismatch}.',
      'EnrollmentMismatchFixer.[busy, setBusy]': 'Request running.',
      'EnrollmentMismatchFixer.n': 'Mismatch count.',
      'EnrollmentMismatchFixer.guard#1': 'Nothing to fix → render nothing. (The hooks are above the guard; `fix` is declared after it, which is allowed because it is not a hook.)',
      'EnrollmentMismatchFixer.fix': 'confirm → POST {action: fix_enrollment_mismatch} → alert("Activated N") and refetch the count; failure → alert(error). The profiles list is not refetched.',
      'EnrollmentMismatchFixer.render#1': 'Amber banner with a wrench icon and the "Activate N" button.',
    },

    [API_PROFILES]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/db': '`query`.',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      'import:@/lib/attendance/person-intelligence': '`profilePerson(days)` — pure: from a person\'s daily statuses computes tracked days, present/late/absent rates, streaks, prior vs recent absence, then a behaviour (insufficient_data, never_present, frequently_absent, declining, chronically_late, occasionally_late, improving, reliable), English label and note, `watch` and `rosterReview` flags.',
      runtime: "'nodejs'.",
      GET: 'Profiles for a role over a window, school-scoped, session only. Variants: `?person_id=` (one person + series) and `?banner=1` (watch count).',
      'GET.session': 'Session.',
      'GET.guard#1': 'No session → 401.',
      'GET.{ schoolId }': 'Tenant.',
      'GET.sp': 'Query parameters.',
      'GET.role': 'student or staff (default).',
      'GET.days': '14–120, default 30.',
      'GET.since': 'now − days as a UTC date.',
      'GET.guard#2': 'Single person: that person\'s records → {person_id, profile, series}.',
      'GET.rows': 'Every record of the role in the window with the person\'s name (people join), ordered by person and date. No status filter on students/staff — inactive people are still profiled while they have records.',
      'GET.byPerson': 'Group rows per person.',
      'GET.profiles': 'profilePerson per person.',
      'GET.order': 'Severity order for sorting (then absence rate descending).',
      'GET.guard#3': 'Banner: count of watch people.',
      'GET.return#1': '{success, role, days, watchlist, roster_review, all (excluding roster review), summary {people, frequently_absent, declining, chronically_late, roster_review}}.',
      'GET.catch#1': '500 with the message.',
    },

    [API_HYGIENE]: {
      'import:@/lib/api/with-route': '`withRoute` — session, permission, read-only maintenance block for writes, error envelope.',
      'import:@/lib/audit': '`logAudit`.',
      'import:@/lib/attendance/roster-hygiene': 'validateHygieneAction (pure: action, role, 1–1000 ids), hygieneCounts (learners with an active enrollment whose status is not active), setPeopleStatus (UPDATE students|staff SET status WHERE school AND not deleted AND person_id IN …), fixEnrollmentMismatch (UPDATE … SET status = active for that mismatch set).',
      runtime: "'nodejs'.",
      badRequest: '400-tagged error.',
      'badRequest.e': 'The error.',
      'badRequest.return#1': 'The error.',
      GET: 'Mismatch count for the caller\'s school (session only).',
      POST: 'attendance.manage. fix_enrollment_mismatch → activate the mismatch set, audit ROSTER_ENROLLMENT_FIX → {activated}. deactivate / reactivate → setPeopleStatus, audit ROSTER_<ACTION> with up to 50 ids → {changed, status}. Nothing is deleted.',
    },
  },

  ui: [
    { title: 'Header', text: 'People icon, "Attendance Profiles", subtitle; Staff / Learners toggle; 30 / 60 / 90 days.' },
    { title: 'Summary', text: 'Three tiles: frequently absent (rose), declining (orange), chronically late (amber).' },
    { title: 'Watch-list', text: 'Each person: name, behaviour chip, a sentence such as "Absent 9 of 22 days (41%), 3 days in a row now", and absent % / late % on the right.' },
    { title: 'Roster review', text: '"Never present (N)" with a help line, select-all, one checkbox row per person with tracked days, and "Mark N inactive" / "Reactivate" once something is selected.' },
    { title: 'Enrollment mismatch', text: 'Amber banner "N learners are enrolled but not marked active" with "Activate N".' },
    { title: 'Everyone', text: '"Show all N people" link expanding the same rows for everyone.' },
  ],

  interactions: [
    { action: 'Open the page', steps: ['useSWR person-profiles?role=staff&days=30 → profiles split → tiles, watch-list, roster review.', 'EnrollmentMismatchFixer: GET roster-hygiene → banner if > 0.'] },
    { action: 'Mark never-present people inactive', steps: [
      'Tick people → Mark N inactive → confirm → POST {deactivate, role, person_ids}.',
      'withRoute (attendance.manage) → validate → UPDATE status = inactive → audit → {changed}.',
      'Selection cleared → profiles refetched (they are still listed while they have records).',
      'Learners with an active enrollment now show up in the mismatch banner — see the defect.',
    ] },
    { action: 'Fix the enrollment mismatch', steps: ['Activate N → confirm → POST {fix_enrollment_mismatch} → activated count alert → banner refetched.'] },
    { action: 'Switch role / window', steps: ['New SWR key → refetch; RosterReview keeps its selection (see note).'] },
  ],

  data: `**GET /api/attendance/person-profiles?role=&days=** → \`{ success, role, days, watchlist: Profile[], roster_review: Profile[], all: Profile[], summary }\`. Profile: \`{ person_id, name, trackedDays, presentRate, lateRate, absentRate, currentAbsentStreak, recentAbsentRate, priorAbsentRate, behaviour, label, note, watch, rosterReview }\` (see person-intelligence.ts for the full type).
**GET /api/attendance/roster-hygiene** → \`{ success, enrollment_mismatch }\`.
**POST /api/attendance/roster-hygiene** \`{ action: 'deactivate'|'reactivate', role, person_ids }\` → \`{ success, changed, status }\`; \`{ action: 'fix_enrollment_mismatch' }\` → \`{ success, activated }\`.

Tables: attendance_records, people (read); students, staff (status), enrollments (read); audit log.`,

  states: `- **First load**: spinner.
- **Nobody on the watch-list**: "Nobody needs attention right now."
- **No never-present people / no mismatch**: those cards are absent.
- **Errors**: GET errors look like an empty page; POST errors are shown with \`alert()\`.`,

  security: `- Reading profiles (names with absence/lateness labels) needs only a session — any signed-in user of the school can see that a named teacher is "frequently absent". [recommended] Gate GET person-profiles with attendance.view or a reports permission, given the HR sensitivity.
- Status changes need attendance.manage, are bounded (1000 ids), school-scoped, reversible and audited.`,

  styling: `Tailwind with dark variants; max-w-3xl single column; summary tiles in a fixed 3-column grid (tight on phones). RTL: \`text-end\` for the rates column, Arabic digits and ٪ everywhere through \`P\`/\`digits\`.`,

  testing: `- **Tests**: src/lib/attendance/__tests__/person-intelligence.test.mjs (behaviour classification) and roster-hygiene.test.mjs (validateHygieneAction). Run \`npm run test:attendance\`.
- **Someone is on the watch-list unexpectedly**: open /attendance/logs for that person and window — profiles count attendance_records verdicts, so wrong verdicts (clock drift, wrong identity) produce wrong labels.`,

  extend: [
    { change: 'Add a behaviour', how: 'Extend Behaviour and the decision in profilePerson (pure, with a test), add it to the order map in the route, a BEHAVIOUR_STYLE entry, and translation keys `attendancePages.profiles.b.<behaviour>` and `.n.<behaviour>` (the note variables come from Row.note).' },
    { change: 'Make deactivation stick for learners', how: 'In setPeopleStatus for students also close their active enrollments (status closed, with an end date) inside the same request, or exclude students deactivated by roster hygiene from hygieneCounts.' },
    { change: 'Open a person\'s detail', how: 'The API already supports `?person_id=&role=&days=` returning the day series — add a drawer that fetches it from Row.' },
  ],
};

export default doc;
