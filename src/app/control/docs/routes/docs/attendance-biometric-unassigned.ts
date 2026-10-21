import type { RouteDoc } from '@/lib/devdocs/route-doc';

const PAGE = 'src/app/attendance/biometric/unassigned/page.tsx';
const API_LIST = 'src/app/api/biometric/unassigned/route.ts';
const API_ORPHANS = 'src/app/api/biometric/orphans/route.ts';
const API_PENDING = 'src/app/api/biometric/pending-device-users/route.ts';
const API_STUDENT = 'src/app/api/students/[id]/route.ts';

const doc: RouteDoc = {
  route: '/attendance/biometric/unassigned',
  reviewed: { [PAGE]: '49c40a2f56c7', [API_LIST]: '956941ffc711', [API_ORPHANS]: '0fa046603189', [API_PENDING]: 'f5b9c086a7ec', [API_STUDENT]: '60ddb64d66f1' },

  identity: {
    purpose: 'Triage queue for biometric data without a confirmed identity: (1) orphan fingerprint templates — a device sent a template for a PIN DRAIS cannot resolve — and (2) pending device users — the device knows a user DRAIS could not map deterministically (with candidate suggestions). The operator picks a learner for a row and assigns it: orphans are claimed (mapping + template stored and distributed to the school\'s other devices), pending users are mapped (enrollment + re-matching of earlier punches).',
    users: 'Attendance / biometric administrators.',
    permissions: 'Page: session (middleware). All three APIs: session only — no permission check.',
    upstream: 'fingerprint_orphans (written by the device fingerprint handler), pending_device_users (device user echoes), device_user_directory (names stored on the device), the enrollment service.',
    downstream: 'biometric_enrollments + zk_user_mapping (identity), student_fingerprints and biometric_templates (+ distribution jobs to sibling devices), zk_attendance_logs / attendance_raw_events re-matched, days re-evaluated, pending rows marked resolved.',
  },

  files: [
    { path: PAGE, role: 'Route entry (English only — no i18n): summary tiles, shared student search, triage table.', shared: false },
    { path: API_LIST, role: 'GET /api/biometric/unassigned — orphans + pending users merged into one list.', shared: false },
    { path: API_ORPHANS, role: 'GET/POST /api/biometric/orphans — list orphans; claim one.', shared: false },
    { path: API_PENDING, role: 'GET/POST /api/biometric/pending-device-users — list; map / ignore / quarantine.', shared: false },
    { path: API_STUDENT, role: 'GET /api/students/:id — one learner\'s details; also where the page\'s "/api/students/search" request actually lands (see the defect). Shared with the Learners module; explained here.', shared: true },
  ],

  layout: `- **src/middleware.ts** → **AuthenticatedShell** (global SWR fetcher \`swrFetcher\`: **error toast on every failed request**) → **MainLayout**; **src/app/attendance/layout.tsx** gradient.
- Both useSWR calls pass no fetcher, so they use swrFetcher. Writes use apiFetch (success and error toasts).
- Not in the sidebar under its own name; reached from the attendance/biometric pages.
- The page uses design-token classes (bg-card, border-border, text-muted-foreground) so it follows the theme, but every string is hard-coded English.`,

  tree: `BiometricUnassignedPage                    src/app/attendance/biometric/unassigned/page.tsx
  ├─ header: icon · title · subtitle · Refresh
  ├─ summary tiles ×3: unassigned · total tracked · resolved today ("—")
  ├─ student search card: input · result list (click → assigns to first unconfigured row)
  └─ table (or loading / empty state)
       row: device SN · PIN · device name · suggestions · StatusBadge · finger · initiated · by · picked student (✕) · Assign
  data: useSWR /api/biometric/unassigned?limit=100 (15 s) · useSWR /api/students/search?q=&limit=20`,

  notes: {
    [PAGE]: {
      'import:react': '`useState`.',
      'import:swr': 'List and student search (global fetcher).',
      'import:lucide-react': 'Icons.',
      'import:@/lib/toast': '`showToast` for local messages ("Select a student first", "Selected … for slot …").',
      'import:@/lib/apiClient': '`apiFetch` for the assign calls.',
      UnassignedEntry: 'Merged row: kind orphan|pending, id (unique only within its kind), device_sn, device_slot (PIN), device_name, status, source, finger_index, timestamps, initiated_by_name, candidates.',
      rowKey: '`kind:id` — orphan and pending ids can collide, so rows are keyed by both.',
      Student: 'Search result shape expected from /api/students/search: id, first_name, last_name, admission_no.',
      STATUS_COLORS: 'Badge colours per status. Only CAPTURED (orphans), UNASSIGNED and AMBIGUOUS (pending) are produced by the current API; the rest are from the legacy model.',
      StatusBadge: 'Coloured status pill showing the raw status code.',
      'StatusBadge.render#1': 'The pill.',
      fmt: 'ISO → short British date/time ("21/10/2026, 07:12") in the browser timezone.',
      'fmt.guard#1': 'No value → "—".',
      'fmt.d': 'Date.',
      'fmt.return#1': 'Formatted.',
      BiometricUnassignedPage: 'The route\'s default export.',
      'BiometricUnassignedPage.[assigning, setAssigning]': 'rowKey being assigned (spinner on that row).',
      'BiometricUnassignedPage.[searchQuery, setSearchQuery]': 'Shared student search text.',
      'BiometricUnassignedPage.[selectedStudent, setSelectedStudent]': 'rowKey → chosen students.id.',
      'BiometricUnassignedPage.{ data, isLoading, mutate }': 'useSWR /api/biometric/unassigned?limit=100, every 15 s.',
      'BiometricUnassignedPage.{ data: studData }': `useSWR \`/api/students/search?q=…&limit=20\` — requested on every render, **including with an empty query on page load**.

**[defect]** There is no /api/students/search route. The URL is served by the dynamic route /api/students/[id] with id = "search": \`WHERE s.id = 'search'\` matches nothing → **404 "Student not found."** → the global fetcher shows an **error toast on page load and on every keystroke**, \`students\` is always empty, "No students found" is shown, and **no row can ever be assigned from this page**. Fix: point it at an existing search (e.g. /api/students/enrolled?search=…, as /attendance/logs does) and map its \`data\` envelope; pass \`null\` as the key while the query is empty.`,
      'BiometricUnassignedPage.students': '`studData.students` or empty (the expected envelope; /api/students/enrolled would return `data`).',
      'BiometricUnassignedPage.enrollments': 'The merged rows.',
      'BiometricUnassignedPage.handleAssign': 'Needs a picked student (warning toast). Orphan → apiFetch POST /api/biometric/orphans {orphan_id, student_id}; pending → POST /api/biometric/pending-device-users {id, action: map, user_type: student, student_id}. Success toasts come from apiFetch; then refetch. The catch shows a SECOND error toast — apiFetch has already toasted the server error, so failures appear twice. Staff cannot be assigned from this page (student only), and ignore/quarantine are not offered.',
      'BiometricUnassignedPage.render#1': 'Header with Refresh; three tiles (Unassigned = rows shown, Total tracked = API total (same number unless over 100), Resolved today = a fixed "—" placeholder); the search card — clicking a result assigns that student to the FIRST row without a selection (not to a chosen row) and toasts which slot; then loading / "No unassigned enrollments" / the table. Each row shows up to two suggested names, the status badge, finger "F<n>", initiated time, the picked student (or its id when not in the current results) with ✕ to clear, and Assign (disabled until picked). Physical `text-left`, `mr-2`, `ml-1` classes — not RTL-aware.',
    },

    [API_LIST]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/db': '`query`.',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      'import:@/lib/biometric/pending-device-users': '`ensurePendingDeviceUsersSchema()` — creates the pending table if missing.',
      runtime: "'nodejs'.",
      GET: 'Merged triage list (Phase 2M/2N rewrite — the old version read the legacy-shape biometric_enrollments). Session only.',
      'GET.session': 'Session.',
      'GET.guard#1': 'No session → 401.',
      'GET.url': 'Parsed URL.',
      'GET.limit': '1–200, default 50 (the page asks for 100).',
      'GET.schoolId': 'Tenant.',
      'GET.entries': `1. Unclaimed orphans \`WHERE (school_id = ? OR school_id IS NULL)\` joined to device_user_directory by device + PIN (**no school condition** on the join) → kind orphan, status CAPTURED.
2. Pending/ambiguous device users of the school → kind pending, status UNASSIGNED / AMBIGUOUS, candidates from candidates_json.

**[defect] Cross-tenant exposure**: orphans whose school_id is NULL (the device could not be attributed to a school) are listed to **every** school, with device serial, PIN and the device-stored name.`,
      'GET.pending': 'Pending rows.',
      'GET.return#1': 'Sorted newest first, cut to `limit` → {enrollments, total} (`total` counts before the cut, at most 2 × limit).',
      'GET.catch#1': '500 "DB error: …".',
    },

    [API_ORPHANS]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      'import:@/lib/db': '`query`.',
      'import:@/lib/biometric/name-fuzzy': '`fuzzyCandidates(name, school)` — suggested people for a device-stored name.',
      'import:@/lib/biometric/template-service': '`recordTemplate`, `queueDistributionsForSchool` (push the template to the school\'s other devices), `lookupActiveEnrollment`.',
      'import:@/lib/biometric/enrollment-service': '`upsertEnrollment` — canonical biometric_enrollments + legacy mirror, with PIN-conflict detection.',
      'import:@/lib/biometric/pending-device-users': '`markPendingResolved` — close the matching pending row.',
      FINGER_NAMES: 'thumb, index, middle, ring, pinky (finger_id mod 5).',
      runtime: "'nodejs'.",
      OrphanRow: 'fingerprint_orphans row shape.',
      GET: 'Unclaimed orphans (≤ 200) with the device-stored name and fuzzy candidates. Session only. Not used by this page (it uses /api/biometric/unassigned).',
      'GET.session': 'Session.',
      'GET.guard#1': 'No session → 401.',
      'GET.rows': 'Same NULL-school inclusion as the list route.',
      'GET.catch#1': 'Missing table → empty list with a note; other errors rethrown (500).',
      'GET.enriched': 'Per orphan: device-stored name (lookup without school condition), fuzzy candidates, finger name.',
      'GET.return#1': '{success, orphans}.',
      POST: 'Claim an orphan for a student or staff member. Session only — no permission check.',
      'POST.session': 'Session.',
      'POST.guard#1': 'No session → 401.',
      'POST.body': 'JSON body.',
      'POST.catch#1': 'Invalid JSON → 400.',
      'POST.orphanId': 'Orphan id.',
      'POST.studentId': 'students.id or null.',
      'POST.staffId': 'staff.id or null.',
      'POST.guard#2': 'orphan_id required.',
      'POST.guard#3': 'One of student/staff required.',
      'POST.guard#4': 'Not both.',
      'POST.orphanRows': 'The orphan, loaded by id only.',
      'POST.guard#5': 'Not found → 404.',
      'POST.orphan': 'The row.',
      'POST.guard#6': 'Belongs to another school → 404. **A NULL-school orphan passes** — any school can claim it and store its template bytes against its own learner (cross-tenant biometric data).',
      'POST.guard#7': 'Already claimed → 409.',
      'POST.guard#8': 'The chosen student/staff must belong to the school (404 otherwise).',
      'POST.claimPin': 'Numeric PIN or 0.',
      'POST.claimedEnrollmentId': 'Enrollment created by the claim.',
      'POST.guard#9': 'Numeric PIN → upsertEnrollment (409 on pin_conflict); else legacy-only zk_user_mapping upsert.',
      'POST.guard#10': 'Student → also upsert student_fingerprints with the template (finger position/hand from finger_id; device id looked up by serial without school condition). Staff have no template table.',
      'POST.templateId': 'biometric_templates id.',
      'POST.distributionsQueued': 'Distribution jobs queued to sibling devices.',
      'POST.enrollmentIdForTemplate': 'Enrollment to attach the template to.',
      'POST.guard#11': 'With an enrollment: record the template and queue distribution; then close any pending row for the PIN.',
      'POST.catch#2': 'Template promotion failure is logged only — the claim stays done.',
      'POST.return#1': '{success, claimed: {orphanId, deviceSn, deviceUserId, fingerId, assignedTo, templateId, distributionsQueued}}. Unlike pending mapping, a claim does not re-match earlier punches of the PIN.',
      fingerName: '"right thumb", "left index", …',
      'fingerName.n': 'finger_id as a number.',
      'fingerName.finger': 'Finger name.',
      'fingerName.hand': 'right for 0–4, left otherwise.',
      'fingerName.return#1': 'Text.',
    },

    [API_PENDING]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/db': '`query`.',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      'import:@/lib/biometric/enrollment-service': '`upsertEnrollment`.',
      'import:@/lib/biometric/pending-device-users': 'Schema helper and `markPendingResolved`.',
      'import:@/lib/attendance/raw-event-backfill': '`backfillAttendanceRawEventsForMapping` — attach the PIN\'s earlier raw events to the person.',
      'import:@/lib/attendance/engine': '`evaluateDay`.',
      runtime: "'nodejs'.",
      GET: 'Pending device users by status (unresolved by default, or a status, or all), ≤ 200. Session only. Not used by this page.',
      'GET.session': 'Session.',
      'GET.guard#1': 'No session → 401.',
      'GET.url': 'Parsed URL.',
      'GET.status': 'unresolved | pending | ambiguous | ignored | quarantined | mapped | all.',
      'GET.limit': '1–200, default 100 (a non-numeric value becomes NaN in LIMIT → 500).',
      'GET.where': 'Conditions.',
      'GET.params': 'Values.',
      'GET.guard#2': 'unresolved → pending/ambiguous; a specific status → that; all → no filter.',
      'GET.rows': 'Rows newest-seen first.',
      'GET.data': 'candidates parsed from JSON.',
      'GET.return#1': '{success, data, total}.',
      'GET.catch#1': '500.',
      POST: 'Resolve one pending device user: map, ignore or quarantine. Session only — no permission check.',
      'POST.session': 'Session.',
      'POST.guard#1': 'No session → 401.',
      'POST.body': 'JSON body.',
      'POST.catch#1': 'Invalid JSON → 400.',
      'POST.{ id, action }': 'Row id and action.',
      'POST.guard#2': 'Missing id or unknown action → 400.',
      'POST.rows': 'The pending row, school-scoped.',
      'POST.guard#3': 'Not found → 404.',
      'POST.row': 'The row.',
      'POST.userId': 'Acting user.',
      'POST.guard#4': 'ignore / quarantine → mark resolved with that status.',
      'POST.userType': "'student' | 'staff'.",
      'POST.refId': 'students.id / staff.id.',
      'POST.guard#5': 'Missing type or id → 400.',
      'POST.pin': 'Numeric PIN.',
      'POST.guard#6': 'Not 1–65535 → 422.',
      'POST.enrollment': 'upsertEnrollment (source pending_device_user_resolution).',
      'POST.guard#7': 'Refused → 409 (PIN conflict message).',
      'POST.rematched': 'Legacy zk_attendance_logs of the PIN re-matched; then raw events back-filled and each affected day re-evaluated (both best-effort); the pending row is marked mapped.',
      'POST.return#1': '{success, message, enrollment_id, rematched}.',
      'POST.catch#2': '500.',
      safeParse: 'JSON.parse or null.',
      'safeParse.guard#1': 'Empty → null.',
      'safeParse.catch#1': 'Invalid JSON → null.',
      'safeParse.return#1': 'Parsed value.',
    },

    [API_STUDENT]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/db': '`getConnection()` — a dedicated connection (closed with `connection.end()` on success only; an exception leaves it open until the pool reclaims it).',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      GET: 'One learner\'s details by students.id for the caller\'s school: admission, status, person fields, current enrollment (class, theology class, stream, year, term), district/village, previous-school history. Session only.\n\nAny path segment is accepted as the id — which is why `/api/students/search` arrives here with id "search".',
      'GET.session': 'Session.',
      'GET.guard#1': 'No session → 401.',
      'GET.schoolId': 'Tenant.',
      'GET.resolvedParams': 'Route params (awaited — Next 15).',
      'GET.{ id }': 'The id segment (a string; not validated as a number).',
      'GET.guard#2': 'Empty id → 400.',
      'GET.connection': 'Connection for the query.',
      'GET.[student]': 'Rows for the learner. `LEFT JOIN enrollments` without a status filter can return several rows (one per enrollment); only the first is returned. `districts d ON d.id = p.school_id` joins the district by the person\'s SCHOOL id, so district_name is not the learner\'s district. [defect]',
      'GET.guard#3': 'No row → 404 "Student not found." (also for "search").',
      'GET.return#1': '{success, data}.',
      'GET.catch#1': '500 with the message.',
    },
  },

  ui: [
    { title: 'Header', text: 'Fingerprint icon, "Unassigned Biometric Enrollments", "Fingerprint slots captured without a confirmed identity", Refresh.' },
    { title: 'Summary', text: 'Unassigned (rows), Total tracked, Resolved today (always "—").' },
    { title: 'Student search', text: 'One input for all rows. Clicking a result applies that student to the first row that has none and says which slot. (Currently always "No students found" — see the defect.)' },
    { title: 'Table', text: 'Device / Slot (serial, PIN, device name, "suggests: …"), Status badge, Finger, Initiated, By, Assign to (picked student with ✕, or "— search above —"), Assign button.' },
    { title: 'Empty', text: 'Green check, "No unassigned enrollments — All fingerprint slots have an identity assigned".' },
  ],

  interactions: [
    { action: 'Open the page', steps: [
      'useSWR GET /api/biometric/unassigned?limit=100 → orphans (incl. NULL-school) + pending → table; refreshed every 15 s.',
      'useSWR GET /api/students/search?q=&limit=20 → /api/students/[id] with id "search" → 404 → error toast.',
    ] },
    { action: 'Assign a pending device user (intended flow)', steps: [
      'Search a learner → click the result → it is attached to the first unconfigured row.',
      'Assign → POST pending-device-users {id, action: map, user_type: student, student_id} → upsertEnrollment → re-match + back-fill + re-evaluate → mark mapped.',
      'Success toast → refetch → the row disappears.',
    ] },
    { action: 'Claim an orphan template (intended flow)', steps: [
      'Same selection → Assign → POST orphans {orphan_id, student_id} → enrollment + student_fingerprints + biometric_templates + distribution to sibling devices → orphan claimed.',
    ] },
  ],

  data: `**GET /api/biometric/unassigned?limit=** → \`{ enrollments: UnassignedEntry[], total }\`.
**POST /api/biometric/orphans** \`{ orphan_id, student_id | staff_id }\` → \`{ success, claimed }\` | 400/404/409.
**POST /api/biometric/pending-device-users** \`{ id, action: 'map', user_type, student_id | staff_id }\` | \`{ id, action: 'ignore'|'quarantine' }\` → \`{ success, message, enrollment_id?, rematched? }\` | 400/404/409/422.
**GET /api/students/search** — does not exist (answered by /api/students/[id] → 404).

Tables: fingerprint_orphans, pending_device_users, device_user_directory, biometric_enrollments, zk_user_mapping, student_fingerprints, biometric_templates (+ distribution queue), zk_attendance_logs, attendance_raw_events, devices, students, staff.`,

  states: `- **Loading**: spinner row.
- **Empty**: green "No unassigned enrollments".
- **Search**: always "No students found" plus an error toast (defect).
- **Assign errors**: two toasts (apiFetch + the page's catch).`,

  security: `- **No permission check** on any of the three APIs; any signed-in user can bind fingerprints and PINs to learners.
- **[defect] NULL-school orphans** are listed to and claimable by every school (list route and claim guard both accept \`school_id IS NULL\`), so one school can see another school's device serials/PINs and store that school's fingerprint template against its own learner. Fix: attribute orphans to a school at capture (via the device's school) and drop the \`OR school_id IS NULL\`; give unattributed orphans to platform operators only (Control Center).
- Lookups by device serial (device_user_directory, devices) have no school condition.
- Claims and mappings go through upsertEnrollment, so a PIN actively held by another person is never silently rebound (409).`,

  styling: `Theme tokens (bg-card, border-border, bg-muted, text-foreground) so light/dark follow the theme; fixed English text; physical left/right classes (\`text-left\`, \`mr-2\`, \`ml-1\`) — the page is not RTL-ready. Summary tiles in a fixed 3-column grid; the table does not scroll horizontally on phones.`,

  testing: `- **Tests**: none for these routes or the page.
- **Reproduce the search defect**: open the page with DevTools → Network → /api/students/search?q=&limit=20 → 404 {"message":"Student not found."}.
- **Orphan never appears**: check fingerprint_orphans.claimed_at and school_id; templates arrive only from devices that push fingerprint data.`,

  extend: [
    { change: 'Fix the student search', how: 'Use `/api/students/enrolled?search=${q}&limit=20` with key `q.trim().length > 1 ? url : null`, read `data` (fields first_name, last_name, admission_no, id). Let each row pick its own student (a per-row combobox) instead of "first unconfigured row".' },
    { change: 'Assign staff', how: 'Add a learner/staff switch per row and send user_type staff + staff_id (both APIs already accept it).' },
    { change: 'Close the cross-tenant hole', how: 'Remove `OR school_id IS NULL` in the list and orphans GET, and reject NULL-school orphans in the claim (or require a platform role).' },
    { change: 'Add a permission', how: 'Require attendance.manage (or a biometric permission) in orphans POST and pending-device-users POST via requirePermission.' },
    { change: 'Translate the page', how: 'Move every string to `attendancePages.unassigned.*` keys in en.json/ar.json and use useI18n; switch to logical classes (text-start, me-2, ms-1).' },
  ],
};

export default doc;
