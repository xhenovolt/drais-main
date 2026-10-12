# DRAIS Localization — Verification Log

One entry per completed step or route. Each entry says what changed, which checks ran, and — separately —
what was and was not looked at in a real browser. "Tests pass" is never written as "verified in Arabic".

---

## 2026-10-12 — Phase 1: translation foundation

**State: implemented and automatically checked. Not yet verified in a browser by a signed-in user.**

### What changed

| Roadmap step | Done | Detail |
|---|---|---|
| 1.1 Completeness gate | Yes | `npm run test:i18n` (also part of `npm test`): 30 checks in `src/lib/i18n/__tests__/`. Fails on a key used in code but missing from a dictionary, any difference in keys between `en.json` and `ar.json`, mismatched `{{placeholders}}`, dotted or duplicated keys, an Arabic entry that is still English, a menu label with no Arabic, or an import of a removed helper. |
| 1.2 Keys used but missing | Yes | 74 entries added to both dictionaries (time-health, balance sheet, income statement, server-error page, a few others). Before this, the server-error page showed raw key names such as `errors.server_error` in both languages. |
| 1.3 Dead helpers removed | Yes | 30 components and 213 calls moved from `@/lib/i18n` / `next-i18next` to `useI18n()`. `src/lib/i18n.ts` deleted. The 13 strings that showed Arabic while the interface was set to English (`/academics`: classes and class-subjects managers) now follow the selected language. |
| 1.4 Malformed dictionary keys | Mostly | 20 English and 165 Arabic top-level keys written as one dotted property were nested into proper groups. One duplicated key was removed. The 20 old keys containing spaces (`"total classes"` …) are unreferenced and left in place behind an allow-list; no new one can be added. |
| 1.5 Menu labels | Partly | The 17 missing Arabic labels were added and a test now fails if a menu label has no Arabic. The `LABEL_AR` table was **not** moved into the dictionary — it is still a second place menu text lives. |
| 1.6 Plurals | Yes | `t()` accepts plural entries (`{ one, other }`, and Arabic's six forms) chosen by `count` with `Intl.PluralRules`. No existing entry uses it yet. |
| 1.7 Formatting helpers | Yes | `formatDate`, `formatNumber`, `formatMoney`, `formatPercent` in `src/lib/i18n/format.ts`, also returned by `useI18n()`. Arabic keeps Western digits and Gregorian dates. **No existing page has been switched to them yet** — that happens route by route. |
| 1.8 First paint | Yes | The inline script in `src/app/layout.tsx` now sets `lang` and `dir` from the saved language before the page paints. |
| 1.9 One provider | Yes | The nested `I18nProvider` in `AppShell.tsx` was removed; the root layout's provider serves the whole app. |
| 1.10 Server-side `t` | Yes | `getServerI18n()` in `src/lib/i18nServer.ts`, same lookup core as the client. **No server page uses it yet.** |
| 1.11 Arabic font | Yes | Amiri (owner's choice), self-hosted in `public/fonts/amiri`, applied to Arabic script only at 112% size. See below. |
| 1.12 Shared components | Started | `components/ui/Pagination.tsx` translated (7 routes use it). Other shared components are done with the first route that needs them. |

Both dictionaries now have exactly **2,203 entries** each.

### Arabic wording — pending review

Every Arabic string added in this phase was written during implementation and has **not** been reviewed by an
Arabic-speaking educator: the 74 keys in step 1.2 (notably the accounting terms on the balance sheet and
income statement), 17 menu labels, 38 marketing-page entries, the class-results entry screen, and the
pagination sentence. Treat them as drafts.

### Automated checks run

| Check | Result |
|---|---|
| `npm run test:i18n` | 30 pass, 0 fail |
| `npm test` (all suites) | All pass except one pre-existing failure in `src/lib/sentinel/__tests__/chaos.test.mjs` (school-name wording in a generated message), which does not touch localization |
| Syntax check of every changed source file (esbuild) | Pass |
| ESLint on changed files | No new findings (one pre-existing `<a>` link warning in `SubjectsManager.tsx`) |
| Every migrated component calls `t` only inside the component that owns the hook | 30 files checked, 0 problems |

### Browser checks

| Check | Result |
|---|---|
| Amiri rendering | **Done.** A DRAIS-style Arabic screen (title, button, search field, chips, table, 11px captions, body text) was rendered in headless Chrome three ways: current system font, Amiri at the same size, Amiri enlarged. At the same pixel size Amiri's 11–14px labels were visibly smaller and lighter than the current font; at 112% they match its apparent size, with Latin text, digits and codes unchanged. Rows containing Arabic are slightly taller. |
| Signed-in pages in Arabic and English | **Not done.** No test account was available to this session. |
| Phase 1 exit test (English → Arabic → English on five pages; refresh keeps the language with no English flash; menus fully Arabic; no console errors) | **Not done — needs a signed-in person.** |

### What to look at first when checking by hand

1. Refresh any page while in Arabic: it should open right-to-left immediately, with no left-to-right flash.
2. Sidebar in Arabic: Shifts, Time Health, Trends, SMS Outbox, Buy SMS and the other 12 labels are now Arabic.
3. `/academics` in **English**: the classes and class-subjects panels no longer show Arabic headings.
4. `/academics`, `/terms/list`, a term's detail page, and the finance and payroll manager panels in Arabic:
   headings, placeholders and buttons that used the old helper now change language.
5. `/finance/reports/balance-sheet`, `/finance/reports/income-statement`, `/attendance/time-health` in Arabic.
6. Any list with page numbers (students contacts, requirements, staff list, learner fees): the "Showing 1 to
   25 of 187 results" line and the previous/next arrows.
7. Arabic text anywhere now appears in Amiri.

### Known limitations after Phase 1

- 228 of 309 routes still make no translation call at all (231 before this phase); Phase 1 did not translate
  page content.
- The `i18next`, `next-i18next` and `react-i18next` packages are no longer imported but are still listed in
  `package.json`; removing them changes the lockfile and is left for a separate commit.
- The menu label table (`LABEL_AR`) is still separate from the dictionary.
