import type { RouteDoc } from '@/lib/devdocs/route-doc';

const PAGE = 'src/app/attendance/holidays/page.tsx';
const API_LIST = 'src/app/api/admin/holidays/route.ts';
const API_ONE = 'src/app/api/admin/holidays/[id]/route.ts';

const doc: RouteDoc = {
  route: '/attendance/holidays',
  reviewed: { [PAGE]: 'a64885e70628', [API_LIST]: '4bc5fc55dcbd', [API_ONE]: '7f6403a6b6be' },

  identity: {
    purpose: 'Maintain the holidays table for a year: list the school\'s and national holidays grouped by month, add a holiday (date, name, scope) and remove one. Populating this table is what makes the attendance engine give a "holiday" verdict instead of marking everyone absent on that date.',
    users: 'School administrators / attendance officers (intended). In code: any signed-in user — see M.',
    permissions: 'Page: session (middleware). APIs: session only. National rows (school_id NULL) can be created and deleted only by a super admin; a school row only by its own school or a super admin.',
    upstream: 'holidays table (school_id NULL = national, applies to every school).',
    downstream: 'evaluateDay → isHolidayForSchool (src/lib/attendance/engine.ts) suppresses absent/late verdicts on a holiday date; the explanation engine ("Why?" on /attendance/logs) mentions it. Deleting a holiday does not re-evaluate days already judged.',
  },

  files: [
    { path: PAGE, role: 'Route entry: year picker, add form, month-grouped list with remove buttons.', shared: false },
    { path: API_LIST, role: 'GET/POST /api/admin/holidays — list for a year; create.', shared: false },
    { path: API_ONE, role: 'DELETE /api/admin/holidays/:id — remove, ownership-guarded.', shared: false },
  ],

  layout: `- **src/middleware.ts** → **AuthenticatedShell** (react-hot-toast \`<Toaster>\`, used by this page's \`toast\`) → **MainLayout**.
- **src/app/attendance/layout.tsx** — gradient background only.

All requests use a local plain fetcher / raw fetch — no global error toasts; errors are toasted by the page itself.`,

  tree: `HolidaysPage                               src/app/attendance/holidays/page.tsx
  ├─ header: title · intro · year <select> (year−1, year, year+1) · Add / Cancel
  ├─ <form> (when adding): Field(date) · Field(name) · Field(scope) · Cancel · Save
  └─ loading line | empty card | <section> per month
        └─ <li> per holiday: day number · weekday · name · national / school-wide / classes · remove
  data: useSWR /api/admin/holidays?year= (local fetcher)`,

  notes: {
    [PAGE]: {
      'import:react': '`useState` (year, form, flags) and `useMemo` (month grouping).',
      'import:swr': 'The holiday list.',
      'import:lucide-react': 'Icons.',
      'import:react-hot-toast': '`toast.success / toast.error` (react-hot-toast, rendered by the shell\'s Toaster — not the app\'s SweetAlert `showToast`).',
      'import:@/components/i18n/I18nProvider': '`useI18n()` — t, lang, digits, formatDate.',
      fetcher: 'Plain `fetch(u).then(r => r.json())` — no status check; an error body becomes `data` and the list is simply empty.',
      Holiday: 'Row shape: id, school_id (null = national), holiday_date, name, scope national|school|class, applies_to_classes, created_at.',
      FormState: "Add form: date, name, scope 'school' | 'class' (national is super-admin only and not offered).",
      todayIso: 'Today as YYYY-MM-DD from the browser\'s local calendar.',
      'todayIso.d': 'Now.',
      'todayIso.return#1': 'Formatted date.',
      HolidaysPage: 'The route\'s default export.',
      'HolidaysPage.{ t, lang, digits, formatDate }': 'i18n helpers.',
      'HolidaysPage.[year, setYear]': 'Year shown; starts at the browser\'s current year. The select offers year−1, year, year+1 around the CURRENT selection, so the user can walk further one year at a time.',
      'HolidaysPage.{ data, mutate, isLoading }': 'useSWR GET /api/admin/holidays?year= with the local fetcher; `mutate()` after add/remove.',
      'HolidaysPage.holidays': '`data.holidays` or empty.',
      'HolidaysPage.[creating, setCreating]': 'Add form visible.',
      'HolidaysPage.[form, setForm]': 'Form values: today, empty name, school scope.',
      'HolidaysPage.[saving, setSaving]': 'Save in flight.',
      'HolidaysPage.grouped': 'Holidays bucketed by "YYYY-MM" (first 7 characters of holiday_date) and sorted by month.\n\nholiday_date arrives as an ISO timestamp at UTC midnight ("2026-10-09T00:00:00.000Z"): the mysql2 pool uses `timezone: "Z"` without `dateStrings` (src/lib/db/pools.ts), so a DATE column becomes a Date. The slices still give the right month and day because it is UTC midnight.',
      'HolidaysPage.submitNew': 'Prevent the native submit; name required (toast). POST {holiday_date, name, scope}. Error → toast with the server message (409 duplicate date+name, 400 bad date). Success → toast, reset the form, close it, refetch.\n\nChoosing scope "classes" sends no `applies_to_classes`, so the row is stored with an empty class list — and see the engine note in M: the scope is not applied anyway.',
      'HolidaysPage.remove': 'window.confirm with name and date → DELETE /api/admin/holidays/:id → toast → refetch. Errors (403 for national rows or another school\'s row) are toasted.\n\nThe confirm text interpolates the raw `holiday_date`, i.e. the full ISO timestamp ("2026-10-09T00:00:00.000Z") rather than a readable date.',
      'HolidaysPage.render#1': 'Header (title, intro, year select with Arabic digits, Add/Cancel toggle); the add form (1 → 3 columns on sm); then loading, the dashed empty card ("No holidays in <year>") or one bordered section per month (header = month name — Arabic via formatDate, else toLocaleString) with a row per holiday: day number (Arabic digits), short weekday, name, a globe "National" or school icon with "School-wide" / "Classes: …", and a bin.\n\nThe English weekday and month come from `new Date(<UTC midnight>)` in the BROWSER\'s timezone; west of UTC they would show the previous day. Correct for East Africa (UTC+3).',
      inputCls: 'Shared input/select classes (light/dark).',
      Field: 'Small label + control wrapper (like FilterField).',
      'Field.render#1': '<label> with the text above the control.',
    },

    [API_LIST]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      'import:@/lib/db': '`query`.',
      'import:@/lib/attendance/migrations/attendance-tables-schema': '`ensureAttendanceEngineSchema()` — creates the holidays table if missing (with UNIQUE(school_id, holiday_date, name)).',
      runtime: "'nodejs'.",
      VALID_SCOPES: 'national, school, class.',
      GET: 'Holidays of one year for the school, national rows included, ordered by date. Session only.',
      'GET.session': 'Session.',
      'GET.guard#1': 'No session → 401.',
      'GET.url': 'Parsed URL.',
      'GET.yearRaw': '`?year=`.',
      'GET.year': 'Valid year (> 1900) or the server\'s current year.',
      'GET.targetSchoolId': 'Super admins may pass `?school_id=`; everyone else gets their own school.',
      'GET.rows': 'WHERE (school_id = target OR national) AND YEAR(holiday_date) = year.',
      'GET.return#1': '{success, year, holidays}.',
      POST: 'Create a holiday. Session only — no permission check.',
      'POST.session': 'Session.',
      'POST.guard#1': 'No session → 401.',
      'POST.body': 'Typed body: holiday_date, name, scope, applies_to_classes, school_id (super admin).',
      'POST.catch#1': 'Invalid JSON → 400.',
      'POST.guard#2': 'Date and name required → 400.',
      'POST.guard#3': 'Date must be YYYY-MM-DD → 400 (format only; "2026-02-31" passes and MySQL decides).',
      'POST.scope': 'Requested scope, default school.',
      'POST.guard#4': 'Unknown scope → 400. A non-super-admin CAN send scope "national"; the row is still pinned to their school (school_id set), so it is a school holiday labelled national.',
      'POST.targetSchoolId': 'Super admin: null (national) when body.school_id is null, another school when given, else own. Others: own school.',
      'POST.guard#5': 'Super-admin branch (see targetSchoolId).',
      'POST.result': 'INSERT … created_by = user. The name is stored untrimmed as sent (the page trims).',
      'POST.return#1': '{success, holiday}.',
      'POST.catch#2': 'Duplicate (same school, date, name) → 409; other errors → 500 with the message.',
    },

    [API_ONE]: {
      'import:next/server': 'NextRequest / NextResponse.',
      'import:@/lib/auth': '`getSessionSchoolId`.',
      'import:@/lib/db': '`query`.',
      runtime: "'nodejs'.",
      DELETE: 'Remove one holiday. Past attendance_records judged "holiday" for that date stay as they are (historical truth) until the day is re-evaluated.',
      'DELETE.session': 'Session.',
      'DELETE.guard#1': 'No session → 401.',
      'DELETE.{ id: idRaw }': 'Route param (awaited — Next 15).',
      'DELETE.id': 'Numeric id.',
      'DELETE.guard#2': 'Invalid → 400.',
      'DELETE.rows': 'Owner lookup (not school-filtered, so ownership can be judged).',
      'DELETE.guard#3': 'Not found → 404.',
      'DELETE.owner': 'school_id of the row.',
      'DELETE.guard#4': 'National row and not super admin → 403.',
      'DELETE.guard#5': 'Another school\'s row and not super admin → 403.',
      'DELETE.result': 'DELETE by id.',
      'DELETE.return#1': '{success, deleted}.',
    },
  },

  ui: [
    { title: 'Header', text: 'Calendar icon, "Holidays", a short explanation that holidays stop learners being marked absent, a year select (previous / current / next of the shown year) and an Add / Cancel button.' },
    { title: 'Add form', text: 'Date (defaults to today), name (e.g. "Independence Day"), scope (This school / Selected classes), Cancel and Save (spinner while saving).' },
    { title: 'List', text: 'One card per month (month and year as the header). Each holiday: big day number with the short weekday, the name, "National" (globe) or "School-wide" / "Classes: …" (school icon), and a bin that turns red on hover.' },
    { title: 'Empty / loading', text: '"Loading…" with a spinner; a dashed card "No holidays recorded for <year>".' },
  ],

  interactions: [
    { action: 'Open the page', steps: ['useSWR GET /api/admin/holidays?year=<this year> → ensure schema → school + national rows of the year → grouped by month.'] },
    { action: 'Add a holiday', steps: [
      'Add → form → date, name, scope → Save → name check → POST /api/admin/holidays.',
      'Server: session → JSON/date/scope checks → INSERT (409 on duplicate).',
      'Toast → form reset and closed → refetch → the holiday appears in its month.',
      'From now on evaluateDay for that date gives "holiday" instead of absent/late for everyone in the school (days already evaluated change only when re-evaluated).',
    ] },
    { action: 'Remove a holiday', steps: [
      'Bin → confirm → DELETE /api/admin/holidays/:id → ownership checks → DELETE → toast → refetch.',
    ] },
    { action: 'Change the year', steps: ['Select → setYear → SWR key changes → fetch that year.'] },
  ],

  data: `**GET /api/admin/holidays?year=YYYY[&school_id=]** → \`{ success, year, holidays: [{ id, school_id|null, holiday_date (UTC-midnight ISO), name, scope, applies_to_classes, created_at }] }\`.
**POST /api/admin/holidays** \`{ holiday_date: 'YYYY-MM-DD', name, scope?: 'school'|'class'|'national', applies_to_classes?, school_id? (super admin; null = national) }\` → \`{ success, holiday }\` | 400 | 409.
**DELETE /api/admin/holidays/:id** → \`{ success, deleted }\` | 400 | 403 | 404.

Table holidays: id, school_id (NULL = national), holiday_date (DATE), name, scope, applies_to_classes, created_by, created_at; UNIQUE(school_id, holiday_date, name).`,

  states: `- **Loading**: spinner line.
- **Empty year**: dashed card.
- **List request fails / 401**: no toast — the plain fetcher returns the error body, \`holidays\` is missing, and the empty card shows.
- **Add / remove fails**: toast with the server message; the form stays open on failure.`,

  security: `- **No permission check** on list, create or delete — any signed-in user of the school can add or remove a school holiday. A holiday suppresses absent/late verdicts (and therefore absence SMS) for everyone on that date, so this is effectively an attendance-override capability. [recommended] Require attendance.manage (or a holidays permission) in POST and DELETE.
- Tenancy: non-super-admins are pinned to their own school for list and create; delete checks ownership; national rows need a super admin.
- **[defect] Scope is not enforced.** The engine's isHolidayForSchool matches only \`holiday_date\` and \`school_id = ? OR NULL\` — it ignores \`scope\` and \`applies_to_classes\`. A "Selected classes" holiday therefore applies to the whole school, staff included. The page also never sends a class list.
- Deleting a holiday leaves past "holiday" verdicts in attendance_records until those days are re-evaluated (documented behaviour in the delete handler).`,

  styling: `Tailwind gray/indigo with explicit dark variants; max-w-4xl single column; the form is 1 → 3 columns from sm. RTL: digits and month/weekday names via \`digits\` / \`formatDate\` in Arabic; the layout uses flex with gaps (no left/right specifics). The year select and Add button sit on the header's right side (start/end follow the document direction).`,

  testing: `- **Tests**: none for these routes or the page. The holiday verdict itself (isHoliday = true) is covered by rule-evaluator.test.mjs, explanation.test.mjs and engine-timezone.test.mjs in src/lib/attendance/__tests__; nothing tests the database lookup isHolidayForSchool.
- **Holiday not taking effect**: check the row's holiday_date and school_id; then re-evaluate the day (days evaluated before the holiday was added keep their old verdict).
- **Duplicate error**: the same name on the same date already exists for the school.`,

  extend: [
    { change: 'Make class-scoped holidays real', how: 'Send the chosen class ids as `applies_to_classes` from the form (multi-select from /api/classes), and in isHolidayForSchool load scope + applies_to_classes and match the person\'s class (students via enrollments). Staff should be exempt from class holidays.' },
    { change: 'Re-evaluate when a holiday changes', how: 'After INSERT/DELETE, re-run evaluateDay for every person with a record (or roster) on that date — in a background job, since it touches the whole school.' },
    { change: 'Restrict who can edit holidays', how: 'Add requirePermission(..., "attendance.manage", ...) to POST and DELETE (keep GET open to readers), and hide Add / bin for users without it.' },
    { change: 'Show readable dates in the confirm', how: 'Use `h.holiday_date.slice(0, 10)` (or formatDate) in the confirm text.' },
  ],
};

export default doc;
