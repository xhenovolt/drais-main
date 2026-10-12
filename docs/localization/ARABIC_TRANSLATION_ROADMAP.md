# DRAIS Localization — Arabic Translation Roadmap

_Written 2026-10-12 after the Phase 0 audit. Nothing in this roadmap has been started. Read
`LOCALIZATION_ARCHITECTURE_AUDIT.md` first; finding numbers (F1–F12) refer to it._

## The goal

When a user switches DRAIS to Arabic, every supported, visible part of the page they are on is in Arabic and
still works: titles, forms, tables, buttons, dialogs, messages and errors, not only the menus. English keeps
working exactly as before.

## How progress is counted

By **verified routes and verified interactions**, never by the number of dictionary entries. The audit showed
why: the dictionary is 98% matched between the two languages while 75% of routes make no translation call.

A route moves through five states, and the route inventory records each one:

| State | Meaning |
|---|---|
| Inventoried | Every visible string on the route and in its child components is listed |
| Translated | All of them go through `t()` with entries in both dictionaries |
| Browser-tested | The page was opened in Arabic and in English, desktop and phone width, and looked at |
| Interactions tested | Its forms, filters, buttons, dialogs and exports were used in Arabic and still work |
| Closed | Evidence is written in the inventory's verification log |

A module is complete when all its routes are closed and its shared components have been re-tested on every
route that uses them.

## Decisions needed before Phase 1

These are owner decisions; the work is blocked or changes shape without them (audit, section 5).

| # | Decision | Recommendation |
|---|---|---|
| 1 | Is the Control Center (`/control/*`, 64 routes) in scope? | No. It is the operator console, not seen by schools. Leave it English. |
| 2 | Are the Help guides (`/help/*`, 14 routes of long articles) in scope now? | Translate the page frame now; schedule the articles as a separate writing task with a reviewer. |
| 3 | Is the parent portal (`/portal/*`, `/parent/*`, 10 routes) in scope? | Yes, straight after Students. Parents are the audience most likely to need Arabic. |
| 4 | Digits in Arabic mode: Western (0123) or Arabic-Indic (٠١٢٣)? Hijri dates? | Western digits and Gregorian dates in the interface, matching current behaviour; keep the existing per-report numeral choice. |
| 5 | Who reviews Arabic wording for education, fees and attendance terms? | Name one Arabic-speaking reviewer; build a short glossary with them in Phase 1. |
| 6 | Browser verification: add a browser-test tool, or verify by hand? | Verify by hand for Students and record it; decide on tooling in Phase 6 with real experience of the cost. |

With recommendations 1 and 2 accepted, the in-scope surface is **231 routes** instead of 309.

## Phase 1 — Translation foundation

No page content is translated in this phase. It makes the single existing system reliable so that every later
route is done once and stays done.

| Step | Work | Fixes |
|---|---|---|
| 1.1 | Add a completeness check that **fails** `npm test`: every key used in code exists in both dictionaries; same `{{placeholders}}` in both; no key written with a dot or a space inside one segment; report unused keys | F3, F4 |
| 1.2 | Add the 90 keys that are used in code but exist in neither dictionary, with reviewed Arabic | F4 |
| 1.3 | Move the 29 components and 175 calls off the dead `@/lib/i18n` helper, and the one `next-i18next` import, onto `useI18n()`. This also fixes the 13 strings that show Arabic while the interface is set to English. Then delete `src/lib/i18n.ts`, `src/lib/i18nServer.ts` and the three unused i18next packages | F2 |
| 1.4 | Repair the 40 malformed top-level dictionary entries (dotted or spaced keys) by moving them into proper groups | F3 |
| 1.5 | One source for menu labels: move the `LABEL_AR` table into the dictionary under `nav.*`, and add the 17 missing Arabic labels | F5 |
| 1.6 | Add plural support to the existing `t()` using the browser's built-in `Intl.PluralRules` (no new dependency) | conventions |
| 1.7 | Add shared `formatDate`, `formatNumber`, `formatMoney` helpers that take the active language, following decision 4 | F8 |
| 1.8 | First paint in the right language: read the saved language in the existing anti-flicker script and set `lang` and `dir` on `<html>` before the page shows | F9 |
| 1.9 | Collapse the two nested providers into one | F11 |
| 1.10 | A working server-side `t` for the 7 server-rendered pages with text, reading the `lang` cookie the store already writes | F6 |
| 1.11 | Name an Arabic font in the font stack and confirm it loads | F10 |
| 1.12 | Translate the shared interface components used across many routes (pagination, modal frame, confirm dialogs, empty states, the toast wrapper) | F1 |

**Exit test:** switch English → Arabic → English on five representative pages. The route stays the same, typed
form values survive, refresh keeps the language with no English flash, menus are fully Arabic, no console
errors, and the English interface looks unchanged from before the phase. The completeness check passes.

**Risk:** 1.3 touches finance, payroll, terms and academics components. It changes which function supplies the
text, not what the components do, but each affected route is opened in both languages before the step closes.

## Phase 2 — Students module (the first complete module)

24 routes: the 10 items in the Students menu (which includes `/admissions`), and 14 pages reached from buttons
and links inside them. Order follows the sidebar, then each page's linked pages:

| # | Route | Hardcoded strings (est.) | Notes |
|---|---|---|---|
| 1 | `/students/list` | 322 | The largest. 12 child components, already 24% wired. Includes bulk SMS, quick edit, fingerprint enrolment dialogs. |
| 2 | `/students/admit` | 41 | |
| 3 | `/admissions`, `/admissions/[id]` | 82 | |
| 4 | `/students/enroll` | 136 | Then `/students/enroll-bulk` (87) |
| 5 | `/students/requirements` | 112 | |
| 6 | `/students/contacts` | 157 | 7 child components |
| 7 | `/students/documents` | 42 | |
| 8 | `/students/duplicates` | 42 | |
| 9 | `/students/history` | 38 | |
| 10 | `/students/id-cards`, `/print`, `/studio` | 156 | The printed card itself is a document, covered by its own template language |
| 11 | `/students/[id]`, `/students/[id]/fees` | 177 | Learner profile; opened from the list |
| 12 | `/students/import`, `/import-v2`, `/migrate`, `/promote`, `/repair-names`, `/trash`, `/offline` | 295 | Tools reached from buttons |

For each route, in this order: list every string → add keys and Arabic → replace literals → fix direction
issues → open in both languages → use every control → write the verification entry → only then the next route.

Each route is its own commit, so any one can be reverted alone. After the last route, a module-wide pass
re-checks all 24 and the shared components they use.

## Phase 3 onward — remaining modules, in sidebar order

Same procedure, one module at a time. Sizes are static estimates of hardcoded strings.

| Order | Module | Routes | Hardcoded (est.) | Notes |
|---|---|---|---|---|
| 3 | Parent portal (`/portal`, `/parent`) | 10 | 87 | Small, high value (decision 3) |
| 4 | Overview / dashboard | 2 | 34 | |
| 5 | Attendance | 14 | 569 | 3 routes already mostly wired; check them for hidden English fallbacks |
| 6 | Gate & Movement | 4 | 109 | |
| 7 | Devices & Biometrics | 10 | 477 | Much technical device text stays as it is |
| 8 | Communication | 4 | 267 | Message **templates** are school content, not interface |
| 9 | Staff & Roles | 18 | 762 | |
| 10 | Academics | 25 | 1,286 | Marks and grading terms need the glossary |
| 11 | Documents & Assessment | 9 | 1,100 | Report designer; printed documents have their own bilingual vocabulary already |
| 12 | Finance and payroll | 29 | 767 | Money formatting; highest regression risk |
| 13 | Inventory | 4 | 65 | |
| 14 | Tahfiz | 13 | 557 | Religious terms need approved wording, not generated text |
| 15 | Reports | 9 | 244 | |
| 16 | Settings | 19 | 620 | |
| 17 | Offline workspace | 5 | 200 | |
| 18 | Sign-in, errors and other pages outside the sidebar | about 30 | about 500 | Login, signup, password reset, access denied, print views, verify |

## Phase 4 — Database-backed and dynamic content

Runs alongside the module phases wherever a route shows stored names.

- Names of people: keep the existing Arabic-name fields and the review workflow in `/settings/localization`.
  Nothing is auto-translated or overwritten.
- School-configured names (classes, subjects, streams, departments, terms, programmes, fee items): show the
  school's Arabic value when it exists, the stored value otherwise, and report what is missing on the existing
  coverage panel. Any new Arabic column is proposed and approved separately before a migration is written.
- Stored codes (statuses, roles, workflow states): unchanged in the database; mapped to label keys.
- Tahfiz and theology content: approved wording only.

## Phase 5 — Server messages and application-wide pieces

- **API messages** (about 3,550 strings in 727 files, F7). Add stable `code` values to responses, module by
  module, alongside the existing text, and translate codes on the page. Start with the endpoints the Students
  routes call. Existing `error` text stays so nothing that reads it breaks.
- Global search, notifications, error and access-denied pages, date pickers, charts, exports, document titles
  and accessibility labels.
- Every shared component that changes is re-tested on each route that renders it.

## Phase 6 — Automated gates

- The Phase 1 completeness check, extended with a rule that flags new hardcoded visible text in `.tsx` files
  for routes already closed, so finished routes cannot regress.
- Unit tests for plural selection, placeholder substitution and the formatters.
- A decision on browser-level tests (decision 6), based on what manual verification of Students cost.

## Phase 7 — Final audit and handover

A route-by-route coverage report built from the verification log, the list of content intentionally left in
its original language and why, unresolved defects, and a short guide for localizing a new page.

## What can go wrong, and how the plan guards against it

| Risk | Guard |
|---|---|
| A route looks translated in code but shows English | No English fallback in new code; the completeness check; a browser look is mandatory before closing |
| Translating breaks a form, filter or export | Only display text changes; stored values and API fields are never translated; interactions are re-tested per route |
| English regresses | Every route is opened in English as well as Arabic before it closes |
| Inconsistent Arabic terms across modules | One glossary, one reviewer, agreed in Phase 1 |
| A shared component fix breaks other pages | Shared components are listed in the inventory with the routes that use them, and re-tested on each |
| Work becomes one unreviewable change | One route per commit; one module per phase; the application is usable after every commit |
| Deployment fails mid-way | Commits are batched before pushing; each push is checked on the live site (the build must stay on Turbopack) |
