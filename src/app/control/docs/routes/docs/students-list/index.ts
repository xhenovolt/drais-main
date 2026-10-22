import type { RouteDoc } from '@/lib/devdocs/route-doc';
import pageA from './page-a';
import pageB from './page-b';
import pageC from './page-c';
import pageD from './page-d';

const PAGE = 'src/app/students/list/page.tsx';
const LAYOUT = 'src/app/students/layout.tsx';
const REASSIGN = 'src/app/students/_client/ReassignClassModal.tsx';
const QUICK_EDIT = 'src/components/students/QuickEditDrawer.tsx';
const SNAPSHOT = 'src/components/students/LearnerSnapshotModal.tsx';
const BULK_SMS = 'src/components/students/BulkSmsModal.tsx';
const BULK_PHOTO = 'src/components/students/BulkPhotoUploadModal.tsx';
const FOLDER_PHOTO = 'src/components/students/FolderPhotoUploadModal.tsx';
const IMPORT = 'src/components/students/ImportModal.tsx';
const DEVICE_SELECT = 'src/components/modals/DeviceSelector.tsx';
const SYNC_DEVICE = 'src/components/device/SyncDeviceModal.tsx';
const LIVE_POPUP = 'src/components/students/StudentsListLivePopup.tsx';
const MEDIA = 'src/components/media/MediaImg.tsx';

const doc: RouteDoc = {
  route: '/students/list',
  reviewed: { [PAGE]: 'c36aa90118e0', [LAYOUT]: 'e5c81be81e6d' },

  identity: {
    purpose: 'The learner register — the main screen of the Learners module. Two tabs: **Enrolled** (learners with an active enrollment, one row per learner with every programme/class) and **Admitted** (learners not yet enrolled). Search and filters, client-side paging, inline edits (names, gender, day/boarding), fee balances, biometric capture (fingerprint by cloud/relay/direct LAN, face by cloud) with live progress, single and bulk enrolment, programme stacking, class moves, status and residency changes, guardian messages/SMS, photo uploads, export, soft/permanent delete and a "delete all learners" danger action.',
    users: 'School administrators, registrars and class teachers (anyone who can open the Learners module).',
    permissions: `Page: session only — src/middleware.ts plus src/app/students/layout.tsx (cookie present). No page-level role check.

APIs (checked in each handler; middleware does not guard /api/students):
- **permission-checked**: day/boarding (academics.residency.manage), balances refresh (finance module + finance.fees.manage), guardian broadcast (comm.dispatch.send), years/terms (academics module).
- **session only**: list loading, inline name/gender edit, enrol / bulk enrol / bulk programme assign, class move, bulk status, photo removal, soft delete, permanent delete, delete-all, every biometric capture call. See section M.`,
    upstream: 'students, people, enrollments (+ programmes, classes, streams, study modes, academic years, terms), finance ledger balances (attached by the enrolled API), biometric enrollment/status tables, devices.',
    downstream: 'Links: /students/admit, /students/:id, /students/:id/fees, /students/promote, /students/trash, /students/import-v2. Writes: learner fields, residency, enrollments, statuses, photos, soft/hard deletes, device commands (fingerprint/face), guardian messages.',
  },

  files: [
    { path: PAGE, role: 'Route entry (3 358 lines): StudentsListPage plus RowMore, StatusBadge, EnrollmentModal, BulkEnrollModal, BulkAssignProgramModal. Explained LINE BY LINE.', shared: false, lineLevel: true },
    { path: LAYOUT, role: 'Server layout for every /students/* page: redirects to /login without a session cookie.', shared: false },
    { path: REASSIGN, role: 'Bulk "Move class" modal.', shared: true },
    { path: QUICK_EDIT, role: 'Quick-edit drawer for one learner.', shared: false },
    { path: SNAPSHOT, role: 'Read-only learner snapshot modal.', shared: false },
    { path: BULK_SMS, role: 'Bulk SMS to the guardians of the selection.', shared: false },
    { path: BULK_PHOTO, role: 'Bulk photo upload for the selection (941 lines).', shared: true },
    { path: FOLDER_PHOTO, role: 'Folder photo upload matched to learners (832 lines).', shared: true },
    { path: IMPORT, role: 'Legacy spreadsheet import modal — mounted but never opened from this page (1 026 lines).', shared: true },
    { path: DEVICE_SELECT, role: 'Device picker for biometric capture.', shared: false },
    { path: SYNC_DEVICE, role: 'Sync learners from a device.', shared: true },
    { path: LIVE_POPUP, role: 'Live punch popup built from the loaded roster.', shared: false },
    { path: MEDIA, role: 'Photo element (explained on /attendance/logs).', shared: true },
  ],

  layout: `- **src/middleware.ts** — session cookie or redirect to /login; /api/students is NOT in its role-prefix table, so API authorization is entirely up to each handler.
- **src/app/layout.tsx** → AuthenticatedShell (global providers, react-hot-toast \`<Toaster>\` used by this page's \`toast\` calls) → MainLayout (sidebar: Learners → Learner list).
- **src/app/students/layout.tsx** (server component) — reads the \`drais_session\` cookie and redirects to /login?reason=no_session when it is missing. It only checks that the cookie EXISTS (not that it is valid); validity is checked by middleware and the APIs. It logs on every request.

The page renders its own full-height frame (\`h-screen\`, only the table scrolls), so the shell's content area must not add its own scrolling around it.`,

  tree: `StudentsListPage                                   src/app/students/list/page.tsx
  ├─ StudentsListLivePopup(students)                  live punch popup from loaded rows
  ├─ header band: title + count · [Enrolled|Admitted] tabs · Add student (→ /students/admit)
  ├─ toolbar: search · class filter · year filter · gender filter · last-enrolled panel ·
  │           capture-mode popover · export menu · promote · trash · fees toggle ·
  │           import (→ /students/import-v2) · folder photos · sync device · delete all
  ├─ table (sticky head)
  │    row: checkbox · biometric (fingerprint + face) · NameCell(AvatarCell) · reg no ·
  │         [class chips · stream · type] | [admitted date] · StatusBadge · GenderCell ·
  │         ResidencyCell · [balance] · actions (profile · quick edit · snapshot · RowMore)
  │    SkeletonRow ×12 while loading · empty state
  ├─ pagination footer (client-side, 50 per page)
  ├─ bulk-action bar (selection): move class · enroll · assign programme · status ·
  │      residency · message (composer) · message (BulkSmsModal) · photos · clear
  └─ modals: EnrollmentModal · ReassignClassModal · BulkAssignProgramModal · BulkEnrollModal ·
             BulkPhotoUploadModal · FolderPhotoUploadModal · ImportModal (never opened) ·
             DeviceSelector · SyncDeviceModal · bulk message composer · LearnerSnapshotModal ·
             BulkSmsModal · QuickEditDrawer
  data: apiFetch /api/students/enrolled + /admitted (every filter change), 6 option lists,
        /api/students/fingerprint-status`,

  notes: {
    [PAGE]: { ...pageA, ...pageB, ...pageC, ...pageD },
    [LAYOUT]: {
      'import:react': '`ReactNode` (imported as a value import, used only as a type).',
      'import:next/navigation': '`redirect()` — throws a redirect during server rendering.',
      'import:next/headers': '`cookies()` — request cookies in a server component (async in Next 15).',
      StudentsLayout: 'Async server layout wrapping every /students/* page: no session cookie → redirect to /login?reason=no_session; otherwise render the page.',
      'StudentsLayout.cookieStore': 'The request\'s cookies.',
      'StudentsLayout.sessionToken': 'Value of `drais_session`, if any.',
      'StudentsLayout.guard#1': 'Missing cookie → log and redirect. A present-but-expired cookie passes here (middleware and the APIs reject it).',
      'StudentsLayout.render#1': 'Logs "Session valid" on EVERY request to a students page (noise in server logs — the check is only for presence), then renders the children unchanged.',
    },
  },

  ui: [
    { title: 'Header band', text: 'Title "Students" with the active tab\'s count; segmented Enrolled / Admitted tabs with counts; indigo "Add student" button.' },
    { title: 'Toolbar', text: 'Search (by name or reg no); on the Enrolled tab a class filter grouped by programme and a year filter (current / any year); a gender filter; × to clear filters. On the right: the last-enrolled confirmation (green), capture-mode button (globe = cloud, radio = relay, Wi-Fi = direct LAN) with its settings popover, export (CSV / Excel), promotion, trash, fees toggle, import, folder photos, sync from device and a red "delete all learners" button. Most tools are hidden below the sm breakpoint.' },
    { title: 'Table', text: 'Sticky header. Columns: select, biometric (fingerprint coloured by how many fingers are proven + face), learner (avatar with hover-× to remove the photo, names click-to-edit in English / Arabic name with an "AR?" badge in Arabic, class subtitle), reg no, then on Enrolled: class chips per programme, stream, type; on Admitted: admission date; status badge; gender (click to edit); day/boarding select; balance pill (red owing / green clear / grey none) linking to the fee ledger; hover actions (profile, quick edit, snapshot, more).' },
    { title: 'Capture progress', text: 'While a capture runs the fingerprint slot shows a spinner (contacting), pulsing fingerprint (sent / scan now), green check or red alert; hover for the message.' },
    { title: 'Pagination', text: '"Showing a–b of N", previous / next and up to five page numbers.' },
    { title: 'Bulk bar', text: 'Floating dark bar when learners are selected: count, Move class, Enroll, Assign Program (Enrolled), Status menu, Residency menu, two "Message" buttons, Photos, clear.' },
    { title: 'Enroll modal', text: 'Large modal with sticky header/footer: class (grouped by programme), stream, academic year, study-mode buttons, term, programme checkboxes; cards turn green when filled; Enroll enabled only when all required fields are set.' },
    { title: 'Bulk modals', text: 'Bulk enroll (every field optional — empty keeps the learner\'s current value), assign programme (programme, class of that programme, year, term required), move class, message composer (1600 characters).' },
  ],

  interactions: [
    { action: 'Open the page', steps: [
      'Middleware session → students layout (cookie present) → shell → StudentsListPage mounts.',
      'effect#3: loadOptions (6 GETs in parallel) + fetchFingerprintStatus.',
      'effect#5: fetchStudents → GET /api/students/enrolled and /admitted (search empty, lang) → group enrollments per learner → balances map from the rows → tabs fill; skeletons disappear.',
    ] },
    { action: 'Type in the search box', steps: [
      'Each keystroke: setSearch + page 1 → effect#5 → both lists refetched (no debounce, no cancellation).',
      'filteredData re-applies the search and the gender filter in the browser → page 1 of the result.',
    ] },
    { action: 'Rename a learner inline (English)', steps: [
      'Click the first name → editingCell set → input appears.',
      'Type → editValue changes (the whole cell remounts each keystroke — see AvatarCell note).',
      'Enter/blur → saveCell → updateStudentField: optimistic update → PUT /api/students/edit → success toast, or rollback + two error toasts.',
    ] },
    { action: 'Capture a fingerprint (cloud / ADMS mode)', steps: [
      'Click the fingerprint icon → handleQuickCapture → in-flight guard → preferred device or DeviceSelector.',
      'sendEnrollCommand → POST /api/students/enroll-fingerprint → command id → startPolling every 2 s on enroll-fingerprint/status.',
      'acknowledged → green check, learner marked, pill cleared after 4 s. The learner then scans the finger on the device.',
      'The in-flight guard is never released on this path (defect) — a second capture needs a page reload.',
    ] },
    { action: 'Enroll an admitted learner', steps: [
      'Admitted tab → + on the row → openEnrollModal → fill fields (validated on every change) → Enroll.',
      'handleEnroll: validate → duplicate check (first programme) → POST /api/enrollments → success toast → reload; the learner moves to Enrolled.',
    ] },
    { action: 'Move selected learners to another class', steps: [
      'Select rows → Move class → ReassignClassModal → submit → POST /api/students/reassign-class.',
      'Rows updated optimistically — but they keep showing the old class name (class_name_display defect) until a reload.',
    ] },
    { action: 'Delete all learners', steps: [
      'Red bin → confirm → type DELETE → DELETE /api/students/bulk/delete-all (session only) → every learner soft-deleted, every active enrollment closed → two success toasts → reload shows empty tabs.',
    ] },
  ],

  data: `**GET /api/students/enrolled?search=&lang=&class_id=&academic_year_id=&historical=true** → \`{ success, data: EnrolledStudent[] }\` — one row per ENROLLMENT (grouped per learner by the page), with localized \`display_name\`, \`class_name_display\`, \`stream_name_display\` and balance / total_charged / total_paid.
**GET /api/students/admitted?…** → \`{ success, data: Student[] }\`.
**Option lists**: /api/classes, /api/streams, /api/programs, /api/study-modes, /api/academic_years, /api/terms — any of \`{data}\`, \`{rows}\` or an array (standardizeResponse).
**GET /api/students/fingerprint-status** → \`{ data: number[], statuses: { [id]: { label, capture_status, pin, device_name, device_sn, finger_count, finger_indices, face_captured, face_requested } } }\`.
**Writes** (bodies as sent by the page): PUT /api/students/edit {id, field}; PATCH /api/students/:id/residency {residency_status}; POST /api/enrollments (EnrollmentFormData); POST /api/students/bulk/enroll; POST /api/enrollments/bulk-assign; POST /api/students/reassign-class {student_ids, new_class_id, reason}; POST /api/students/bulk/status {student_ids, status, reason}; POST /api/students/bulk/residency; POST /api/admin/comm/broadcast {message, audience}; DELETE /api/students/photo {student_id}; DELETE /api/students/delete {id}; DELETE /api/students/delete-permanent {id}; DELETE /api/students/bulk/delete-all; POST /api/students/enroll-fingerprint, /api/device/local-enroll, /api/device/relay-enroll, /api/students/enroll-face {student_id, device_sn|device_ip}; POST /api/finance/balances-batch {student_ids}.

**Browser storage**: localStorage drais_capture_mode, drais_local_device_ip, drais_relay_device_sn; DeviceSelector's preferred device.`,

  states: `- **Loading**: 12 skeleton rows; dropdowns empty until options load.
- **Empty / failed load**: the same "No enrolled learners" state — a failed request (toasted by apiFetch) is indistinguishable from a school with no learners once the toast is gone.
- **Options failed**: all six dropdowns empty (Promise.all) + two toasts.
- **Inline edit failure**: value rolls back, two error toasts (apiFetch + page).
- **Capture**: per-row pill states; local mode gives up after 90 s; relay and cloud polling never time out.
- **Bulk actions**: busy spinners on the bar buttons; most successes show two toasts (apiFetch + page).`,

  security: `- **Authorization lives in the API handlers** (middleware guards only /api/admin and /api/finance). On this route:
  - permission-checked: residency (academics.residency.manage), balances refresh (finance + finance.fees.manage), broadcast message (comm.dispatch.send), years/terms (academics module).
  - **session only**: /api/students/enrolled and /admitted (all learner names/balances), edit, enroll, bulk enroll, bulk programme assign, reassign class, bulk status, photo removal, soft delete, permanent delete (its comment claims an admin requirement that the code does not enforce), **delete-all**, and every biometric endpoint. Any signed-in user of the school — whatever their role — can perform these. [defect]
- **delete-all** has no permission, no audit row, and closes every active enrollment; the two client-side confirmations are its only protection. [recommended] Require an administrator permission and audit it server-side.
- Tenancy: every handler scopes by the session's school (spot-checked: delete-all, delete, delete-permanent).
- The students layout only checks that a session cookie exists.`,

  styling: `Full-height app-style layout (h-screen, sticky header 56 px + toolbar 48 px, only the table scrolls), slate/indigo palette with dark variants, compact 11–12 px type, zebra rows, hover-revealed row actions (invisible on touch screens). Responsive: most toolbar tools from sm; class/stream/type columns from sm/md; gender and residency editors from lg; the table keeps a 640 px minimum width. RTL: partly — names, numbers and pagination chevrons are handled, but many physical classes (left-/right-, ml-, mr-, text-left) are not mirrored, and the bulk bar, status/residency menus, several buttons and toasts are English literals.`,

  testing: `- **Tests**: none for this page or its APIs [unverified — no test file references students/list]. The pure helpers it uses (fingerprintLevel, safety helpers) may have their own tests under src/lib.
- **List empty unexpectedly**: Network → /api/students/enrolled?… — check the class/year filters (year switches to historical mode) and the response envelope.
- **Capture stuck**: the pill's tooltip holds the last message; for relay mode check that the relay agent is online; the in-flight guard needs a reload after relay/ADMS captures (defect).
- **Optimistic edit looks saved but is not**: watch for the second error toast; reload to see the server value.`,

  extend: [
    { change: 'Add a column', how: 'Add the field to the EnrolledStudent/Student interface (and to the API SELECT), a <th> in the head (respect the breakpoint pattern), a <td> in the row, and update SkeletonRow and the empty-state colSpan. Add translation keys under studentsList.col*.' },
    { change: 'Add a bulk action', how: 'Add a button to the bulk bar (lines 2238–2361) with a busy flag, a handler modelled on handleBulkResidency (selection check, apiFetch with successMessage — do not add a second showToast), and a server route with a real permission check and school scoping.' },
    { change: 'Protect destructive endpoints', how: 'In each session-only write route listed in M add `checkAnyPermission(session.userId, schoolId, [<permission>], session.isSuperAdmin)` like the residency route does; return 403; hide the controls for users without it.' },
    { change: 'Fix the stale class after "Move class"', how: 'In handleReassignClass also set `class_name_display` (and the matching entry in allEnrollments), or simply call fetchStudents() after success.' },
    { change: 'Release the capture guard', how: 'Call `enrollInFlight.current.delete(studentId)` in clearStudentEnroll (it is reached by every path\'s success, failure and timeout).' },
    { change: 'Debounce the search', how: 'Keep the input value in its own state and copy it into `search` after ~300 ms (as /attendance/logs does); cancel stale requests with an AbortController in fetchStudents.' },
    { change: 'Move the cell components out of the render', how: 'Declare AvatarCell, NameCell, GenderCell and ResidencyCell at module level and pass editingCell, editValue and the handlers as props, so React keeps them mounted between renders.' },
  ],
};

export default doc;
