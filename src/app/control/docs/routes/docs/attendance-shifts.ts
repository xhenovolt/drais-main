import type { RouteDoc } from '@/lib/devdocs/route-doc';

const PAGE = 'src/app/attendance/shifts/page.tsx';
const API_SHIFTS = 'src/app/api/attendance/shifts/route.ts';
const API_ASSIGN = 'src/app/api/attendance/shifts/assignments/route.ts';

const doc: RouteDoc = {
  route: '/attendance/shifts',
  reviewed: { [PAGE]: '6edaf7383b43', [API_SHIFTS]: '8edd888a6da8', [API_ASSIGN]: '6f30328f3902' },

  identity: {
    purpose: 'Shift management for the shift engine (migration 034): create a shift (times, arrival window, late / early-leave thresholds, overtime, working days), list and archive shifts, assign a shift to the whole school or a department, and simulate how an arrival/departure would be classified — with the same pure `classifyPunch` the evaluator uses, run in the browser.',
    users: 'Attendance administrators. Reading needs attendance.sessions.view, every change attendance.sessions.manage (school admins hold both through the attendance.* wildcard).',
    permissions: 'Page: session (middleware) — no page-level check; without attendance.sessions.view the list request returns 403 and the page shows "No shifts" (see L). APIs: guard() in each handler → requirePermission.',
    upstream: 'shifts and shift_assignments tables; departments (/api/departments) for the department picker.',
    downstream: 'The attendance engine resolves each staff member\'s shift by precedence staff > department > role > school (resolveShift in src/lib/attendance/shifts.ts) and evaluates their day against it — shift verdicts carry a negative rule_id (see the /attendance/logs "Why?" explanation, "assigned staff shift"). Linked from /attendance/settings (the back arrow returns there).',
  },

  files: [
    { path: PAGE, role: 'Route entry: create form, shift list, assignment form, simulator.', shared: false },
    { path: API_SHIFTS, role: '/api/attendance/shifts — list, create, update (unused by the page), archive.', shared: false },
    { path: API_ASSIGN, role: '/api/attendance/shifts/assignments — create (used), list and archive (not used by the page).', shared: false },
  ],

  layout: `- **src/middleware.ts** → **AuthenticatedShell** (mounts react-hot-toast's \`<Toaster>\`, which this page's \`toast\` calls render into) → **MainLayout**.
- **src/app/attendance/layout.tsx** — gradient background only.

The page uses the shared shadcn-style UI kit from \`@/components/ui\` (Card, Button, Input, Label, Select, Badge — Radix Select underneath). Those primitives are explained once with the shared-infrastructure document (route \`/\`), not here.

Requests use a local fetcher and raw fetch — the shell's swrFetcher toasts do not apply. URLs are built from \`NEXT_PUBLIC_API_BASE || '/api'\`, which is also why the generated reference cannot link this page to its endpoints (it only resolves literal URLs).`,

  tree: `ShiftsPage                                 src/app/attendance/shifts/page.tsx
  ├─ header: back link (/attendance/settings) · title · subtitle
  ├─ Card "Create shift"
  │    name · code · applies to (Select) · start · end · arrival window · late after ·
  │    early leave · overtime after · working-day toggles ×7 · overnight hint · Create
  ├─ Card "Shifts (N)" — one row per shift: name · code · overnight · times · days · late > n · assigned count · archive
  ├─ Card "Assign" — shift (Select) · to: whole school | department · department (Select) · Assign
  └─ Card "Simulator" — shift · arrival · departure → result badges (on time / late n / early leave / overtime / overnight)
  data: useSWR /api/attendance/shifts, useSWR /api/departments (both via the local fetcher)`,

  notes: {
    [PAGE]: {
      'import:react': '`useState` for the form/selections and `useMemo` for the simulator result.',
      'import:swr': '`useSWR` for the shift list and departments, each with the page\'s own fetcher.',
      'import:next/link': 'Back link to /attendance/settings.',
      'import:lucide-react': 'Icons.',
      'import:react-hot-toast': '`toast.success / toast.error` — this page uses react-hot-toast directly, not the app\'s `showToast` (SweetAlert2). Both appear top-right but look different. [recommended] use `@/lib/toast` in new code.',
      'import:@/components/ui': 'Card*, Button, Input, Label, Select*, Badge from the shared UI kit.',
      'import:@/lib/attendance/shifts': '`classifyPunch(shift, arrivalMin, departureMin)` (pure: late if arrival − start > late threshold; early leave if end − departure > early threshold; overtime when departure − end ≥ overtime-after; night shifts shift the end by a day), `toMinutes("HH:MM")`, and the `Shift` type. The arrival window and working days are NOT part of classifyPunch — the simulator ignores them.',
      'import:@/components/i18n/I18nProvider': '`useI18n()` — t, lang, digits.',
      API: 'API base: `NEXT_PUBLIC_API_BASE` or "/api".',
      fetcher: 'Plain `fetch(u).then(r => r.json())` — no status check, so an error body (403/500) is returned as data.',
      DAYS: 'Mon … Sun. Index = bit in `weekday_mask` (bit 0 = Monday … bit 6 = Sunday), the same convention as weekdayBit in the shift library. 31 = Mon–Fri.',
      ShiftRow: 'Row shape from GET /api/attendance/shifts (times as "HH:MM:SS", crosses_midnight 0/1, assignment_count). The API also returns effective_from/to, not typed here.',
      Dept: '{id, name}.',
      hhmm: '"HH:MM:SS" → "HH:MM".',
      maskDays: 'Mask → "Mon Tue …" in English. Unused — the list uses the translated `tdays`.',
      ShiftsPage: 'The route\'s default export.',
      'ShiftsPage.{ t, lang, digits }': 'i18n helpers.',
      'ShiftsPage.tdays': 'Mask → translated day names, joined with the Arabic comma in Arabic.',
      'ShiftsPage.{ data: shiftsRes, mutate }': 'useSWR GET /api/attendance/shifts; `mutate()` refetches after create / archive / assign.',
      'ShiftsPage.{ data: deptRes }': 'useSWR GET /api/departments (staff-roles module endpoint).',
      'ShiftsPage.shifts': '`rows` or empty — on a 403 the body has no rows, so the list silently shows "No shifts yet".',
      'ShiftsPage.depts': 'Departments from `data` or `rows`.',
      'ShiftsPage.[busy, setBusy]': 'One flag for every write; disables Create and Assign (not the archive buttons).',
      'ShiftsPage.[f, setF]': 'Create form: name, code, applies_to (staff), start 07:00, end 13:00, arrival window 30, late 15, early leave 30, overtime after "" (none), weekday_mask 31 (Mon–Fri). Numbers are stored with unary `+` — an emptied field becomes 0.',
      'ShiftsPage.toggleDay': 'XOR the day\'s bit in weekday_mask.',
      'ShiftsPage.createShift': 'Name required (toast). POST /api/attendance/shifts with the whole form. Error → toast with the server message. Success → clear name and code only (times and thresholds stay for the next shift), refetch, toast.\n\n**[defect]** The server applies `Number(x) || default` to arrival window (30), late threshold (15) and early leave (30), so entering **0** ("no grace") is silently stored as the default. PATCH uses `|| 0` correctly, but the page has no edit UI.',
      'ShiftsPage.removeShift': 'window.confirm → DELETE /api/attendance/shifts?id= → the shift and all its assignments become status \'archived\' (rows kept). Refetch, toast.',
      'ShiftsPage.[assignShift, setAssignShift]': 'Shift id (string) to assign.',
      'ShiftsPage.[assignTarget, setAssignTarget]': "'school' | 'department'. The API also supports 'staff' and 'role'; the page does not offer them.",
      'ShiftsPage.[assignDept, setAssignDept]': 'Department id for a department assignment.',
      'ShiftsPage.addAssignment': 'Validates shift (and department) → POST /api/attendance/shifts/assignments {shift_id, target_type, target_id?} → refetch (assignment counts) → toast.\n\nThere is no duplicate check and no way on this page to see or remove an individual assignment (GET/DELETE of assignments exist but are unused); assigning twice creates two active rows. The only removal is archiving the whole shift.',
      'ShiftsPage.[simShiftId, setSimShiftId]': 'Simulator shift.',
      'ShiftsPage.[simArrival, setSimArrival]': 'Simulated arrival "HH:MM" (default 07:20).',
      'ShiftsPage.[simDeparture, setSimDeparture]': 'Simulated departure (default 13:00).',
      'ShiftsPage.simResult': 'Maps the selected row to the engine\'s Shift and runs classifyPunch with the two times (an emptied time = no punch). Recomputed whenever inputs change — no server call.',
      'ShiftsPage.render#1': 'Four cards in a max-w-5xl column: the create form (1 → 4 columns on sm for the first row, 2 → 6 for the times/thresholds; amber hint when end ≤ start, i.e. overnight); the shift list (code and "overnight" badges, times in Arabic digits when Arabic, translated days or "no days", "late > n min", assigned-count badge, red archive button); the assignment row (department select appears only for department); the simulator with result badges.',
    },

    [API_SHIFTS]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      'import:@/lib/rbac': '`requirePermission(user, school, perm, isSuperAdmin)` — throws when missing.',
      'import:@/lib/db': '`query`.',
      runtime: "'nodejs'.",
      guard: 'Shared check for every handler: session, then the given permission. Returns {session} or {error: response}.',
      'guard.session': 'Session.',
      'guard.guard#1': 'No session → 401.',
      'guard.catch#1': 'Missing permission → 403 with the message.',
      'guard.return#1': '{session}.',
      computeCrossesMidnight: 'end ≤ start → 1 (shift wraps past midnight, e.g. 18:00 → 06:00). Stored so queries need not recompute it.',
      'computeCrossesMidnight.m': '"HH:MM" → minutes.',
      'computeCrossesMidnight.return#1': '1 or 0.',
      GET: 'This school\'s non-archived shifts ordered by start time then name, each with the number of active assignments. Needs attendance.sessions.view.',
      'GET.g': 'Guard result.',
      'GET.guard#1': 'Refused → its response.',
      'GET.rows': 'Shift rows + assignment_count (correlated COUNT).',
      'GET.return#1': '{success, rows}.',
      POST: 'Create a shift. Needs attendance.sessions.manage.',
      'POST.g': 'Guard result.',
      'POST.guard#1': 'Refused → its response.',
      'POST.b': 'Body (invalid JSON → null).',
      'POST.name': 'Trimmed name.',
      'POST.guard#2': 'Name, start and end required → 400. Times are not format-validated.',
      'POST.res': 'INSERT with defaults: applies_to staff unless staff|learner|both; arrival 30, late 15, early 30 (each `|| default`, so 0 becomes the default — see createShift); overtime null when empty; weekday_mask 31 when not numeric; crosses_midnight computed; status active; created_by.',
      'POST.return#1': '201 {success, id}.',
      PATCH: 'Partial update of a shift (`?id=`). Not used by this page.',
      'PATCH.g': 'Guard result.',
      'PATCH.guard#1': 'Refused → its response.',
      'PATCH.id': 'Shift id.',
      'PATCH.guard#2': 'No id → 400.',
      'PATCH.b': 'Body.',
      'PATCH.sets': 'SET fragments.',
      'PATCH.params': 'Values.',
      'PATCH.set': 'Adds one column=? pair.',
      'PATCH.guard#3': 'name.',
      'PATCH.guard#4': 'code.',
      'PATCH.guard#5': 'applies_to (only valid values).',
      'PATCH.guard#6': 'start_time.',
      'PATCH.guard#7': 'end_time.',
      'PATCH.guard#8': 'arrival_window_minutes (`|| 0`, so 0 is kept).',
      'PATCH.guard#9': 'late_threshold_minutes.',
      'PATCH.guard#10': 'early_leave_threshold_minutes.',
      'PATCH.guard#11': 'overtime_after_minutes (empty → null).',
      'PATCH.guard#12': 'weekday_mask.',
      'PATCH.guard#13': 'effective_from.',
      'PATCH.guard#14': 'effective_to.',
      'PATCH.guard#15': 'status (any string; empty → active).',
      'PATCH.guard#16': 'Either time changed → reread the stored times and recompute crosses_midnight.',
      'PATCH.guard#17': 'Nothing to update → 400.',
      'PATCH.return#1': 'UPDATE … WHERE id AND school_id → {success} (also when no row matched).',
      DELETE: 'Archive a shift (`?id=`): its assignments first, then the shift. Soft — rows stay.',
      'DELETE.g': 'Guard result.',
      'DELETE.guard#1': 'Refused → its response.',
      'DELETE.id': 'Shift id.',
      'DELETE.guard#2': 'No id → 400.',
      'DELETE.return#1': '{success}.',
    },

    [API_ASSIGN]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      'import:@/lib/rbac': '`requirePermission`.',
      'import:@/lib/db': '`query`.',
      runtime: "'nodejs'.",
      TARGETS: "Valid target types: staff, department, role, school (precedence in that order when the engine resolves a staff member's shift).",
      guard: 'Same session + permission check as the shifts route (duplicated code).',
      'guard.session': 'Session.',
      'guard.guard#1': 'No session → 401.',
      'guard.catch#1': 'Missing permission → 403.',
      'guard.return#1': '{session}.',
      GET: 'Active assignments with shift name and a human target label (Whole school / department / role / staff name), ordered by precedence. Not used by this page.',
      'GET.g': 'Guard (view).',
      'GET.guard#1': 'Refused → its response.',
      'GET.rows': 'Assignments + labels (scalar subqueries per target type).',
      'GET.return#1': '{success, rows}.',
      POST: 'Create an assignment. Needs attendance.sessions.manage.',
      'POST.g': 'Guard (manage).',
      'POST.guard#1': 'Refused → its response.',
      'POST.b': 'Body.',
      'POST.guard#2': 'shift_id and a valid target_type required → 400.',
      'POST.guard#3': 'Non-school targets need target_id → 400.',
      'POST.[own]': 'The shift, if it belongs to this school.',
      'POST.guard#4': 'Not this school\'s shift → 404 (no cross-tenant assignment). The target id (department/role/staff) is NOT checked against the school.',
      'POST.res': 'INSERT active assignment (school target → target_id NULL) with optional effective dates.',
      'POST.return#1': '201 {success, id}.',
      DELETE: 'Archive one assignment (`?id=`). Not used by this page.',
      'DELETE.g': 'Guard (manage).',
      'DELETE.guard#1': 'Refused → its response.',
      'DELETE.id': 'Assignment id.',
      'DELETE.guard#2': 'No id → 400.',
      'DELETE.return#1': '{success}.',
    },
  },

  ui: [
    { title: 'Header', text: 'Back arrow to Attendance settings (flips in RTL), clock icon, "Shifts", subtitle.' },
    { title: 'Create shift', text: 'Name, code, applies to (staff / learners / both); start, end, arrival window, late after (min), early leave (min), overtime after (min, blank = none); seven day toggles (Mon–Fri on by default); an amber note when the end is not after the start ("crosses midnight"); Create button.' },
    { title: 'Shift list', text: '"Shifts (N)". Each row: name, code badge, "overnight" badge, start–end · days · late > n min, "N assigned" badge, red bin to archive (with a browser confirm). "No shifts yet" when empty.' },
    { title: 'Assign', text: 'Shift picker, target (whole school / department), department picker when needed, Assign.' },
    { title: 'Simulator', text: 'Shift, arrival and departure times → badges: on time (green) or late n min or no arrival; early leave n min (amber); overtime n min (indigo); overnight shift. "Pick a shift to preview" until one is chosen.' },
  ],

  interactions: [
    { action: 'Open the page', steps: [
      'useSWR GET /api/attendance/shifts → guard(attendance.sessions.view) → rows with assignment counts.',
      'useSWR GET /api/departments for the picker.',
    ] },
    { action: 'Create a shift', steps: [
      'Fill the form → Create → name check → POST /api/attendance/shifts (whole form).',
      'guard(manage) → validation (name, times) → INSERT with defaults and crosses_midnight → 201.',
      'Name/code cleared → mutate() → the shift appears in the list → toast.',
    ] },
    { action: 'Assign to a department', steps: [
      'Pick shift, "Department", a department → Assign → POST assignments {shift_id, target_type: department, target_id}.',
      'guard(manage) → shift ownership → INSERT → 201 → refetch → the shift\'s "assigned" count goes up.',
      'From now on the engine uses this shift for that department\'s staff unless a staff-level assignment overrides it.',
    ] },
    { action: 'Archive a shift', steps: [
      'Bin → confirm → DELETE /api/attendance/shifts?id= → assignments and shift archived → refetch → row disappears.',
    ] },
    { action: 'Simulate', steps: [
      'Pick a shift, change arrival/departure → simResult (useMemo) → classifyPunch in the browser → badges update instantly. No request.',
    ] },
  ],

  data: `**GET /api/attendance/shifts** → \`{ success, rows: [{ id, name, code, applies_to, start_time, end_time, arrival_window_minutes, late_threshold_minutes, early_leave_threshold_minutes, overtime_after_minutes, weekday_mask, crosses_midnight, effective_from, effective_to, status, assignment_count }] }\`.
**POST /api/attendance/shifts** body = the form (\`name, code, applies_to, start_time, end_time, arrival_window_minutes, late_threshold_minutes, early_leave_threshold_minutes, overtime_after_minutes, weekday_mask\`, optional effective_from/to) → 201 \`{success, id}\`.
**DELETE /api/attendance/shifts?id=** → \`{success}\`. **PATCH ?id=** partial body → \`{success}\` (unused here).
**POST /api/attendance/shifts/assignments** \`{ shift_id, target_type: school|department|role|staff, target_id?, effective_from?, effective_to? }\` → 201 \`{success, id}\`. GET / DELETE ?id= exist for other callers.
**GET /api/departments** → \`{ data | rows: [{id, name}] }\` (documented with the staff module).

Tables: shifts (school_id, times, thresholds, weekday_mask bit 0 = Monday, crosses_midnight, effective range, status active|archived, created_by), shift_assignments (shift_id, target_type, target_id, effective range, status). The engine reads both through resolveShift.`,

  states: `- **Loading**: the list shows "No shifts yet" (0) until data arrives — there is no loading indicator.
- **No permission / API error**: the local fetcher returns the error JSON as data, \`rows\` is missing, and the page shows "No shifts yet" with no message. Writes show the server error in a toast.
- **Empty**: "No shifts yet"; the selects are empty; the simulator says "Pick a shift to preview".
- **Validation**: name required (client toast); pick a shift / department (client toasts); server 400s are toasted.`,

  security: `- Reads: attendance.sessions.view; writes: attendance.sessions.manage — enforced in each handler's \`guard()\`. The page itself does not hide the forms from read-only users; they get a 403 toast on save.
- School scoping: every query filters by the session's school; an assignment's shift must belong to the school (404 otherwise). The assignment's target id is not checked for school ownership — a foreign department id would create an assignment that never matches anyone in this school.
- Archiving is soft (status), so history that referenced a shift keeps its meaning.
- Changing or assigning a shift changes how future days are evaluated; neither handler calls the evaluator, so past days keep their verdicts until something re-evaluates them.`,

  styling: `Uses the design-system tokens (\`text-foreground\`, \`text-muted-foreground\`, \`border-border\`, \`bg-primary/10\`, \`bg-muted\`) via the UI kit, so it follows light/dark theme and the theming system's palette. Single column (max-w-5xl) with responsive inner grids (1 → 4, 2 → 6 columns from sm). RTL: \`ms-*\`, \`rtl-flip\` on the back arrow, translated day names joined with the Arabic comma, Arabic digits for times.`,

  testing: `- **Existing tests**: src/lib/attendance/__tests__/shifts.test.mjs covers the pure shift engine (classifyPunch, resolveShift, weekdayBit). Run \`npm run test:attendance\`. The API routes and the page have no tests.
- **A staff member uses the wrong shift**: check shift_assignments for staff > department > role > school assignments (precedence), their effective dates, and the shift's weekday_mask for that day.
- **Simulator disagrees with real verdicts**: the simulator ignores the arrival window, working days and effective dates; real evaluation also applies rules, holidays and overrides.`,

  extend: [
    { change: 'Allow a zero threshold at creation', how: 'In POST /api/attendance/shifts replace `Number(x) || default` with a null/empty check (as PATCH does) so 0 is stored. Keep the client sending numbers.' },
    { change: 'Show and remove individual assignments', how: 'useSWR GET /api/attendance/shifts/assignments (rows carry target_label and shift_name) and render them with a remove button calling DELETE /assignments?id=. Prevent duplicates by checking for an active (shift, target) row in POST.' },
    { change: 'Assign to one staff member or a role', how: 'Add "staff"/"role" to the target select with a picker (/api/staff, roles); the API already accepts them. Validate the target belongs to the school in POST.' },
    { change: 'Edit a shift', how: 'Reuse the create form in an edit mode and call PATCH /api/attendance/shifts?id= with only the changed fields; crosses_midnight is recomputed by the server.' },
  ],
};

export default doc;
