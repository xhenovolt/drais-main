# DRAIS Localization — Architecture Audit (Phase 0)

_Audit date: 2026-10-12, at commit `1a990daa`. Read-only: no application code was changed. This supersedes the
August `PHASE0_AUDIT.md` in this folder, which is kept for its history of the database-side Arabic work._

## Summary

Switching DRAIS to Arabic changes the menus and almost nothing else, because **the menus are the only part of
the interface that was systematically connected to the translation system.** The translation system itself
works. Most pages simply never call it.

- **309 routes** exist. **231 (75%)** make no translation call at all, in the page or in any component it
  renders. **59** are partly translated. **12** are mostly connected. 7 are redirects with no text of their own.
- The Arabic dictionary is nearly complete for what exists (2,050 Arabic entries against 2,027 English), but
  **1,303 of the 2,027 English entries are not referenced by any code**, and the pages contain roughly
  **15,000 visible English strings that have no dictionary entry at all.** Dictionary size says nothing about
  how much of the interface is translated.
- Three separate translation mechanisms are in the code. One works. Two are dead and silently show a fixed
  language.
- Right-to-left layout is switched on globally and works for the page frame, but page content is written with
  fixed left/right spacing almost everywhere (1,894 fixed-side classes against 16 direction-aware ones).

**What this audit did not do:** nothing was run in a browser. Every finding below comes from reading the code
and from a static measurement script (`scripts/l10n-audit.mjs`). Counts of "hardcoded strings" are estimates
that show where the work is; they are not proof of what a user sees. Browser verification is a required step
of every later phase, and the repository currently has no browser-test tooling (finding F12).

## 1. The localization implementation as it exists

### 1.1 The working system

| Piece | Location | What it does |
|---|---|---|
| Provider and hook | `src/components/i18n/I18nProvider.tsx` | `useI18n()` returns `{ lang, t, dir, setLang, ready, loading, error }` |
| Dictionaries | `src/locales/en.json`, `src/locales/ar.json` | Nested JSON, loaded on demand when the language changes |
| Language state | `src/hooks/useThemeStore.ts` (`language`, `languageExplicit`) | Zustand store persisted to `localStorage` under `drais-theme-store` |
| Menu labels | `src/lib/navigationConfig.tsx` | `getNavigationItems(t, lang)`; literal labels are translated through a `LABEL_AR` lookup table |
| Database names | `src/lib/i18n/localize.ts`, `translit.ts` | Server helpers that pick an Arabic column (`name_ar`) when one exists, falling back to English |

`t(key, varsOrFallback?, fallback?)` looks up a dotted key, replaces `{{name}}` placeholders, and returns the
English fallback text (or the key itself) when the key is missing. In development it logs a one-time console
warning per missing key.

### 1.2 Language switches

| Where | File | Call |
|---|---|---|
| Top bar language button | `src/components/layout/Navbar.tsx:86`, `Topbar.tsx:26` | `setLang(...)` |
| Mobile drawer | `src/components/layout/MobileDrawer.tsx:249` | `setLang(...)` |
| Settings → Appearance | `src/app/settings/appearance/page.tsx:233` | `setLang(...)` |
| Theme customizer panel | `src/components/layout/ThemeCustomizerPanel.tsx:128` | `store.setLanguage(...)` |

All five end in the same store action, so there is one source of truth for the active language.

## 2. The language-switching lifecycle, step by step

| Step | What happens | Result |
|---|---|---|
| 1. User clicks the language button | `setLang` → `useThemeStore.setLanguage` | Works |
| 2. Language is updated | Store sets `language` and `languageExplicit: true` | Works |
| 3. Preference is persisted | Zustand writes `localStorage`; a `lang` cookie is also set for one year | Works on that browser. **Not saved to the user's account**, so another device starts from the school default (F9) |
| 4. Components receive the language | `I18nProvider` reads the store and re-renders consumers of `useI18n()` | Works **only for components that call `useI18n()`** — 97 of the 663 `.tsx` files |
| 5. Dictionary is resolved | `loadDictionary(lang)` imports the JSON; `ready` goes false then true | Works. While loading, `t()` returns fallbacks, so English flashes briefly |
| 6. Components re-render | Via context | Works for consumers; everything else keeps its literal English |
| 7. Dynamic data and messages | API error text, toasts, table data | **Breaks.** API messages are English (F7); toasts are literals (F1); dates use fixed English locales (F8) |
| 8. Direction and layout | Provider sets `<html dir="rtl">`, `body.rtl`, CSS variables | Works for the frame. Page content mostly uses fixed left/right classes (F10) |
| 9. Navigating to another route | Store is global and client-side | Language is kept |
| 10. Refreshing | Server renders `<html lang="en">` with no `dir`; the store rehydrates on the client and then flips to Arabic | Language is kept, but **English and left-to-right paint first**, then switch (F9) |

So the chain is sound from step 1 to step 3 and at steps 9 and 10. It breaks at step 4: the language reaches
the provider, but most of the interface is not listening.

## 3. Root causes

Each finding lists concrete evidence. Counts come from `scripts/l10n-audit.mjs`.

### F1 — Most pages contain hardcoded English and never call the translator (the main cause)

- 231 of 309 routes have zero `t(...)` calls in the page or any component it renders.
- 439 component files contain visible text and import no translation hook at all.
- Examples:
  - `src/app/students/admit/page.tsx` — 41 hardcoded strings, 0 translated.
  - `src/app/students/enroll/page.tsx` — 136 hardcoded strings, 0 translated.
  - `src/components/students/AddContactModal.tsx:83` — `toast.error('Student and phone number are required')`.
  - `src/app/students/list/page.tsx:2139` — row-action labels such as `{ label: 'Fees ledger', ... }`,
    `{ label: 'Soft delete', ... }` written as literals inside an otherwise partly translated page.
- By kind, across all routes: text between tags is the largest group, followed by labels in configuration
  objects (table columns, menu actions), then placeholder/title attributes, then about 520 toast and alert
  messages.

### F2 — Two dead translation mechanisms silently pin a language

**`@/lib/i18n` (29 components, 175 calls).** `src/lib/i18n.ts` exports a `t(key, fallback)` that reads
`window.__I18N__`. **Nothing in the codebase ever assigns `window.__I18N__`**, so this function always returns
its fallback argument, whatever language is selected.

- 162 of those calls pass an **English** fallback → always English, even in Arabic. Example:
  `src/components/finance/FeePaymentsManager.tsx` (15 calls), `finance/LedgerViewer.tsx` (13),
  `terms/TermReports.tsx` (12).
- 13 calls pass an **Arabic** fallback → always Arabic, **even when the interface is set to English.** This is
  an existing English-mode defect: `src/components/academics/ClassesManager.tsx:42`
  `t('academics.classes','الفصول الدراسية')` and 6 more in that file, plus 6 in `ClassSubjectsManager.tsx`,
  both rendered by `/academics`.
- Affected routes: `/academics`, `/academics/allocations`, `/academics/exams`, `/academics/results`,
  `/academics/subjects`, `/documents`, `/events`, `/terms/[id]`, `/terms/list`, and the finance and payroll
  manager components.

**`next-i18next` (1 component).** `src/components/academics/ClassResultsManager.tsx:5` imports
`useTranslation` from `next-i18next`. No i18next instance is initialised anywhere and there is no
`next-i18next.config`. The three packages `i18next`, `next-i18next` and `react-i18next` are installed but
unused apart from this import.

**`src/lib/i18nServer.ts`** (`loadDictionary`, `tServer`) is imported by nothing. It also assumes a flat
dictionary, while the real dictionaries are nested, so it could not work as written.

### F3 — The dictionary is large but mostly disconnected from the pages

- English: 2,027 entries. Arabic: 2,050. Code references 808 distinct keys.
- **1,303 English entries are not referenced by any code** (largest groups: `nav` 136, `landing` 122,
  `common` 112, `drce` 88). Some are reached through computed keys (`status.*`, `financeDash.types.*`), which
  the script accounts for; most are leftovers.
- 38 English entries have no Arabic (`nav.departments.*`, `nav.analytics.*`, and the marketing landing page).
- 61 Arabic entries have no English counterpart (mostly old `nav.*` keys).
- No entry has mismatched `{{placeholders}}` between the two languages.
- **40 top-level entries are malformed.** 20 are a single key containing a dot (for example `"general.title"`,
  `"general.events"`), written for the flat lookup of the dead helper in F2; the working provider splits keys on
  dots, so `t('general.title')` looks for `general` → `title` and never finds them. Another 20 have keys with
  spaces (`"total classes"`, `"fully paid learners"`).
- Key style is mixed: 741 leaf names are camelCase and 224 are snake_case, sometimes inside the same group
  (`students.arabicNameMissing` next to `students.all_classes`).

This is why "the dictionary is 98% complete" and "most pages are English" are both true.

### F4 — English fallbacks hide missing Arabic

`t('some.key', 'English text')` returns the English text when the key is missing. **90 keys used in code exist
in neither dictionary**, so those calls render English in Arabic mode while the code looks translated.

- Example: `src/app/attendance/time-health/page.tsx:140` uses
  `t('attendanceIntel.timeHealth.historicalExpectation', 'Historical expectation')`; that key is in neither
  file. The static measurement rates this route "mostly wired", which shows why a route cannot be called
  translated without looking at it in a browser.
- The provider warns about missing keys only in development, and nothing fails a build or a test.

### F5 — The menus use a second lookup table that has drifted

Sidebar labels written as literals are translated through `LABEL_AR` in `navigationConfig.tsx`, not through
the dictionary. Of 140 literal labels, **17 have no `LABEL_AR` entry** and stay English in Arabic mode:

Lesson Attendance, Shifts, Health Center, Recovery Center, Founder Independence, Time Health, Trends,
Attendance Profiles, Event Explorer, Gate & Movement, Devices & Biometrics, Device Intelligence, Identity
Matching, Identity Intelligence, SMS Outbox, Buy SMS, About DRAIS.

Only the Students section uses dictionary keys (`t('nav.students.admit', 'Admit Student')`). So menu
translations live in two places with two formats.

### F6 — Server-rendered pages cannot reach the client translator

14 pages are Server Components; 7 of them contain visible text (`/academics`, `/documents`, `/terms/list`,
`/workplans`, `/verify/[token]`, `/print-snapshot/[type]/[snapshotId]`, `/print-transcript/[studentId]`).
`useI18n()` is a client hook and cannot be called there. The `lang` cookie that the store already writes is
the available route for these, but no working server helper exists (F2).

### F7 — API messages are English and almost no endpoint knows the language

- 727 of 776 API route files return literal English `error`/`message` text — about 3,550 strings.
- Only 10 API files read the caller's language (`langFromRequest`).
- Many pages show the API's text directly in a toast, so translating the page alone leaves these in English.

### F8 — Dates, numbers and currency ignore the active language

- About 290 `toLocaleString`/`toLocaleDateString` calls on routes; none pass the active language.
- 19 calls hardcode an English locale, for example `src/app/students/list/page.tsx:2059`
  `toLocaleDateString('en-GB', ...)`.
- There is no shared formatting helper, and no decision recorded about whether Arabic mode should show
  Arabic-Indic digits (٠١٢٣) or Western digits (0123). That decision is needed before Phase 1 (section 6).

### F9 — Persistence is per browser, and the first paint is always English

- The language lives in `localStorage` and a cookie. It is not stored on the user record, so a user who picks
  Arabic on one device gets the school default on another. This is a limitation, not a bug in the switch.
- `src/app/layout.tsx:166` renders `<html lang="en">` with no `dir`. The inline anti-flicker script in the
  same file restores the saved **theme** before first paint but not the saved **language or direction**, so an
  Arabic user sees English, left-to-right, for a moment on every full page load.

### F10 — Right-to-left is on globally, but page content uses fixed sides

- `I18nProvider` sets `dir="rtl"` on `<html>` and `globals.css` has RTL helpers (`.rtl-flip`,
  `[data-no-mirror]`, `rtl:space-x-reverse`).
- Across routes: **1,894** fixed-side utility classes (`ml-`, `pr-`, `left-`, `text-left`, …) against **16**
  direction-aware ones (`ms-`, `pe-`, `rtl:`). 82 `space-x-*` usages, 10 reversed for RTL.
- Flex and grid layouts mirror correctly on their own, so much of this may look right; margins, absolute
  positioning, icon gaps and directional icons are the likely defects. This needs a browser check per route.
- `globals.css` sets a Latin system font stack with no Arabic face named, so Arabic text falls back to
  whatever the device provides.

### F11 — Two providers are nested

`src/app/layout.tsx:40` wraps the app in `I18nProvider`, and `src/components/layout/AppShell.tsx:39` wraps
it again. Both read the same store, so they agree, but the dictionary is loaded twice and components bind to
the inner one. Harmless today; worth collapsing to one when the foundation is touched.

### F12 — No browser-level test tooling exists

`package.json` has unit tests run with `tsx --test` (`src/lib/**/__tests__`), `eslint`, and `tsc`. There is no
Playwright, Cypress or component-test setup, and no existing test renders a page. The phases that follow
require looking at rendered pages, so either a browser-test dependency is added (it needs justification and
approval) or verification is manual and recorded by hand.

## 4. What should not be translated

Confirmed from the code, so the later phases treat these correctly:

- **Names of people** — learner, staff and guardian names. Separate Arabic name fields and a reviewed
  transliteration workflow already exist (`/settings/localization`, `src/lib/i18n/translit.ts`). Never
  auto-translate.
- **School-configured content** — class, stream, subject, department, term, programme and fee names. Arabic
  columns (`name_ar` and similar) exist for several; the rule in `src/lib/i18n/README.md` is that Arabic is
  additive and falls back to the stored English value.
- **Identifiers and stored values** — status codes, roles, permission names, enum values, API field names.
  The interface shows a translated label; the stored value stays as it is.
- **Religious and Quranic content** — Tahfiz portions, surah names, theology terminology. These need
  human-approved wording, not generated translation.
- **Logs, device payloads, technical diagnostics** — for example the relay and device strings on
  `/students/list` ("CMD_STARTENROLL via relay agent on LAN").

## 5. Scope questions that need an owner's decision

These change the size of the work, so they are raised now instead of assumed:

1. **Control Center (`/control/*`, 64 routes, about 4,500 strings).** This is Xhenvolt's own operator console,
   not something school staff see. Recommendation: leave it English and out of scope.
2. **Help guides (`/help/*`, 14 routes, about 1,000 strings).** Long-form instructional prose, not interface
   labels. Translating it is a writing job that needs a reviewer. Recommendation: translate the page frame
   now, schedule the articles separately.
3. **Parent portal (`/portal/*`, `/parent/*`, 10 routes).** Used by parents, so arguably the highest-value
   Arabic surface, but it sits outside the staff sidebar. Recommendation: include it, after Students.
4. **Digits and dates in Arabic mode.** Western digits (0123) or Arabic-Indic (٠١٢٣)? Gregorian dates only, or
   Hijri as well? The report pipeline already supports Arabic numerals as a per-report choice.
5. **Who approves Arabic wording.** Interface terms for marks, fees and attendance should be consistent and
   reviewed by an Arabic-speaking educator before they spread across 300 routes.

## 6. Proposed implementation order

Detailed in `ARABIC_TRANSLATION_ROADMAP.md`. In short: fix the foundation first (remove the two dead
mechanisms, one menu source, a completeness check that fails the build, formatting helpers, first-paint
language), then Students route by route, then the remaining modules in sidebar order, with API messages and
database-backed content handled as their own phases.
