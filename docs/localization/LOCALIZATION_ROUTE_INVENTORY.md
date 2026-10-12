# DRAIS Localization — Route Inventory

_Generated 2026-10-12 by `scripts/l10n-audit.mjs` from the code as it stood at that commit. Re-run the script to refresh; do not hand-edit the generated tables. Hand-written verification records go in the "Verification log" section at the end._

## How to read this

- **Every row is a real route**, discovered from `src/app/**/page.tsx` (API routes excluded). There are **309** of them.
- **Sidebar location** comes from `src/lib/navigationConfig.tsx`. "Not in sidebar" means the page is reached by a link, a button or a URL, not a menu item.
- **Translated calls / Hardcoded** are counts across the page file *and every component it renders* (import graph, 4 levels deep, layout chrome excluded). "Hardcoded" is an estimate of visible English strings written directly in the code: text between tags, `placeholder`/`title`/`label` attributes, toast and dialog messages, and table/column labels.
- **These numbers are a static estimate, not proof.** They tell us where the work is; they do not show that Arabic renders. A route is only "done" when the four verification columns are filled in from a real browser check.
- **Status** is derived from those counts: *Not translated* = no translated calls at all; *Partial* = some; *Mostly wired* = at least 90% of visible strings go through the translator **and** no child component bypasses it. "Mostly wired" still needs a browser check — see finding F4 in the architecture audit (English fallbacks can hide missing Arabic).

## Progress — measured by verified routes, not dictionary size

| Indicator | Count | What it proves |
|---|---|---|
| Routes discovered | 309 of 309 | Scope is known |
| Routes with a static text count and component list | 309 of 309 | We know roughly how much text each route has and where it lives |
| Routes with a full string-by-string inventory | 0 of 309 | Done per route at the start of its phase (Students first) |
| Routes translated | 0 newly; 12 were already mostly wired before this audit | Translation implementation exists |
| Routes browser-tested in Arabic | 0 of 309 | Arabic actually renders |
| Routes with critical interactions re-tested | 0 of 309 | Translation did not break functionality |
| Shared components regression-tested | 0 | Fixes work beyond one page |

## Static status by sidebar section

| Section | Routes | Not translated | Partial (under half) | Partial (over half) | Mostly wired | Translated calls | Hardcoded (est.) |
|---|---|---|---|---|---|---|---|
| Overview | 2 | 1 | 1 | 0 | 0 | 15 | 34 |
| Attendance | 14 | 9 | 0 | 2 | 3 | 236 | 569 |
| Gate & Movement | 4 | 4 | 0 | 0 | 0 | 0 | 109 |
| Devices & Biometrics | 10 | 8 | 0 | 0 | 2 | 38 | 477 |
| Communication | 4 | 3 | 1 | 0 | 0 | 6 | 267 |
| Students | 13 | 12 | 1 | 0 | 0 | 101 | 1128 |
| Staff & Roles | 18 | 7 | 10 | 1 | 0 | 64 | 762 |
| Academics | 23 | 14 | 7 | 2 | 0 | 109 | 1159 |
| Documents & Assessment | 9 | 2 | 5 | 0 | 2 | 97 | 1100 |
| Finance | 26 | 18 | 6 | 0 | 2 | 64 | 719 |
| Inventory | 4 | 4 | 0 | 0 | 0 | 0 | 65 |
| Tahfiz | 13 | 5 | 5 | 2 | 1 | 77 | 557 |
| Reports | 6 | 4 | 0 | 2 | 0 | 57 | 59 |
| Settings | 15 | 8 | 5 | 0 | 1 | 42 | 564 |
| Offline Workspace (Beta) | 5 | 5 | 0 | 0 | 0 | 0 | 200 |
| Help & Guides | 14 | 14 | 0 | 0 | 0 | 0 | 1007 |
| Not in sidebar — /academics | 2 | 1 | 1 | 0 | 0 | 24 | 127 |
| Not in sidebar — /admin | 3 | 2 | 0 | 0 | 0 | 0 | 147 |
| Not in sidebar — /auth | 2 | 2 | 0 | 0 | 0 | 0 | 38 |
| Not in sidebar — /backup | 1 | 1 | 0 | 0 | 0 | 0 | 20 |
| Not in sidebar — /control | 64 | 62 | 2 | 0 | 0 | 4 | 4558 |
| Not in sidebar — /deadlines | 1 | 1 | 0 | 0 | 0 | 0 | 1 |
| Not in sidebar — /departments | 1 | 1 | 0 | 0 | 0 | 0 | 21 |
| Not in sidebar — /docs | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Not in sidebar — /documents | 1 | 0 | 0 | 1 | 0 | 10 | 2 |
| Not in sidebar — /events | 1 | 0 | 0 | 1 | 0 | 5 | 0 |
| Not in sidebar — /fingerprint-auth | 1 | 1 | 0 | 0 | 0 | 0 | 2 |
| Not in sidebar — /forbidden | 1 | 0 | 0 | 0 | 1 | 14 | 0 |
| Not in sidebar — /intelligence | 1 | 1 | 0 | 0 | 0 | 0 | 77 |
| Not in sidebar — /login | 1 | 1 | 0 | 0 | 0 | 0 | 25 |
| Not in sidebar — /maintenance | 1 | 1 | 0 | 0 | 0 | 0 | 14 |
| Not in sidebar — /not-implemented | 1 | 1 | 0 | 0 | 0 | 0 | 8 |
| Not in sidebar — /notifications | 1 | 1 | 0 | 0 | 0 | 0 | 14 |
| Not in sidebar — /parent | 5 | 5 | 0 | 0 | 0 | 0 | 42 |
| Not in sidebar — /payroll | 3 | 3 | 0 | 0 | 0 | 0 | 48 |
| Not in sidebar — /portal | 5 | 5 | 0 | 0 | 0 | 0 | 45 |
| Not in sidebar — /print-snapshot | 1 | 1 | 0 | 0 | 0 | 0 | 12 |
| Not in sidebar — /print-transcript | 1 | 1 | 0 | 0 | 0 | 0 | 28 |
| Not in sidebar — /profile | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Not in sidebar — /reminders | 1 | 1 | 0 | 0 | 0 | 0 | 1 |
| Not in sidebar — /reports | 3 | 3 | 0 | 0 | 0 | 0 | 185 |
| Not in sidebar — /results | 1 | 1 | 0 | 0 | 0 | 0 | 21 |
| Not in sidebar — /root | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Not in sidebar — /rpt | 1 | 1 | 0 | 0 | 0 | 0 | 63 |
| Not in sidebar — /school-selection | 1 | 1 | 0 | 0 | 0 | 0 | 36 |
| Not in sidebar — /server-error | 1 | 0 | 0 | 1 | 0 | 5 | 4 |
| Not in sidebar — /settings | 4 | 2 | 1 | 0 | 0 | 2 | 56 |
| Not in sidebar — /setup | 1 | 1 | 0 | 0 | 0 | 0 | 26 |
| Not in sidebar — /signup | 1 | 1 | 0 | 0 | 0 | 0 | 44 |
| Not in sidebar — /students | 10 | 8 | 1 | 0 | 0 | 4 | 517 |
| Not in sidebar — /terms | 1 | 0 | 0 | 1 | 0 | 31 | 0 |
| Not in sidebar — /unauthorized | 1 | 1 | 0 | 0 | 0 | 0 | 8 |
| Not in sidebar — /verify | 1 | 1 | 0 | 0 | 0 | 0 | 12 |
| Not in sidebar — /workplans | 1 | 1 | 0 | 0 | 0 | 0 | 14 |
| **All routes** | **309** | **231** | **46** | **13** | **12** | | |

Shared components are counted once per route that renders them, so the "Hardcoded" column cannot be summed into a single application total.

## Students module — detailed inventory (first module to implement)

24 routes belong to the Students module (everything under `/students`, plus `/admissions`, which sits in the Students menu). 11 are sidebar items; the rest are reached from buttons and links inside those pages and must be translated with them.

**Proposed order** (sidebar order first, then the pages each one links to):

1. `/students/list` — Students › Student List
2. `/students/admit` — Students › Admit Student
3. `/admissions` — Students › Admissions Pipeline
4. `/students/enroll` — Students › Enroll Student
5. `/students/requirements` — Students › Requirements
6. `/students/contacts` — Students › Contacts
7. `/students/documents` — Students › Documents
8. `/students/duplicates` — Students › Duplicates
9. `/students/history` — Students › History
10. `/students/id-cards` — Students › ID Cards
11. `/students/offline` — Offline Workspace (Beta) › Students
12. `/admissions/[id]` — Students › Admissions Pipeline (child page — not itself in sidebar)
13. `/students` — not in sidebar
14. `/students/[id]` — not in sidebar
15. `/students/[id]/fees` — not in sidebar
16. `/students/enroll-bulk` — not in sidebar
17. `/students/id-cards/print` — Students › ID Cards (child page — not itself in sidebar)
18. `/students/id-cards/studio` — Students › ID Cards (child page — not itself in sidebar)
19. `/students/import` — not in sidebar
20. `/students/import-v2` — not in sidebar
21. `/students/migrate` — not in sidebar
22. `/students/promote` — not in sidebar
23. `/students/repair-names` — not in sidebar
24. `/students/trash` — not in sidebar

### `/students/list`

| Field | Value |
|---|---|
| Route | `/students/list` |
| Module | Students |
| Sidebar location | Students › Student List |
| Page file | `app/students/list/page.tsx` |
| Child components | `app/students/_client/ReassignClassModal.tsx`, `components/students/QuickEditDrawer.tsx`, `components/students/LearnerSnapshotModal.tsx`, `components/students/BulkSmsModal.tsx`, `components/students/LearnerOverview.tsx`, `components/students/BulkPhotoUploadModal.tsx`, `components/students/FolderPhotoUploadModal.tsx`, `components/students/ImportModal.tsx`, `components/modals/DeviceSelector.tsx`, `components/device/SyncDeviceModal.tsx`, `components/students/StudentsListLivePopup.tsx`, `components/i18n/I18nProvider.tsx` |
| Text inventory (static count) | 322 hardcoded: 212 text between tags, 38 attributes (placeholders, titles), 28 toasts/alerts, 44 labels in config objects |
| Existing translation | 101 calls through `useI18n().t` |
| Missing translation | Partial (under half) — about 24% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/_client/ReassignClassModal.tsx`, `components/students/LearnerSnapshotModal.tsx`, `components/students/LearnerOverview.tsx`, `components/modals/DeviceSelector.tsx`, `components/device/SyncDeviceModal.tsx` |
| RTL status | 77 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | 17 `toLocale*String` call(s); 0 use the active language |
| Dependencies (APIs) | `/api/classes`, `/api/streams`, `/api/programs`, `/api/study-modes`, `/api/academic_years`, `/api/terms`, `/api/students/fingerprint-status`, `/api/device/local-enroll`, `/api/device/local-enroll/status`, `/api/device/relay-enroll`, `/api/device/relay-enroll/status`, `/api/students/enroll-face` |
| Risk | High |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "Day" — text, `list/page.tsx`
- "Boarding" — text, `list/page.tsx`
- "Enrolled" — text, `list/page.tsx`
- "Admitted" — text, `list/page.tsx`
- "Fingerprint Capture Mode" — text, `list/page.tsx`
- "Cloud / ADMS" — text, `list/page.tsx`
- "Queues ENROLL_FP via device heartbeat" — text, `list/page.tsx`
- "Relay Bridge ☁→🖧" — text, `list/page.tsx`
- "CMD_STARTENROLL via relay agent on LAN" — text, `list/page.tsx`
- "Local / Direct ⚡" — text, `list/page.tsx`
- "Instant TCP — server on same LAN" — text, `list/page.tsx`
- "Device Serial Number" — text, `list/page.tsx`
- "Relay agent must be running on school LAN" — text, `list/page.tsx`
- "Device IP" — text, `list/page.tsx`

### `/students/admit`

| Field | Value |
|---|---|
| Route | `/students/admit` |
| Module | Students |
| Sidebar location | Students › Admit Student |
| Page file | `app/students/admit/page.tsx` |
| Child components | `components/admissions/VoiceNameCapture.tsx` |
| Text inventory (static count) | 41 hardcoded: 33 text between tags, 7 attributes (placeholders, titles), 0 toasts/alerts, 1 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/admit/page.tsx`, `components/admissions/VoiceNameCapture.tsx` |
| RTL status | 3 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | No date/number formatting calls found |
| Dependencies (APIs) | `/api/students` |
| Risk | Medium |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "Admit Student" — text, `admit/page.tsx`
- "Step 1 of 2 — Create student record" — text, `admit/page.tsx`
- "Enroll Student" — text, `admit/page.tsx`
- "1. Admit" — text, `admit/page.tsx`
- "2. Enroll" — text, `admit/page.tsx`
- "Student Admitted!" — text, `admit/page.tsx`
- "Now enroll this student into a class and term." — text, `admit/page.tsx`
- "Enroll Now" — text, `admit/page.tsx`
- "Admit Another" — text, `admit/page.tsx`
- "View Students" — text, `admit/page.tsx`
- "First Name *" — text, `admit/page.tsx`
- "Last Name" — text, `admit/page.tsx`
- "(optional)" — text, `admit/page.tsx`
- "Other Name" — text, `admit/page.tsx`

### `/admissions`

| Field | Value |
|---|---|
| Route | `/admissions` |
| Module | Students |
| Sidebar location | Students › Admissions Pipeline |
| Page file | `app/admissions/page.tsx` |
| Child components | None (all text is in the page file) |
| Text inventory (static count) | 48 hardcoded: 24 text between tags, 16 attributes (placeholders, titles), 1 toasts/alerts, 7 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/admissions/page.tsx` |
| RTL status | 5 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | 1 `toLocale*String` call(s); 0 use the active language |
| Dependencies (APIs) | `/api/admin/admission-mode`, `/api/admissions`, `/api/classes`, `/api/terms` |
| Risk | Medium |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "Admissions" — text, `admissions/page.tsx`
- "Structured admission pipeline. Mode:" — text, `admissions/page.tsx`
- "Mode" — text, `admissions/page.tsx`
- "New Application" — text, `admissions/page.tsx`
- "This school is in Flexible mode." — text, `admissions/page.tsx`
- "Mode settings" — text, `admissions/page.tsx`
- ") : isLoading ? (" — text, `admissions/page.tsx`
- "Create the first application →" — text, `admissions/page.tsx`
- "App #" — text, `admissions/page.tsx`
- "Applicant" — text, `admissions/page.tsx`
- "Desired Class" — text, `admissions/page.tsx`
- "Guardian" — text, `admissions/page.tsx`
- "Status" — text, `admissions/page.tsx`
- "Submitted" — text, `admissions/page.tsx`

### `/students/enroll`

| Field | Value |
|---|---|
| Route | `/students/enroll` |
| Module | Students |
| Sidebar location | Students › Enroll Student |
| Page file | `app/students/enroll/page.tsx` |
| Child components | None (all text is in the page file) |
| Text inventory (static count) | 136 hardcoded: 97 text between tags, 23 attributes (placeholders, titles), 12 toasts/alerts, 4 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/enroll/page.tsx` |
| RTL status | 13 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | No date/number formatting calls found |
| Dependencies (APIs) | `/api/students/full`, `/api/terms/current`, `/api/classes`, `/api/streams`, `/api/study-modes`, `/api/programs`, `/api/curriculums`, `/api/students/`, `/api/enrollments`, `/api/enrollments/bulk` |
| Risk | Medium |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "Change" — text, `enroll/page.tsx`
- "No students found." — text, `enroll/page.tsx`
- "Admit a new student?" — text, `enroll/page.tsx`
- "No previous enrollment — this will be the student's first placement." — text, `enroll/page.tsx`
- "Previous Enrollment" — text, `enroll/page.tsx`
- "Avg:" — text, `enroll/page.tsx`
- "Best:" — text, `enroll/page.tsx`
- "Passed:" — text, `enroll/page.tsx`
- "Enroll Student" — text, `enroll/page.tsx`
- "Informed academic placement with full context" — text, `enroll/page.tsx`
- "No current term is configured" — text, `enroll/page.tsx`
- "Select Student" — text, `enroll/page.tsx`
- "Search for an admitted student. Their previous academic record will load automatically." — text, `enroll/page.tsx`
- "Admit a new student →" — text, `enroll/page.tsx`

### `/students/requirements`

| Field | Value |
|---|---|
| Route | `/students/requirements` |
| Module | Students |
| Sidebar location | Students › Requirements |
| Page file | `app/students/requirements/page.tsx` |
| Child components | `contexts/AuthContext.tsx`, `components/students/AddRequirementModal.tsx`, `components/students/ClassRequirementsManager.tsx`, `components/ui/Pagination.tsx` |
| Text inventory (static count) | 112 hardcoded: 93 text between tags, 10 attributes (placeholders, titles), 7 toasts/alerts, 2 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/requirements/page.tsx`, `contexts/AuthContext.tsx`, `components/students/AddRequirementModal.tsx`, `components/students/ClassRequirementsManager.tsx`, `components/ui/Pagination.tsx` |
| RTL status | 14 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | No date/number formatting calls found |
| Dependencies (APIs) | `/api/students/requirements`, `/api/terms`, `/api/classes`, `/api/requirements/class`, `/api/db-mode`, `/api/auth/me`, `/api/auth/login`, `/api/school-config`, `/api/auth/signup`, `/api/auth/logout`, `/api/students/full`, `/api/requirements/master` |
| Risk | Medium |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "📋 Student Requirements" — text, `requirements/page.tsx`
- "Manage Class Requirements" — text, `requirements/page.tsx`
- "Add Individual Requirement" — text, `requirements/page.tsx`
- "All Classes" — text, `requirements/page.tsx`
- "All Terms" — text, `requirements/page.tsx`
- "All Status" — text, `requirements/page.tsx`
- "Brought" — text, `requirements/page.tsx`
- "Not Brought" — text, `requirements/page.tsx`
- "Clear Filters" — text, `requirements/page.tsx`
- "Class Requirements Overview" — text, `requirements/page.tsx`
- "Manage" — text, `requirements/page.tsx`
- "Individual Student Requirements" — text, `requirements/page.tsx`
- "Loading requirements..." — text, `requirements/page.tsx`
- "Student" — text, `requirements/page.tsx`

### `/students/contacts`

| Field | Value |
|---|---|
| Route | `/students/contacts` |
| Module | Students |
| Sidebar location | Students › Contacts |
| Page file | `app/students/contacts/page.tsx` |
| Child components | `contexts/AuthContext.tsx`, `components/students/AddContactModal.tsx`, `components/students/ImportContactsModal.tsx`, `components/students/ContactsListModal.tsx`, `components/ui/Pagination.tsx`, `components/students/EditContactModal.tsx`, `components/students/SMSComposerModal.tsx` |
| Text inventory (static count) | 157 hardcoded: 109 text between tags, 26 attributes (placeholders, titles), 18 toasts/alerts, 4 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/contacts/page.tsx`, `contexts/AuthContext.tsx`, `components/students/AddContactModal.tsx`, `components/students/ImportContactsModal.tsx`, `components/students/ContactsListModal.tsx`, `components/ui/Pagination.tsx`, `components/students/EditContactModal.tsx`, `components/students/SMSComposerModal.tsx` |
| RTL status | 13 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | No date/number formatting calls found |
| Dependencies (APIs) | `/api/students/contacts`, `/api/db-mode`, `/api/auth/me`, `/api/auth/login`, `/api/school-config`, `/api/auth/signup`, `/api/auth/logout`, `/api/students/full`, `/api/students/contacts/`, `/api/sms/send`, `/api/sms/quota` |
| Risk | High |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "📞 Student Contacts" — text, `contacts/page.tsx`
- "Import Excel" — text, `contacts/page.tsx`
- "Add Contact" — text, `contacts/page.tsx`
- "Loading contacts..." — text, `contacts/page.tsx`
- "Primary" — text, `contacts/page.tsx`
- "Occupation:" — text, `contacts/page.tsx`
- "Call" — text, `contacts/page.tsx`
- "SMS" — text, `contacts/page.tsx`
- "Manage" — text, `contacts/page.tsx`
- "No contacts found" — text, `contacts/page.tsx`
- "Search students, contacts, or relationships..." — attr, `contacts/page.tsx`
- "Send SMS" — attr, `contacts/page.tsx`
- "Edit" — attr, `contacts/page.tsx`
- "Promise" — text, `contexts/AuthContext.tsx`

### `/students/documents`

| Field | Value |
|---|---|
| Route | `/students/documents` |
| Module | Students |
| Sidebar location | Students › Documents |
| Page file | `app/students/documents/page.tsx` |
| Child components | `contexts/AuthContext.tsx`, `components/students/AddDocumentModal.tsx` |
| Text inventory (static count) | 42 hardcoded: 34 text between tags, 4 attributes (placeholders, titles), 2 toasts/alerts, 2 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/documents/page.tsx`, `contexts/AuthContext.tsx`, `components/students/AddDocumentModal.tsx` |
| RTL status | 3 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | 1 `toLocale*String` call(s); 0 use the active language |
| Dependencies (APIs) | `/api/students/documents`, `/api/document-types`, `/api/db-mode`, `/api/auth/me`, `/api/auth/login`, `/api/school-config`, `/api/auth/signup`, `/api/auth/logout`, `/api/students/full` |
| Risk | Medium |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "📄 Student Documents" — text, `documents/page.tsx`
- "Upload Document" — text, `documents/page.tsx`
- "All Document Types" — text, `documents/page.tsx`
- "Clear Filters" — text, `documents/page.tsx`
- "Loading documents..." — text, `documents/page.tsx`
- "Size:" — text, `documents/page.tsx`
- "Issued:" — text, `documents/page.tsx`
- "View" — text, `documents/page.tsx`
- "Download" — text, `documents/page.tsx`
- "No documents found" — text, `documents/page.tsx`
- "Search students or documents..." — attr, `documents/page.tsx`
- "Promise" — text, `contexts/AuthContext.tsx`
- "Network error occurred. Please try again." — label, `contexts/AuthContext.tsx`
- "Upload Student Document" — text, `students/AddDocumentModal.tsx`

### `/students/duplicates`

| Field | Value |
|---|---|
| Route | `/students/duplicates` |
| Module | Students |
| Sidebar location | Students › Duplicates |
| Page file | `app/students/duplicates/page.tsx` |
| Child components | None (all text is in the page file) |
| Text inventory (static count) | 42 hardcoded: 25 text between tags, 8 attributes (placeholders, titles), 1 toasts/alerts, 8 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/duplicates/page.tsx` |
| RTL status | 13 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | 2 `toLocale*String` call(s); 0 use the active language |
| Dependencies (APIs) | `/api/students/duplicates`, `/api/students/duplicates/merge`, `/api/students/duplicates/purge` |
| Risk | Medium |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "You are about to merge" — text, `duplicates/page.tsx`
- "duplicate students across" — text, `duplicates/page.tsx`
- "For each group, the record with the most data will be kept. All enrollment, attendance, re" — text, `duplicates/page.tsx`
- "This action cannot be undone." — text, `duplicates/page.tsx`
- "Ghost records" — text, `duplicates/page.tsx`
- "Zero data — will be" — text, `duplicates/page.tsx`
- "permanently deleted" — text, `duplicates/page.tsx`
- "Data records" — text, `duplicates/page.tsx`
- "Have data — will be" — text, `duplicates/page.tsx`
- "into primary" — text, `duplicates/page.tsx`
- "Ghost deletions are irreversible. Merges can be traced via audit log." — text, `duplicates/page.tsx`
- "Duplicate Detection" — text, `duplicates/page.tsx`
- "Find and merge duplicate student records" — text, `duplicates/page.tsx`
- "Refresh" — text, `duplicates/page.tsx`

### `/students/history`

| Field | Value |
|---|---|
| Route | `/students/history` |
| Module | Students |
| Sidebar location | Students › History |
| Page file | `app/students/history/page.tsx` |
| Child components | `contexts/AuthContext.tsx`, `components/ui/Pagination.tsx` |
| Text inventory (static count) | 38 hardcoded: 33 text between tags, 3 attributes (placeholders, titles), 0 toasts/alerts, 2 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/history/page.tsx`, `contexts/AuthContext.tsx`, `components/ui/Pagination.tsx` |
| RTL status | 13 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | 1 `toLocale*String` call(s); 0 use the active language |
| Dependencies (APIs) | `/api/students/history`, `/api/students/full`, `/api/db-mode`, `/api/auth/me`, `/api/auth/login`, `/api/school-config`, `/api/auth/signup`, `/api/auth/logout` |
| Risk | Low |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "previous) return" — text, `history/page.tsx`
- "📚 Academic History" — text, `history/page.tsx`
- "Grid" — text, `history/page.tsx`
- "List" — text, `history/page.tsx`
- "All Students" — text, `history/page.tsx`
- "Clear Filters" — text, `history/page.tsx`
- "Loading academic history..." — text, `history/page.tsx`
- "Results" — text, `history/page.tsx`
- "Average" — text, `history/page.tsx`
- "Recent Results:" — text, `history/page.tsx`
- "View Full History" — text, `history/page.tsx`
- "Student" — text, `history/page.tsx`
- "Subject" — text, `history/page.tsx`
- "Term" — text, `history/page.tsx`

### `/students/id-cards`

| Field | Value |
|---|---|
| Route | `/students/id-cards` |
| Module | Students |
| Sidebar location | Students › ID Cards |
| Page file | `app/students/id-cards/page.tsx` |
| Child components | `components/students/IDCardPreview.tsx` |
| Text inventory (static count) | 53 hardcoded: 19 text between tags, 19 attributes (placeholders, titles), 2 toasts/alerts, 13 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/id-cards/page.tsx`, `components/students/IDCardPreview.tsx` |
| RTL status | 8 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | No date/number formatting calls found |
| Dependencies (APIs) | `/api/id-card-templates`, `/api/students/enrolled`, `/api/id-card-templates/convert-to-drce` |
| Risk | Medium |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "ID Card Designer" — text, `id-cards/page.tsx`
- "Design · Preview · Print" — text, `id-cards/page.tsx`
- ": saved ?" — text, `id-cards/page.tsx`
- "Presets" — text, `id-cards/page.tsx`
- "Corner Radius" — text, `id-cards/page.tsx`
- "Base Font Size" — text, `id-cards/page.tsx`
- "Font Weight" — text, `id-cards/page.tsx`
- "Footer Text" — text, `id-cards/page.tsx`
- "School Logo Override" — text, `id-cards/page.tsx`
- "Leave blank to use the logo from School Config." — text, `id-cards/page.tsx`
- "Live Preview" — text, `id-cards/page.tsx`
- "Actual print size: 85.6 × 54 mm (credit card)" — text, `id-cards/page.tsx`
- "Learners" — text, `id-cards/page.tsx`
- "No learners found" — text, `id-cards/page.tsx`

### `/students/offline`

| Field | Value |
|---|---|
| Route | `/students/offline` |
| Module | Students |
| Sidebar location | Offline Workspace (Beta) › Students |
| Page file | `app/students/offline/page.tsx` |
| Child components | None (all text is in the page file) |
| Text inventory (static count) | 42 hardcoded: 20 text between tags, 14 attributes (placeholders, titles), 2 toasts/alerts, 6 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/offline/page.tsx` |
| RTL status | 10 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | No date/number formatting calls found |
| Dependencies (APIs) | `/api/students/offline`, `/api/academics/offline`, `/api/students/offline/` |
| Risk | Medium |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "(url: string, init?: RequestInit): Promise" — text, `offline/page.tsx`
- "Students (Offline)" — text, `offline/page.tsx`
- "Local SQLite" — text, `offline/page.tsx`
- "Add Student" — text, `offline/page.tsx`
- "Show deleted" — text, `offline/page.tsx`
- "Name" — text, `offline/page.tsx`
- "Admission No" — text, `offline/page.tsx`
- "Class" — text, `offline/page.tsx`
- "Status" — text, `offline/page.tsx`
- "Phone" — text, `offline/page.tsx`
- "Actions" — text, `offline/page.tsx`
- "No students yet. Add the first one." — text, `offline/page.tsx`
- "Unassigned" — text, `offline/page.tsx`
- "Restore" — text, `offline/page.tsx`

### `/admissions/[id]`

| Field | Value |
|---|---|
| Route | `/admissions/[id]` (dynamic segment) |
| Module | Students |
| Sidebar location | Students › Admissions Pipeline (child page — not itself in sidebar) |
| Page file | `app/admissions/[id]/page.tsx` |
| Child components | None (all text is in the page file) |
| Text inventory (static count) | 34 hardcoded: 14 text between tags, 19 attributes (placeholders, titles), 1 toasts/alerts, 0 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/admissions/[id]/page.tsx` |
| RTL status | 1 fixed-side class, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | 2 `toLocale*String` call(s); 0 use the active language |
| Dependencies (APIs) | `/api/admissions/` |
| Risk | Low |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "Invalid application id." — text, `[id]/page.tsx`
- "Application not found." — text, `[id]/page.tsx`
- "Back to applications" — text, `[id]/page.tsx`
- "Move to Review" — text, `[id]/page.tsx`
- "Approve" — text, `[id]/page.tsx`
- "Reject" — text, `[id]/page.tsx`
- "Archive" — text, `[id]/page.tsx`
- "Reopen" — text, `[id]/page.tsx`
- "View student record" — text, `[id]/page.tsx`
- "Rejection reason" — text, `[id]/page.tsx`
- "No documents uploaded." — text, `[id]/page.tsx`
- "View" — text, `[id]/page.tsx`
- "No history yet." — text, `[id]/page.tsx`
- "Applicant" — attr, `[id]/page.tsx`

### `/students`

| Field | Value |
|---|---|
| Route | `/students` |
| Module | Students |
| Sidebar location | Not in sidebar |
| Page file | `app/students/page.tsx` |
| Child components | None (all text is in the page file) |
| Text inventory (static count) | 0 hardcoded: 0 text between tags, 0 attributes (placeholders, titles), 0 toasts/alerts, 0 labels in config objects |
| Existing translation | None |
| Missing translation | No own text (redirect/shell) |
| RTL status | No fixed-side classes found. Not yet checked in a browser. |
| Dates and numbers | No date/number formatting calls found |
| Dependencies (APIs) | None found |
| Risk | Low |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

### `/students/[id]`

| Field | Value |
|---|---|
| Route | `/students/[id]` (dynamic segment) |
| Module | Students |
| Sidebar location | Not in sidebar |
| Page file | `app/students/[id]/page.tsx` |
| Child components | `components/students/EnrollmentTimeline.tsx`, `components/students/LearnerOverview.tsx`, `components/students/PhotoEditorModal.tsx`, `components/students/ExtendedProfileModal.tsx`, `components/students/CustomFieldsPanel.tsx`, `components/i18n/I18nProvider.tsx` |
| Text inventory (static count) | 117 hardcoded: 43 text between tags, 61 attributes (placeholders, titles), 3 toasts/alerts, 10 labels in config objects |
| Existing translation | 4 calls through `useI18n().t` |
| Missing translation | Partial (under half) — about 3% of visible strings go through the translator. Files with visible text and no translation hook: `components/students/EnrollmentTimeline.tsx`, `components/students/LearnerOverview.tsx`, `components/students/CustomFieldsPanel.tsx` |
| RTL status | 5 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | 5 `toLocale*String` call(s); 0 use the active language |
| Dependencies (APIs) | `/api/students/`, `/api/enrollments`, `/api/students/photo`, `/api/lookups/student-profile`, `/api/school-config` |
| Risk | Medium |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "Invalid student ID in URL." — text, `[id]/page.tsx`
- "Back to students" — text, `[id]/page.tsx`
- "Loading student profile…" — text, `[id]/page.tsx`
- "Student not found or access restricted" — text, `[id]/page.tsx`
- "The student may not belong to your school, or the record was removed." — text, `[id]/page.tsx`
- "List" — text, `[id]/page.tsx`
- "Edit Extended Profile" — text, `[id]/page.tsx`
- "Primary" — text, `[id]/page.tsx`
- "Manage contacts" — text, `[id]/page.tsx`
- "View" — text, `[id]/page.tsx`
- "No documents uploaded." — text, `[id]/page.tsx`
- "Upload / manage documents" — text, `[id]/page.tsx`
- "Programs" — text, `[id]/page.tsx`
- "Re-enroll / promote →" — text, `[id]/page.tsx`

### `/students/[id]/fees`

| Field | Value |
|---|---|
| Route | `/students/[id]/fees` (dynamic segment) |
| Module | Students |
| Sidebar location | Not in sidebar |
| Page file | `app/students/[id]/fees/page.tsx` |
| Child components | `contexts/AuthContext.tsx` |
| Text inventory (static count) | 60 hardcoded: 48 text between tags, 6 attributes (placeholders, titles), 4 toasts/alerts, 2 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/[id]/fees/page.tsx`, `contexts/AuthContext.tsx` |
| RTL status | 8 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | 2 `toLocale*String` call(s); 0 use the active language |
| Dependencies (APIs) | `/api/finance/student-ledger`, `/api/finance/balance/`, `/api/finance/accounts`, `/api/students/`, `/api/finance/record-payment`, `/api/finance/adjust`, `/api/finance/payments/`, `/api/db-mode`, `/api/auth/me`, `/api/auth/login`, `/api/school-config`, `/api/auth/signup` |
| Risk | Medium |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "Loading fee data…" — text, `fees/page.tsx`
- "Record Payment" — text, `fees/page.tsx`
- "Adjust Balance" — text, `fees/page.tsx`
- "Profile" — text, `fees/page.tsx`
- "Payment recorded · receipt" — text, `fees/page.tsx`
- "View / print" — text, `fees/page.tsx`
- "Download PDF" — text, `fees/page.tsx`
- "Dismiss" — text, `fees/page.tsx`
- "Method" — text, `fees/page.tsx`
- "Account" — text, `fees/page.tsx`
- "— select account —" — text, `fees/page.tsx`
- "Reference / Receipt No." — text, `fees/page.tsx`
- "Paid By (parent/guardian)" — text, `fees/page.tsx`
- "Cancel" — text, `fees/page.tsx`

### `/students/enroll-bulk`

| Field | Value |
|---|---|
| Route | `/students/enroll-bulk` |
| Module | Students |
| Sidebar location | Not in sidebar |
| Page file | `app/students/enroll-bulk/page.tsx` |
| Child components | None (all text is in the page file) |
| Text inventory (static count) | 87 hardcoded: 66 text between tags, 4 attributes (placeholders, titles), 13 toasts/alerts, 4 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/enroll-bulk/page.tsx` |
| RTL status | 6 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | No date/number formatting calls found |
| Dependencies (APIs) | `/api/terms/current`, `/api/classes`, `/api/streams`, `/api/study-modes`, `/api/programs`, `/api/curriculums`, `/api/students/`, `/api/enrollments/bulk` |
| Risk | High |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "Bulk Enrollment" — text, `enroll-bulk/page.tsx`
- "Loading student details..." — text, `enroll-bulk/page.tsx`
- "No students loaded" — text, `enroll-bulk/page.tsx`
- "Return to student list" — text, `enroll-bulk/page.tsx`
- "Review Selected Students" — text, `enroll-bulk/page.tsx`
- "Continue" — text, `enroll-bulk/page.tsx`
- "Enrollment Decision" — text, `enroll-bulk/page.tsx`
- "Academic Decision" — text, `enroll-bulk/page.tsx`
- "Please select a decision to continue." — text, `enroll-bulk/page.tsx`
- "Current term auto-selected:" — text, `enroll-bulk/page.tsx`
- "Academic Year" — text, `enroll-bulk/page.tsx`
- "Select year…" — text, `enroll-bulk/page.tsx`
- "Term" — text, `enroll-bulk/page.tsx`
- "Select term…" — text, `enroll-bulk/page.tsx`

### `/students/id-cards/print`

| Field | Value |
|---|---|
| Route | `/students/id-cards/print` |
| Module | Students |
| Sidebar location | Students › ID Cards (child page — not itself in sidebar) |
| Page file | `app/students/id-cards/print/page.tsx` |
| Child components | `components/students/IDCardPreview.tsx` |
| Text inventory (static count) | 10 hardcoded: 6 text between tags, 4 attributes (placeholders, titles), 0 toasts/alerts, 0 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/id-cards/print/page.tsx`, `components/students/IDCardPreview.tsx` |
| RTL status | 2 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | No date/number formatting calls found |
| Dependencies (APIs) | None found |
| Risk | Low |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "Print ID Cards" — text, `print/page.tsx`
- "Print" — text, `print/page.tsx`
- "No learners selected. Close this window and select learners first." — text, `print/page.tsx`
- "Authorised Signature" — text, `students/IDCardPreview.tsx`
- "NAME" — attr, `students/IDCardPreview.tsx`
- "REG NO" — attr, `students/IDCardPreview.tsx`
- "CLASS" — attr, `students/IDCardPreview.tsx`
- "GENDER" — attr, `students/IDCardPreview.tsx`

### `/students/id-cards/studio`

| Field | Value |
|---|---|
| Route | `/students/id-cards/studio` |
| Module | Students |
| Sidebar location | Students › ID Cards (child page — not itself in sidebar) |
| Page file | `app/students/id-cards/studio/page.tsx` |
| Child components | `components/idcards/IdCardDesigner.tsx`, `components/idcards/IdCardGenerate.tsx`, `components/idcards/IdCardFace.tsx`, `components/idcards/IdCardSheets.tsx` |
| Text inventory (static count) | 93 hardcoded: 71 text between tags, 9 attributes (placeholders, titles), 6 toasts/alerts, 7 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/id-cards/studio/page.tsx`, `components/idcards/IdCardDesigner.tsx`, `components/idcards/IdCardGenerate.tsx`, `components/idcards/IdCardFace.tsx` |
| RTL status | 8 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | 1 `toLocale*String` call(s); 0 use the active language |
| Dependencies (APIs) | `/api/id-cards/watermark-status`, `/api/id-cards/designs`, `/api/id-cards/designs/`, `/api/id-card-templates`, `/api/id-cards/assets`, `/api/students/enrolled` |
| Risk | Medium |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "ID Card Studio" — text, `studio/page.tsx`
- "Classic single-sided designer" — text, `studio/page.tsx`
- "1. Design" — text, `studio/page.tsx`
- "2. Generate & print" — text, `studio/page.tsx`
- "Save & make active" — text, `studio/page.tsx`
- "Save as copy" — text, `studio/page.tsx`
- "Unsaved changes" — text, `studio/page.tsx`
- "Open saved design…" — text, `studio/page.tsx`
- "New two-sided" — text, `studio/page.tsx`
- "New single-sided" — text, `studio/page.tsx`
- "Start from classic design" — text, `studio/page.tsx`
- "Start from a template…" — text, `studio/page.tsx`
- "Design name" — attr, `studio/page.tsx`
- "Ready-made designs with your school's name, logo and details filled in automatically" — attr, `studio/page.tsx`

### `/students/import`

| Field | Value |
|---|---|
| Route | `/students/import` |
| Module | Students |
| Sidebar location | Not in sidebar |
| Page file | `app/students/import/page.tsx` |
| Child components | None (all text is in the page file) |
| Text inventory (static count) | 113 hardcoded: 64 text between tags, 0 attributes (placeholders, titles), 7 toasts/alerts, 42 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/import/page.tsx` |
| RTL status | 8 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | 16 `toLocale*String` call(s); 0 use the active language |
| Dependencies (APIs) | `/api/students/import` |
| Risk | High |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "Smart Import Engine" — text, `import/page.tsx`
- "CSV / Excel · Match engine · No duplicates · Reversible · Cancellable" — text, `import/page.tsx`
- "Download Template" — text, `import/page.tsx`
- "Try the new import experience (beta)" — text, `import/page.tsx`
- "— multi-sheet workbooks, no reformatting needed, DRAIS explains what it found before writi" — text, `import/page.tsx`
- "Drop file here or click to browse" — text, `import/page.tsx`
- ".csv or .xlsx — up to 10,000 rows" — text, `import/page.tsx`
- "Analyzing..." — text, `import/page.tsx`
- "Analyze File" — text, `import/page.tsx`
- "Template" — text, `import/page.tsx`
- "CSV Column Headers" — text, `import/page.tsx`
- "Download .csv" — text, `import/page.tsx`
- "Example expected structure" — text, `import/page.tsx`
- "Name unmapped" — text, `import/page.tsx`

### `/students/import-v2`

| Field | Value |
|---|---|
| Route | `/students/import-v2` |
| Module | Students |
| Sidebar location | Not in sidebar |
| Page file | `app/students/import-v2/page.tsx` |
| Child components | None (all text is in the page file) |
| Text inventory (static count) | 32 hardcoded: 13 text between tags, 13 attributes (placeholders, titles), 3 toasts/alerts, 3 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/import-v2/page.tsx` |
| RTL status | 2 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | No date/number formatting calls found |
| Dependencies (APIs) | `/api/students/import/v2/analyze`, `/api/students/import/v2`, `/api/students/import/v2/settings` |
| Risk | High |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "Import Students — new experience" — text, `import-v2/page.tsx`
- "Start over" — text, `import-v2/page.tsx`
- "Drop your workbook here, or click to browse" — text, `import-v2/page.tsx`
- ".xlsx — one sheet, one sheet per class, or however your school already keeps it" — text, `import-v2/page.tsx`
- "Reading every sheet, detecting headers, guessing what each one means" — text, `import-v2/page.tsx`
- "Importing…" — text, `import-v2/page.tsx`
- "Import settings for this school" — text, `import-v2/page.tsx`
- "looks non-data" — text, `import-v2/page.tsx`
- "· sheet name suggests" — text, `import-v2/page.tsx`
- "Detected columns:" — text, `import-v2/page.tsx`
- "Import plan — nothing has been written yet" — text, `import-v2/page.tsx`
- "Back" — text, `import-v2/page.tsx`
- "Import another file" — text, `import-v2/page.tsx`
- "Update existing students when matched" — attr, `import-v2/page.tsx`

### `/students/migrate`

| Field | Value |
|---|---|
| Route | `/students/migrate` |
| Module | Students |
| Sidebar location | Not in sidebar |
| Page file | `app/students/migrate/page.tsx` |
| Child components | None (all text is in the page file) |
| Text inventory (static count) | 32 hardcoded: 17 text between tags, 0 attributes (placeholders, titles), 2 toasts/alerts, 13 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/migrate/page.tsx` |
| RTL status | 1 fixed-side class, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | No date/number formatting calls found |
| Dependencies (APIs) | `/api/students/migrate` |
| Risk | High |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "Migration Engine" — text, `migrate/page.tsx`
- "→ Onboard entire schools in minutes" — text, `migrate/page.tsx`
- "← Back to Students" — text, `migrate/page.tsx`
- "Learner Data (JSON)" — text, `migrate/page.tsx`
- "Template" — text, `migrate/page.tsx`
- "Drag a .json file here or paste above" — text, `migrate/page.tsx`
- "Accepted fields" — text, `migrate/page.tsx`
- "Options" — text, `migrate/page.tsx`
- "Cancel" — text, `migrate/page.tsx`
- "New Migration" — text, `migrate/page.tsx`
- "Importing…" — text, `migrate/page.tsx`
- "Complete" — text, `migrate/page.tsx`
- "Migration failed" — text, `migrate/page.tsx`
- "View imported students" — text, `migrate/page.tsx`

### `/students/promote`

| Field | Value |
|---|---|
| Route | `/students/promote` |
| Module | Students |
| Sidebar location | Not in sidebar |
| Page file | `app/students/promote/page.tsx` |
| Child components | None (all text is in the page file) |
| Text inventory (static count) | 26 hardcoded: 20 text between tags, 0 attributes (placeholders, titles), 2 toasts/alerts, 4 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/promote/page.tsx` |
| RTL status | 7 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | 1 `toLocale*String` call(s); 0 use the active language |
| Dependencies (APIs) | `/api/students/promotion-manifest`, `/api/classes`, `/api/students/bulk/enroll-sse` |
| Risk | High |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "Manifest not found" — text, `promote/page.tsx`
- "Run" — text, `promote/page.tsx`
- "first to generate it." — text, `promote/page.tsx`
- "Back to Students" — text, `promote/page.tsx`
- "Mission Control" — text, `promote/page.tsx`
- "2025 → 2026 Student Promotion Engine" — text, `promote/page.tsx`
- "Manifest generated" — text, `promote/page.tsx`
- "Bulk Enrollment Stream" — text, `promote/page.tsx`
- "Start Mission" — text, `promote/page.tsx`
- "Stop" — text, `promote/page.tsx`
- "Reset" — text, `promote/page.tsx`
- "Enrolled" — text, `promote/page.tsx`
- "Already existed" — text, `promote/page.tsx`
- "Failed" — text, `promote/page.tsx`

### `/students/repair-names`

| Field | Value |
|---|---|
| Route | `/students/repair-names` |
| Module | Students |
| Sidebar location | Not in sidebar |
| Page file | `app/students/repair-names/page.tsx` |
| Child components | None (all text is in the page file) |
| Text inventory (static count) | 38 hardcoded: 31 text between tags, 4 attributes (placeholders, titles), 3 toasts/alerts, 0 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/repair-names/page.tsx` |
| RTL status | 15 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | 1 `toLocale*String` call(s); 0 use the active language |
| Dependencies (APIs) | `/api/students/repair-names` |
| Risk | High |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "Repair learner names" — text, `repair-names/page.tsx`
- "Upload a corrections spreadsheet, review the diff, then apply or roll back. Every change i" — text, `repair-names/page.tsx`
- "Upload corrections file" — text, `repair-names/page.tsx`
- "Required columns:" — text, `repair-names/page.tsx`
- "Admission Number" — text, `repair-names/page.tsx`
- "+ at least one of" — text, `repair-names/page.tsx`
- "First Name" — text, `repair-names/page.tsx`
- "Last Name" — text, `repair-names/page.tsx`
- "Other Name" — text, `repair-names/page.tsx`
- "(clear)" — text, `repair-names/page.tsx`
- "to set it to NULL." — text, `repair-names/page.tsx`
- "Choose file" — text, `repair-names/page.tsx`
- "Review the diff" — text, `repair-names/page.tsx`
- "Every matched row already equals the database. Nothing to apply." — text, `repair-names/page.tsx`

### `/students/trash`

| Field | Value |
|---|---|
| Route | `/students/trash` |
| Module | Students |
| Sidebar location | Not in sidebar |
| Page file | `app/students/trash/page.tsx` |
| Child components | None (all text is in the page file) |
| Text inventory (static count) | 12 hardcoded: 10 text between tags, 2 attributes (placeholders, titles), 0 toasts/alerts, 0 labels in config objects |
| Existing translation | None |
| Missing translation | Not translated — about 0% of visible strings go through the translator. Files with visible text and no translation hook: `app/students/trash/page.tsx` |
| RTL status | 9 fixed-side classes, none RTL-aware. Not yet checked in a browser. |
| Dates and numbers | 1 `toLocale*String` call(s); 0 use the active language |
| Dependencies (APIs) | `/api/students/list`, `/api/students/restore`, `/api/students/delete-permanent` |
| Risk | Low |
| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |
| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |

Representative hardcoded strings (a sample, not the full list):

- "Student Trash" — text, `trash/page.tsx`
- "Restore" — text, `trash/page.tsx`
- "Learner" — text, `trash/page.tsx`
- "Admission No" — text, `trash/page.tsx`
- "Deleted" — text, `trash/page.tsx`
- "Reason" — text, `trash/page.tsx`
- "Actions" — text, `trash/page.tsx`
- "Forever" — text, `trash/page.tsx`
- "Delete Forever is permanent and cascades to fees, enrollment, results, and attendance." — text, `trash/page.tsx`
- "Refresh" — attr, `trash/page.tsx`
- "Search name / admission no…" — attr, `trash/page.tsx`

## All other sections

Compact form. Each route gets the same detailed block as the Students routes above when its module's phase begins — a full string-by-string inventory is the first step of each route, not something to guess at in advance.

### Overview

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/dashboard` | Overview | Partial (under half) | 15 | 27 | 7 | No fixed-side classes found | Medium | No |
| `/dashboard/analytics` | Overview (child page — not itself in sidebar) | Not translated | 0 | 7 | 1 | No fixed-side classes found | Low | No |

### Attendance

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/attendance` | Dashboard | Partial (over half) | 49 | 33 | 3 | 10 fixed-side classes, none RTL-aware | Low | No |
| `/attendance/biometric/unassigned` | Dashboard (child page — not itself in sidebar) | Not translated | 0 | 21 | 0 | 8 fixed-side classes, none RTL-aware | Low | No |
| `/attendance/founder-independence` | Founder Independence | Not translated | 0 | 8 | 0 | 2 fixed-side classes, none RTL-aware | Low | No |
| `/attendance/health` | Health Center | Partial (over half) | 23 | 5 | 1 | No fixed-side classes found | Low | No |
| `/attendance/holidays` | Holidays | Not translated | 0 | 18 | 0 | No fixed-side classes found | Low | No |
| `/attendance/lessons` | Lesson Attendance | Not translated | 0 | 26 | 0 | No fixed-side classes found | Low | No |
| `/attendance/logs` | Attendance Logs | Not translated | 0 | 173 | 2 | 33 fixed-side classes, none RTL-aware | High | No |
| `/attendance/profiles` | Attendance Profiles | Not translated | 0 | 11 | 0 | 1 fixed-side class, none RTL-aware | Low | No |
| `/attendance/recovery` | Recovery Center | Mostly wired | 31 | 0 | 1 | 2 fixed-side classes, none RTL-aware | High | No |
| `/attendance/settings` | Settings | Not translated | 0 | 218 | 7 | 14 fixed-side classes, none RTL-aware | High | No |
| `/attendance/shifts` | Shifts | Not translated | 0 | 44 | 0 | 2 fixed-side classes, none RTL-aware | Medium | No |
| `/attendance/time-health` | Time Health | Mostly wired | 119 | 6 | 1 | 6 fixed-side classes, none RTL-aware | High | No |
| `/attendance/trace` | Event Explorer | Not translated | 0 | 6 | 0 | 7 fixed-side classes, none RTL-aware | Low | No |
| `/attendance/trends` | Trends | Mostly wired | 14 | 0 | 1 | No fixed-side classes found | Low | No |

### Gate & Movement

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/passouts` | Pass-outs | Not translated | 0 | 57 | 0 | 19 fixed-side classes, none RTL-aware | Medium | No |
| `/passouts/gate` | Gate Mode | Not translated | 0 | 17 | 0 | 1 fixed-side class, none RTL-aware | Low | No |
| `/passouts/reports` | Pass-out Reports | Not translated | 0 | 11 | 0 | 1 fixed-side class, none RTL-aware | Low | No |
| `/visitation` | Visitation Cards | Not translated | 0 | 24 | 0 | 7 fixed-side classes, none RTL-aware | Low | No |

### Devices & Biometrics

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/admin/device-alerts` | Device Alerts | Not translated | 0 | 10 | 0 | 2 fixed-side classes, none RTL-aware | Low | No |
| `/attendance/device-control` | Device Control | Not translated | 0 | 92 | 0 | 11 fixed-side classes, none RTL-aware | High | No |
| `/attendance/device-intelligence` | Device Intelligence | Mostly wired | 13 | 0 | 1 | 1 fixed-side class, none RTL-aware | High | No |
| `/attendance/device-logs` | Device Logs | Not translated | 0 | 75 | 0 | 17 fixed-side classes, none RTL-aware | High | No |
| `/attendance/devices` | Devices | Not translated | 0 | 190 | 3 | 15 fixed-side classes, none RTL-aware | High | No |
| `/attendance/devices/commands` | Command Monitor | Not translated | 0 | 28 | 0 | 9 fixed-side classes, none RTL-aware | High | No |
| `/attendance/enrollment` | Enrollment Station | Not translated | 0 | 35 | 1 | 4 fixed-side classes, none RTL-aware | Low | No |
| `/attendance/identity-intelligence` | Identity Intelligence | Mostly wired | 25 | 0 | 1 | 1 fixed-side class, none RTL-aware | Low | No |
| `/attendance/identity-matching` | Identity Matching | Not translated | 0 | 21 | 0 | 1 fixed-side class, none RTL-aware | Low | No |
| `/attendance/remote-features` | Remote Features | Not translated | 0 | 26 | 0 | 9 fixed-side classes, none RTL-aware | Low | No |

### Communication

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/admin/communications` | Communications | Partial (under half) | 6 | 127 | 1 | 7 fixed-side classes, none RTL-aware | Medium | No |
| `/admin/notifications/outbox` | SMS Outbox | Not translated | 0 | 79 | 2 | 13 fixed-side classes, none RTL-aware | Medium | No |
| `/admin/notifications/policies` | Notification Policies | Not translated | 0 | 36 | 0 | 1 fixed-side class, none RTL-aware | Low | No |
| `/admin/sms/buy` | Buy SMS | Not translated | 0 | 25 | 0 | 6 fixed-side classes, none RTL-aware | Low | No |

### Staff & Roles

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/admin/admission-mode` | Admission Mode | Not translated | 0 | 9 | 0 | No fixed-side classes found | Low | No |
| `/admin/audit-logs` | Audit Trail | Partial (under half) | 1 | 25 | 1 | 4 fixed-side classes, none RTL-aware | Low | No |
| `/admin/departments` | Departments | Partial (under half) | 1 | 6 | 1 | No fixed-side classes found | Low | No |
| `/admin/modules` | School Modules | Partial (under half) | 1 | 7 | 1 | 2 fixed-side classes, none RTL-aware | Low | No |
| `/admin/parents` | Parents & Guardians | Not translated | 0 | 13 | 0 | No fixed-side classes found | Low | No |
| `/admin/positions` | Positions | Partial (under half) | 1 | 27 | 1 | 4 fixed-side classes, none RTL-aware | Low | No |
| `/admin/roles` | Roles & Permissions | Partial (under half) | 2 | 16 | 1 | 4 fixed-side classes, none RTL-aware | Low | No |
| `/admin/trash` | Trash | Not translated | 0 | 36 | 0 | 5 fixed-side classes, none RTL-aware | Low | No |
| `/admin/user-sessions` | User Monitoring | Not translated | 0 | 13 | 0 | 1 fixed-side class, none RTL-aware | Low | No |
| `/admin/users` | User Management | Partial (under half) | 3 | 65 | 2 | 18 fixed-side classes, none RTL-aware | Medium | No |
| `/staff` | View Staff | Not translated | 0 | 27 | 1 | 1 fixed-side class, none RTL-aware | Low | No |
| `/staff/[id]` | View Staff (child page — not itself in sidebar) | Not translated | 0 | 111 | 3 | 16 fixed-side classes, none RTL-aware | Medium | No |
| `/staff/[id]/edit` | View Staff (child page — not itself in sidebar) | Partial (under half) | 2 | 98 | 1 | No fixed-side classes found | Medium | No |
| `/staff/add` | Add Staff | Partial (under half) | 17 | 81 | 2 | 3 fixed-side classes, none RTL-aware | Medium | No |
| `/staff/attendence` | View Staff (child page — not itself in sidebar) | Partial (over half) | 10 | 2 | 1 | No fixed-side classes found | Low | No |
| `/staff/list` | View Staff (child page — not itself in sidebar) | Partial (under half) | 23 | 176 | 5 | 16 fixed-side classes, none RTL-aware | High | No |
| `/staff/roles` | View Staff (child page — not itself in sidebar) | Partial (under half) | 3 | 16 | 1 | No fixed-side classes found | Low | No |
| `/work-plans` | Workplans | Not translated | 0 | 34 | 1 | 5 fixed-side classes, none RTL-aware | Low | No |

### Academics

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/academics/allocations` | Teacher Allocation | Partial (under half) ⚠ legacy helper | 5 | 104 | 5 | 26 fixed-side classes, none RTL-aware | Medium | No |
| `/academics/allocations/history` | Allocation History | Not translated | 0 | 20 | 0 | 3 fixed-side classes, none RTL-aware | Low | No |
| `/academics/classes` | Classes | Partial (under half) | 2 | 78 | 2 | 15 fixed-side classes, none RTL-aware | Medium | No |
| `/academics/classes/[id]` | Classes (child page — not itself in sidebar) | Not translated | 0 | 15 | 0 | 5 fixed-side classes, none RTL-aware | Low | No |
| `/academics/curriculums` | Curriculums | Not translated | 0 | 1 | 0 | No fixed-side classes found | Low | No |
| `/academics/exams` | Examinations | Partial (under half) ⚠ legacy helper | 3 | 25 | 1 | 9 fixed-side classes, none RTL-aware | High | No |
| `/academics/report-cards` | Report Cards | Partial (over half) | 17 | 11 | 2 | 12 fixed-side classes, none RTL-aware | High | No |
| `/academics/report-cards/[type]/[snapshotId]` | Report Cards (child page — not itself in sidebar) | Not translated | 0 | 70 | 6 | 10 fixed-side classes, none RTL-aware | High | No |
| `/academics/report-cards/manage` | Report Cards (child page — not itself in sidebar) | Not translated | 0 | 50 | 0 | 5 fixed-side classes, none RTL-aware | High | No |
| `/academics/report-cards/secular` | Secular Report Cards | Not translated | 0 | 74 | 4 | 14 fixed-side classes, none RTL-aware | High | No |
| `/academics/report-cards/theology` | Theology Report Cards | Not translated | 0 | 74 | 4 | 14 fixed-side classes, none RTL-aware | High | No |
| `/academics/reports` | Reports (Legacy) | Partial (under half) | 19 | 110 | 5 | 7 fixed-side classes, 1 RTL-aware | High | No |
| `/academics/results` | Results | Partial (under half) ⚠ legacy helper | 38 | 233 | 14 | 50 fixed-side classes, none RTL-aware | High | No |
| `/academics/results-cafe` | CAFE Result Entry | Partial (under half) | 6 | 23 | 1 | 5 fixed-side classes, none RTL-aware | High | No |
| `/academics/streams` | Streams | Not translated | 0 | 24 | 1 | 7 fixed-side classes, none RTL-aware | Low | No |
| `/academics/subjects` | Subjects | Not translated ⚠ legacy helper | 0 | 69 | 2 | 17 fixed-side classes, none RTL-aware | Medium | No |
| `/academics/subjects/[id]` | Subjects (child page — not itself in sidebar) | Not translated | 0 | 14 | 0 | 5 fixed-side classes, none RTL-aware | Low | No |
| `/academics/subjects/order` | Subjects (child page — not itself in sidebar) | Not translated | 0 | 9 | 0 | No fixed-side classes found | Low | No |
| `/academics/timetable` | Timetable | Not translated | 0 | 43 | 1 | 8 fixed-side classes, none RTL-aware | Medium | No |
| `/academics/years` | Academic Years | Partial (under half) | 7 | 36 | 1 | 2 fixed-side classes, none RTL-aware | Low | No |
| `/examinations/deadlines` | Deadlines | Not translated | 0 | 23 | 0 | 2 fixed-side classes, none RTL-aware | Low | No |
| `/promotions` | Promotions | Not translated | 0 | 45 | 0 | 16 fixed-side classes, none RTL-aware | High | No |
| `/terms/list` | Terms | Partial (over half) ⚠ legacy helper | 12 | 8 | 2 | 3 fixed-side classes, none RTL-aware | Low | No |

### Documents & Assessment

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/admin/cafe` | CAFE (Assessment Engine) | Partial (under half) | 31 | 73 | 2 | 8 fixed-side classes, none RTL-aware | Medium | No |
| `/admin/custom-fields` | Custom Fields | Partial (under half) | 6 | 37 | 1 | No fixed-side classes found | Low | No |
| `/admin/drce/blocks` | Block Library | Not translated | 0 | 19 | 0 | No fixed-side classes found | Low | No |
| `/drce/new` | New Document | Not translated | 0 | 9 | 0 | 6 fixed-side classes, none RTL-aware | High | No |
| `/issuance` | Issuance | Mostly wired | 7 | 0 | 1 | 1 fixed-side class, none RTL-aware | Low | No |
| `/issuance/batches/[id]` | Issuance (child page — not itself in sidebar) | Mostly wired | 6 | 0 | 1 | 1 fixed-side class, none RTL-aware | Low | No |
| `/issuance/new` | Issuance (child page — not itself in sidebar) | Partial (under half) | 12 | 26 | 2 | 6 fixed-side classes, none RTL-aware | Low | No |
| `/reports/kitchen` | Template Kitchen | Partial (under half) | 7 | 104 | 6 | 14 fixed-side classes, none RTL-aware | High | No |
| `/reports/kitchen/drce/[id]` | Template Kitchen (child page — not itself in sidebar) | Partial (under half) | 28 | 832 | 18 | 30 fixed-side classes, none RTL-aware | High | No |

### Finance

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/finance` | Overview | Mostly wired | 21 | 0 | 1 | No fixed-side classes found | High | No |
| `/finance/bills` | Bills (generate) | Not translated | 0 | 44 | 0 | 11 fixed-side classes, none RTL-aware | High | No |
| `/finance/budgets` | Budgets | Not translated | 0 | 12 | 0 | 1 fixed-side class, none RTL-aware | High | No |
| `/finance/circular` | Fee Circular | Not translated | 0 | 13 | 0 | 3 fixed-side classes, none RTL-aware | High | No |
| `/finance/clearance` | Clearance | Not translated | 0 | 20 | 0 | 12 fixed-side classes, none RTL-aware | High | No |
| `/finance/dashboard` | Overview (child page — not itself in sidebar) | Mostly wired | 35 | 0 | 1 | 5 fixed-side classes, none RTL-aware | High | No |
| `/finance/expenditures` | Expenditures | Partial (under half) | 1 | 40 | 2 | 10 fixed-side classes, none RTL-aware | High | No |
| `/finance/fee-items` | Fee Items | Not translated | 0 | 25 | 0 | 9 fixed-side classes, none RTL-aware | High | No |
| `/finance/fee-rules` | Fee Rules | Not translated | 0 | 22 | 0 | No fixed-side classes found | High | No |
| `/finance/fees` | Fees | Partial (under half) | 1 | 52 | 4 | 15 fixed-side classes, none RTL-aware | High | No |
| `/finance/import` | Import | Not translated | 0 | 27 | 0 | 8 fixed-side classes, none RTL-aware | High | No |
| `/finance/import-fees` | Import Fees | Not translated | 0 | 11 | 0 | 6 fixed-side classes, none RTL-aware | High | No |
| `/finance/import-v2` | Overview (child page — not itself in sidebar) | Not translated | 0 | 19 | 0 | No fixed-side classes found | High | No |
| `/finance/learners-fees` | Learner Fees | Partial (under half) | 2 | 54 | 2 | 14 fixed-side classes, none RTL-aware | High | No |
| `/finance/ledger` | Overview (child page — not itself in sidebar) | Not translated | 0 | 47 | 0 | 4 fixed-side classes, none RTL-aware | High | No |
| `/finance/ledger-v2` | Ledger | Partial (under half) | 2 | 46 | 2 | 2 fixed-side classes, none RTL-aware | High | No |
| `/finance/ledger/fees` | Overview (child page — not itself in sidebar) | Not translated | 0 | 32 | 1 | 12 fixed-side classes, none RTL-aware | High | No |
| `/finance/locations` | Money Locations | Not translated | 0 | 34 | 0 | 10 fixed-side classes, none RTL-aware | High | No |
| `/finance/payments` | Payments | Partial (under half) | 1 | 76 | 3 | 19 fixed-side classes, none RTL-aware | High | No |
| `/finance/pocket-money` | Pocket Money | Not translated | 0 | 22 | 0 | 20 fixed-side classes, none RTL-aware | High | No |
| `/finance/receipts/[receiptNo]` | Overview (child page — not itself in sidebar) | Not translated | 0 | 11 | 0 | 5 fixed-side classes, none RTL-aware | High | No |
| `/finance/settings` | Overview (child page — not itself in sidebar) | Not translated | 0 | 5 | 0 | 2 fixed-side classes, none RTL-aware | High | No |
| `/finance/waivers` | Waivers | Not translated | 0 | 20 | 0 | 9 fixed-side classes, none RTL-aware | High | No |
| `/finance/wallets` | Wallets | Partial (under half) | 1 | 47 | 4 | 5 fixed-side classes, none RTL-aware | High | No |
| `/payroll/payments` | Pay Runs | Not translated | 0 | 19 | 0 | 1 fixed-side class, none RTL-aware | High | No |
| `/payroll/salaries` | Payroll | Not translated | 0 | 21 | 0 | 1 fixed-side class, none RTL-aware | High | No |

### Inventory

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/inventory` | Overview | Not translated | 0 | 9 | 0 | 2 fixed-side classes, none RTL-aware | Low | No |
| `/inventory/items` | Items | Not translated | 0 | 22 | 0 | 2 fixed-side classes, none RTL-aware | Low | No |
| `/inventory/stores` | Stores | Not translated | 0 | 10 | 0 | No fixed-side classes found | Low | No |
| `/inventory/transactions` | Movements | Not translated | 0 | 24 | 0 | 2 fixed-side classes, none RTL-aware | Low | No |

### Tahfiz

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/tahfiz` | Overview | Partial (over half) | 15 | 3 | 1 | 1 fixed-side class, none RTL-aware | Low | No |
| `/tahfiz/attendance` | Attendance | Partial (under half) | 2 | 20 | 1 | 8 fixed-side classes, none RTL-aware | Low | No |
| `/tahfiz/books` | Books | Not translated | 0 | 35 | 0 | No fixed-side classes found | Low | No |
| `/tahfiz/groups` | Groups | Partial (under half) | 2 | 60 | 4 | 18 fixed-side classes, none RTL-aware | Medium | No |
| `/tahfiz/learners` | Overview (child page — not itself in sidebar) | Not translated | 0 | 2 | 0 | No fixed-side classes found | Low | No |
| `/tahfiz/participants` | Participants | Not translated | 0 | 32 | 0 | 3 fixed-side classes, none RTL-aware | Low | No |
| `/tahfiz/plans` | Plans | Partial (under half) | 1 | 17 | 1 | 3 fixed-side classes, none RTL-aware | Low | No |
| `/tahfiz/portions` | Portions | Partial (under half) | 2 | 160 | 7 | 25 fixed-side classes, none RTL-aware | High | No |
| `/tahfiz/records` | Records | Mostly wired | 11 | 0 | 1 | 4 fixed-side classes, none RTL-aware | Low | No |
| `/tahfiz/reports` | Reports | Not translated | 0 | 67 | 1 | 10 fixed-side classes, 2 RTL-aware | Medium | No |
| `/tahfiz/reports/[id]` | Reports (child page — not itself in sidebar) | Not translated | 0 | 12 | 0 | No fixed-side classes found | Low | No |
| `/tahfiz/results` | Results | Partial (over half) | 42 | 8 | 2 | 23 fixed-side classes, none RTL-aware | Low | No |
| `/tahfiz/students` | Overview (child page — not itself in sidebar) | Partial (under half) | 2 | 141 | 5 | 18 fixed-side classes, none RTL-aware | Medium | No |

### Reports

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/analytics/finance` | Finance | Not translated | 0 | 10 | 1 | No fixed-side classes found | Low | No |
| `/analytics/staff` | Staff | Not translated | 0 | 4 | 0 | No fixed-side classes found | Low | No |
| `/analytics/students` | Students | Not translated | 0 | 11 | 1 | No fixed-side classes found | Low | No |
| `/finance/reports/balance-sheet` | Balance Sheet | Partial (over half) | 30 | 6 | 2 | No fixed-side classes found | High | No |
| `/finance/reports/income-statement` | Income Statement | Partial (over half) | 27 | 6 | 2 | No fixed-side classes found | High | No |
| `/reports/custom` | Custom Reports | Not translated | 0 | 22 | 0 | 6 fixed-side classes, none RTL-aware | High | No |

### Settings

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/about` | About DRAIS | Not translated | 0 | 50 | 0 | 10 fixed-side classes, none RTL-aware | Medium | No |
| `/settings/academic-programs` | Programs | Not translated | 0 | 19 | 0 | 7 fixed-side classes, none RTL-aware | Low | No |
| `/settings/appearance` | Appearance | Partial (under half) | 2 | 44 | 1 | 3 fixed-side classes, 1 RTL-aware | Medium | No |
| `/settings/database` | Database | Not translated | 0 | 26 | 0 | No fixed-side classes found | Low | No |
| `/settings/hours` | School Hours | No own text (redirect/shell) | 0 | 0 | 1 | No fixed-side classes found | Low | No |
| `/settings/localization` | Localization | Mostly wired | 33 | 3 | 1 | 7 fixed-side classes, none RTL-aware | Low | No |
| `/settings/nexus` | Nexus | Not translated | 0 | 12 | 0 | 2 fixed-side classes, none RTL-aware | Low | No |
| `/settings/offline-export` | Offline Database | Not translated | 0 | 15 | 0 | No fixed-side classes found | Low | No |
| `/settings/profile` | My Profile | Partial (under half) | 1 | 27 | 1 | 6 fixed-side classes, none RTL-aware | Low | No |
| `/settings/relay` | Relay Setup | Not translated | 0 | 117 | 1 | 7 fixed-side classes, none RTL-aware | Medium | No |
| `/settings/report-comments` | Report Comments | Not translated | 0 | 84 | 2 | 20 fixed-side classes, none RTL-aware | Medium | No |
| `/settings/school` | School | Partial (under half) | 2 | 50 | 1 | 1 fixed-side class, none RTL-aware | Medium | No |
| `/settings/system` | System Status | Partial (under half) | 2 | 6 | 1 | No fixed-side classes found | Low | No |
| `/settings/templates` | Templates | Partial (under half) | 2 | 22 | 1 | 5 fixed-side classes, none RTL-aware | Low | No |
| `/settings/templates/[id]/edit` | Templates (child page — not itself in sidebar) | Not translated | 0 | 89 | 0 | 5 fixed-side classes, none RTL-aware | Medium | No |

### Offline Workspace (Beta)

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/academics/offline` | Academics | Not translated | 0 | 61 | 0 | 20 fixed-side classes, none RTL-aware | Medium | No |
| `/attendance/offline` | Attendance | Not translated | 0 | 31 | 0 | 7 fixed-side classes, none RTL-aware | Low | No |
| `/reports/offline` | Reports | Not translated | 0 | 20 | 0 | 20 fixed-side classes, none RTL-aware | High | No |
| `/staff/offline` | Staff | Not translated | 0 | 46 | 0 | 10 fixed-side classes, none RTL-aware | Medium | No |

### Help & Guides

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/help` | Help Center | Not translated | 0 | 71 | 2 | 9 fixed-side classes, none RTL-aware | Medium | No |
| `/help/guides/attendance-daily` | Attendance day to day | Not translated | 0 | 66 | 1 | 1 fixed-side class, none RTL-aware | Medium | No |
| `/help/guides/boarding-and-sms` | Help Center (child page — not itself in sidebar) | Not translated | 0 | 75 | 1 | 1 fixed-side class, none RTL-aware | Medium | No |
| `/help/guides/buying-sms` | Help Center (child page — not itself in sidebar) | Not translated | 0 | 40 | 1 | 1 fixed-side class, none RTL-aware | Low | No |
| `/help/guides/enrol-fingerprints` | Enrolling fingerprints | Not translated | 0 | 61 | 1 | 1 fixed-side class, none RTL-aware | Medium | No |
| `/help/guides/fees` | Fees & payments | Not translated | 0 | 65 | 1 | 1 fixed-side class, none RTL-aware | Medium | No |
| `/help/guides/first-week` | Your first week | Not translated | 0 | 86 | 1 | 1 fixed-side class, none RTL-aware | Medium | No |
| `/help/guides/fix-problems` | Fixing common problems | Not translated | 0 | 90 | 1 | 2 fixed-side classes, none RTL-aware | Medium | No |
| `/help/guides/id-cards` | Help Center (child page — not itself in sidebar) | Not translated | 0 | 80 | 1 | 1 fixed-side class, none RTL-aware | Medium | No |
| `/help/guides/learners` | Learners day to day | Not translated | 0 | 101 | 1 | 1 fixed-side class, none RTL-aware | Medium | No |
| `/help/guides/marks-and-reports` | Marks & report cards | Not translated | 0 | 64 | 1 | 1 fixed-side class, none RTL-aware | Medium | No |
| `/help/guides/messages` | Messaging guardians | Not translated | 0 | 77 | 1 | 1 fixed-side class, none RTL-aware | Medium | No |
| `/help/guides/recover-data` | Recovering data | Not translated | 0 | 57 | 1 | 1 fixed-side class, none RTL-aware | Medium | No |
| `/help/guides/users-and-access` | Staff accounts & access | Not translated | 0 | 74 | 1 | 1 fixed-side class, none RTL-aware | Medium | No |

### Not in sidebar — /academics

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/academics` | — | Partial (under half) ⚠ legacy helper | 24 | 116 | 6 | 29 fixed-side classes, none RTL-aware | Medium | No |
| `/academics/tahfiz` | — | Not translated | 0 | 11 | 0 | No fixed-side classes found | Low | No |

### Not in sidebar — /admin

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/admin/devices` | — | No own text (redirect/shell) | 0 | 0 | 0 | No fixed-side classes found | Low | No |
| `/admin/staff` | — | Not translated | 0 | 30 | 0 | 11 fixed-side classes, none RTL-aware | Low | No |
| `/admin/templates` | — | Not translated | 0 | 117 | 0 | 5 fixed-side classes, none RTL-aware | Medium | No |

### Not in sidebar — /auth

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/auth/login` | — | Not translated | 0 | 25 | 2 | 11 fixed-side classes, none RTL-aware | Low | No |
| `/auth/set-password` | — | Not translated | 0 | 13 | 0 | 8 fixed-side classes, none RTL-aware | Low | No |

### Not in sidebar — /backup

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/backup` | — | Not translated | 0 | 20 | 1 | 21 fixed-side classes, none RTL-aware | Low | No |

### Not in sidebar — /control

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/control` | — | Not translated | 0 | 9 | 0 | No fixed-side classes found | Low | No |
| `/control/audit` | — | Not translated | 0 | 18 | 1 | 9 fixed-side classes, none RTL-aware | Low | No |
| `/control/backup` | — | Not translated | 0 | 22 | 1 | 21 fixed-side classes, none RTL-aware | Low | No |
| `/control/bi` | — | Not translated | 0 | 14 | 1 | No fixed-side classes found | Low | No |
| `/control/comm` | — | Not translated | 0 | 11 | 0 | 4 fixed-side classes, none RTL-aware | Low | No |
| `/control/dashboard` | — | Not translated | 0 | 9 | 0 | No fixed-side classes found | Low | No |
| `/control/database-settings` | — | Not translated | 0 | 8 | 0 | No fixed-side classes found | Low | No |
| `/control/devices` | — | Not translated | 0 | 23 | 1 | 5 fixed-side classes, none RTL-aware | Low | No |
| `/control/docs` | — | Not translated | 0 | 51 | 0 | 6 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/architecture` | — | Not translated | 0 | 50 | 1 | 5 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/attendance-decisions` | — | Not translated | 0 | 44 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/blueprint-drce-editor` | — | Not translated | 0 | 126 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/blueprint-students-list` | — | Not translated | 0 | 99 | 1 | 6 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/components` | — | Not translated | 0 | 130 | 1 | 5 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/dashboard-anatomy` | — | Partial (under half) | 1 | 81 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/data` | — | Not translated | 0 | 59 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/data-flow` | — | Not translated | 0 | 102 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/decisions` | — | Not translated | 0 | 52 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/frontend` | — | Not translated | 0 | 129 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/hooks` | — | Not translated | 0 | 103 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/id-card-studio` | — | Not translated | 0 | 35 | 1 | 4 fixed-side classes, none RTL-aware | Low | No |
| `/control/docs/learn-async` | — | Not translated | 0 | 104 | 2 | 11 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/learn-capstone` | — | Partial (under half) | 3 | 141 | 2 | 11 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/learn-hooks-deep` | — | Not translated | 0 | 127 | 2 | 11 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/learn-lab-attendance` | — | Not translated | 0 | 106 | 2 | 12 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/learn-nextjs` | — | Not translated | 0 | 125 | 2 | 11 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/learn-patterns` | — | Not translated | 0 | 106 | 2 | 10 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/learn-react` | — | Not translated | 0 | 122 | 2 | 12 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/learn-sql` | — | Not translated | 0 | 156 | 2 | 11 fixed-side classes, none RTL-aware | High | No |
| `/control/docs/learn-tsx` | — | Not translated | 0 | 154 | 2 | 11 fixed-side classes, none RTL-aware | High | No |
| `/control/docs/learn-typescript` | — | Not translated | 0 | 180 | 2 | 12 fixed-side classes, none RTL-aware | High | No |
| `/control/docs/module-attendance` | — | Not translated | 0 | 96 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/module-control` | — | Not translated | 0 | 99 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/module-finance` | — | Not translated | 0 | 85 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/module-portal` | — | Not translated | 0 | 100 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/module-reports` | — | Not translated | 0 | 129 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/module-students` | — | Not translated | 0 | 97 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/module-tahfiz` | — | Not translated | 0 | 71 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/offline-sqlite` | — | Not translated | 0 | 88 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/operations` | — | Not translated | 0 | 92 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/platform-api` | — | Not translated | 0 | 63 | 1 | 6 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/playbook-api` | — | Not translated | 0 | 79 | 1 | 6 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/playbook-module` | — | Not translated | 0 | 82 | 1 | 5 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/playbook-page` | — | Not translated | 0 | 69 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/request-lifecycle` | — | Not translated | 0 | 61 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/schema` | — | Not translated | 0 | 95 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/security` | — | Not translated | 0 | 86 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/subsystems` | — | Not translated | 0 | 77 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/system-map` | — | Not translated | 0 | 64 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/docs/theming` | — | Not translated | 0 | 112 | 1 | 4 fixed-side classes, none RTL-aware | Medium | No |
| `/control/id-cards/watermark` | — | Not translated | 0 | 5 | 0 | 3 fixed-side classes, none RTL-aware | Low | No |
| `/control/operators` | — | Not translated | 0 | 22 | 0 | 5 fixed-side classes, none RTL-aware | Low | No |
| `/control/plans` | — | Not translated | 0 | 34 | 1 | 2 fixed-side classes, none RTL-aware | Low | No |
| `/control/schools` | — | Not translated | 0 | 34 | 1 | 3 fixed-side classes, none RTL-aware | Low | No |
| `/control/schools/[id]` | — | Not translated | 0 | 58 | 0 | 2 fixed-side classes, none RTL-aware | Medium | No |
| `/control/sentinel` | — | Not translated | 0 | 33 | 0 | 1 fixed-side class, none RTL-aware | Low | No |
| `/control/sessions` | — | Not translated | 0 | 8 | 0 | No fixed-side classes found | Low | No |
| `/control/sms` | — | Not translated | 0 | 37 | 0 | 15 fixed-side classes, none RTL-aware | Low | No |
| `/control/sms/accounting` | — | Not translated | 0 | 18 | 0 | 17 fixed-side classes, none RTL-aware | Low | No |
| `/control/sms/pricing` | — | Not translated | 0 | 38 | 0 | 15 fixed-side classes, none RTL-aware | Low | No |
| `/control/sms/providers` | — | Not translated | 0 | 57 | 0 | 1 fixed-side class, none RTL-aware | Medium | No |
| `/control/sms/routing` | — | Not translated | 0 | 33 | 0 | 10 fixed-side classes, none RTL-aware | Low | No |
| `/control/system-health` | — | Not translated | 0 | 17 | 1 | No fixed-side classes found | Low | No |
| `/control/user-locks` | — | Not translated | 0 | 23 | 0 | 7 fixed-side classes, none RTL-aware | Low | No |

### Not in sidebar — /deadlines

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/deadlines` | — | Not translated | 0 | 1 | 0 | No fixed-side classes found | Low | No |

### Not in sidebar — /departments

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/departments` | — | Not translated | 0 | 21 | 2 | 7 fixed-side classes, none RTL-aware | Low | No |

### Not in sidebar — /docs

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/docs` | — | No own text (redirect/shell) | 0 | 0 | 0 | No fixed-side classes found | Low | No |

### Not in sidebar — /documents

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/documents` | — | Partial (over half) ⚠ legacy helper | 10 | 2 | 1 | No fixed-side classes found | Low | No |

### Not in sidebar — /events

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/events` | — | Partial (over half) ⚠ legacy helper | 5 | 0 | 1 | No fixed-side classes found | Low | No |

### Not in sidebar — /fingerprint-auth

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/fingerprint-auth` | — | Not translated | 0 | 2 | 0 | No fixed-side classes found | Low | No |

### Not in sidebar — /forbidden

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/forbidden` | — | Mostly wired | 14 | 0 | 1 | 2 fixed-side classes, 7 RTL-aware | Low | No |

### Not in sidebar — /intelligence

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/intelligence` | — | Not translated | 0 | 77 | 1 | 26 fixed-side classes, none RTL-aware | Medium | No |

### Not in sidebar — /login

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/login` | — | Not translated | 0 | 25 | 3 | 4 fixed-side classes, none RTL-aware | Low | No |

### Not in sidebar — /maintenance

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/maintenance` | — | Not translated | 0 | 14 | 0 | No fixed-side classes found | Low | No |

### Not in sidebar — /not-implemented

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/not-implemented` | — | Not translated | 0 | 8 | 0 | No fixed-side classes found | Low | No |

### Not in sidebar — /notifications

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/notifications` | — | Not translated | 0 | 14 | 1 | 5 fixed-side classes, none RTL-aware | Low | No |

### Not in sidebar — /parent

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/parent` | — | Not translated | 0 | 7 | 0 | No fixed-side classes found | Low | No |
| `/parent/compare` | — | Not translated | 0 | 11 | 0 | 4 fixed-side classes, none RTL-aware | Low | No |
| `/parent/learners/[learnerAccessId]` | — | Not translated | 0 | 16 | 0 | No fixed-side classes found | Low | No |
| `/parent/login` | — | Not translated | 0 | 4 | 0 | No fixed-side classes found | Low | No |
| `/parent/verify` | — | Not translated | 0 | 4 | 0 | No fixed-side classes found | Low | No |

### Not in sidebar — /payroll

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/payroll` | — | Not translated | 0 | 11 | 0 | No fixed-side classes found | High | No |
| `/payroll/definitions` | — | Not translated | 0 | 18 | 0 | 1 fixed-side class, none RTL-aware | High | No |
| `/payroll/salary_payments` | — | Not translated | 0 | 19 | 0 | 1 fixed-side class, none RTL-aware | High | No |

### Not in sidebar — /portal

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/portal` | — | Not translated | 0 | 10 | 0 | 1 fixed-side class, none RTL-aware | Low | No |
| `/portal/learners/[id]` | — | Not translated | 0 | 15 | 0 | 1 fixed-side class, none RTL-aware | Low | No |
| `/portal/login` | — | Not translated | 0 | 7 | 0 | 6 fixed-side classes, none RTL-aware | Low | No |
| `/portal/register` | — | Not translated | 0 | 8 | 0 | 9 fixed-side classes, none RTL-aware | Low | No |
| `/portal/reset` | — | Not translated | 0 | 5 | 0 | 6 fixed-side classes, none RTL-aware | Low | No |

### Not in sidebar — /print-snapshot

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/print-snapshot/[type]/[snapshotId]` | — | Not translated | 0 | 12 | 2 | No fixed-side classes found | High | No |

### Not in sidebar — /print-transcript

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/print-transcript/[studentId]` | — | Not translated | 0 | 28 | 0 | No fixed-side classes found | High | No |

### Not in sidebar — /profile

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/profile` | — | No own text (redirect/shell) | 0 | 0 | 0 | No fixed-side classes found | Low | No |

### Not in sidebar — /reminders

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/reminders` | — | Not translated | 0 | 1 | 0 | No fixed-side classes found | Low | No |

### Not in sidebar — /reports

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/reports` | — | Not translated | 0 | 82 | 3 | 35 fixed-side classes, none RTL-aware | High | No |
| `/reports/learners` | — | Not translated | 0 | 2 | 0 | No fixed-side classes found | High | No |
| `/reports/northgate` | — | Not translated | 0 | 101 | 3 | 14 fixed-side classes, none RTL-aware | High | No |

### Not in sidebar — /results

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/results` | — | Not translated | 0 | 21 | 0 | 4 fixed-side classes, none RTL-aware | High | No |

### Not in sidebar — /root

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/` | — | No own text (redirect/shell) | 0 | 0 | 0 | No fixed-side classes found | Low | No |

### Not in sidebar — /rpt

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/rpt` | — | Not translated | 0 | 63 | 0 | No fixed-side classes found | High | No |

### Not in sidebar — /school-selection

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/school-selection` | — | Not translated | 0 | 36 | 1 | 1 fixed-side class, none RTL-aware | Low | No |

### Not in sidebar — /server-error

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/server-error` | — | Partial (over half) | 5 | 4 | 1 | No fixed-side classes found | Low | No |

### Not in sidebar — /settings

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/settings` | — | No own text (redirect/shell) | 0 | 0 | 0 | No fixed-side classes found | Low | No |
| `/settings/branding` | — | Not translated | 0 | 21 | 0 | No fixed-side classes found | Low | No |
| `/settings/modules` | — | Not translated | 0 | 6 | 0 | No fixed-side classes found | Low | No |
| `/settings/study-modes` | — | Partial (under half) | 2 | 29 | 1 | 1 fixed-side class, none RTL-aware | Low | No |

### Not in sidebar — /setup

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/setup/local-sqlite` | — | Not translated | 0 | 26 | 0 | 3 fixed-side classes, none RTL-aware | Low | No |

### Not in sidebar — /signup

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/signup` | — | Not translated | 0 | 44 | 2 | 5 fixed-side classes, none RTL-aware | Medium | No |

### Not in sidebar — /terms

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/terms/[id]` | — | Partial (over half) ⚠ legacy helper | 31 | 0 | 5 | 6 fixed-side classes, none RTL-aware | Medium | No |

### Not in sidebar — /unauthorized

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/unauthorized` | — | Not translated | 0 | 8 | 0 | No fixed-side classes found | Low | No |

### Not in sidebar — /verify

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/verify/[token]` | — | Not translated | 0 | 12 | 0 | No fixed-side classes found | Low | No |

### Not in sidebar — /workplans

| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |
|---|---|---|---|---|---|---|---|---|
| `/workplans` | — | Not translated | 0 | 14 | 1 | No fixed-side classes found | Low | No |

⚠ legacy helper = the route renders a component that imports `t` from `@/lib/i18n` or `next-i18next`; those calls never produce Arabic (architecture audit, finding F2).

## Shared components (used by 3 or more routes)

Fixing one of these changes every route that uses it, so each must be re-tested across its routes.

| Component | Routes using it | Hardcoded (est.) | Translated calls | Translation hook |
|---|---|---|---|---|
| `app/control/docs/ControlDoc.tsx` | 41 | 10 | 0 | none |
| `components/help/HelpDoc.tsx` | 14 | 22 | 0 | none |
| `components/reports/GenerateSnapshotModal.tsx` | 4 | 59 | 0 | none |
| `contexts/AuthContext.tsx` | 20 | 6 | 0 | none |
| `app/control/docs/Lesson.tsx` | 10 | 12 | 0 | none |
| `components/drce/editor/VisibilityRuleEditor.tsx` | 4 | 22 | 0 | none |
| `components/drce/DRCEDocumentRenderer.tsx` | 5 | 8 | 0 | none |
| `components/reports/SnapshotListTable.tsx` | 3 | 11 | 0 | none |
| `components/ui/Pagination.tsx` | 7 | 3 | 0 | none |
| `components/ui/NewBadge.tsx` | 9 | 2 | 0 | none |
| `app/control/_components/ExportButtons.tsx` | 6 | 2 | 0 | none |
| `components/ui/Select.tsx` | 3 | 0 | 0 | none |
| `components/drce/SectionErrorBoundary.tsx` | 5 | 0 | 0 | none |
| `components/reports/GenerateSnapshotButton.tsx` | 4 | 0 | 0 | none |
| `components/ui/Modal.tsx` | 5 | 0 | 0 | none |
| `components/ui/Toast.tsx` | 4 | 0 | 0 | none |

## Verification log

_Empty. Add one entry per route as it is completed: date, translation keys added or changed, files changed, tests run and their results, what was checked in the browser (Arabic and English, desktop and mobile), interactions exercised, and any known limitation._
