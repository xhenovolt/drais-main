# DRAIS Arabic Localization — Phase 0 Audit

_Generated as the foundation for the phased localization epic. Reflects the
codebase at the time of writing — verify before acting on any specific file._

## 1. Current i18n architecture

- **Provider:** [src/components/i18n/I18nProvider.tsx](../../src/components/i18n/I18nProvider.tsx) exposes `useI18n() → { lang, t, dir, setLang, ready, loading, error }`.
- **Dictionaries:** [src/locales/en.json](../../src/locales/en.json) (1656 keys) and [src/locales/ar.json](../../src/locales/ar.json) (1708 keys). Loaded lazily by `loadDictionary`.
- **`t(key, varsOrFallback?, fallback?)`** — dotted-path lookup, `{{var}}` interpolation, **falls back to English / the literal fallback string** so raw key paths never leak.
- **Language source:** `useThemeStore.language` (persisted). School `default_locale` is hydrated once per mount from `/api/school-config` _only if the user never explicitly chose_ (`languageExplicit`).
- **RTL:** already wired globally in the provider — sets `document.documentElement.dir = 'rtl'`, toggles `body.rtl/.ltr`, and sets `--text-align-start/-end`, `--margin/padding-start/-end` CSS vars. So `dir`/RTL is **not** the core gap.
- **Server side:** [src/lib/i18n.ts](../../src/lib/i18n.ts), [src/lib/i18nServer.ts](../../src/lib/i18nServer.ts).

**Conclusion:** the foundation is solid. The dictionaries are large and ~98% at parity (38 `ar` gaps, mostly the marketing landing page). The real problem is **components that don't call `t()`**, not a missing dictionary.

## 2. Navbar / topbar / sidebar — root cause (FIXED in Batch 1)

- App chrome is [components/layout/AppShell.tsx](../../src/components/layout/AppShell.tsx) → `layout/Navbar` (topbar) + `layout/Sidebar` + `layout/MobileDrawer`.
- Sidebar & MobileDrawer call `getNavigationItems(t, lang)`, which ends with `translateMenuTree(items, lang)` — hardcoded labels are translated via a **`LABEL_AR` map**, not `t()`.
- **Root cause:** ~42 hardcoded `label:` strings in [navigationConfig.tsx](../../src/lib/navigationConfig.tsx) were **absent from `LABEL_AR`**, so they fell through to English in Arabic mode. The Navbar profile menu also had 2 hardcoded strings ("Help Center", "Restart Guided Tour").
- **Fix:** added all 42 missing `LABEL_AR` entries (coverage now 0 missing) and routed the 2 Navbar strings through `t('navigation.helpCenter' / '.restartTour')`.

## 3. Route translation coverage

- **54 / 201** `page.tsx` files reference `useI18n` (~27%). The dashboard and a handful of others are translated; **~73% of pages still contain hardcoded English** (Phase 10 scope).
- Fully translated: dashboard, parts of academics/reports chrome.
- Partially: students/attendance/finance (mixed `t()` + literals).
- Not translated: most settings sub-pages, Tahfiz, parent portal, inventory, payroll detail pages.

## 4. Components bypassing the translation system

Common offenders to sweep in later batches: table headers, modal titles, toast messages (`toast.success('...')`), empty-state text, validation messages, button labels written as JSX literals. (Audit per-route in Phase 10.)

## 5. Database — existing Arabic vs gaps

**Already have Arabic columns:**
- `schools`: `arabic_name`, `arabic_address`, `arabic_motto`, `arabic_phone`, `arabic_center_no`, `arabic_registration_no`, `arabic_po_box`.
- `subjects`: `subject_name_ar` (already consumed by the snapshot generator/report pipeline).

**Missing Arabic (Phase 5 migration candidates):**
- `people` / `students`: `first_name_ar`, `middle_name_ar`, `last_name_ar`, `full_name_ar` ← **the big one for ALBAYAN learner names**.
- `staff`: display name Arabic (often via `people`).
- `classes.name_ar`, `streams.name_ar`, `departments.name_ar`.
- `fee_items.name_ar`, `academic_programs.name_ar` (note: `programs` already has `display_name` from the founder-independence work), `terms.name_ar`, `result_types.name_ar`.
- Flexible/custom records → consider an `entity_translations` table or `translations_json` column rather than per-column.

## 6. APIs needing localized fields

Students list/profile, staff, classes, subjects, streams, departments, finance fee items, reports, DRCE data context, attendance logs, parent portal, Tahfiz. Pattern: when `lang=ar`, return `display_name = name_ar ?? name`, and include both `name` + `name_ar` where the consumer needs them. Must not break existing English consumers.

## 7. RTL layout gaps

Global `dir=rtl` works. Remaining gaps are per-component: a few use `space-x-*` without `rtl:space-x-reverse`, some absolute-positioned dropdowns hardcode `right-0`/`left-0` (the Navbar already branches on `isRTL`). Arabic web font loading for report/print output should be verified (DRCE print uses its own CSS).

## 8. Naming/data-sensitivity note (approval gate)

Per the epic, **AI-generated Arabic learner-name transliterations must be previewed and approved before any bulk DB apply** (Phase 4 → Phase 5). No learner name data will be written without explicit sign-off. English data is never overwritten — all Arabic is additive (`*_ar` columns / translation rows).

## 9. Recommended batch order (status)

1. **Batch 1 — audit + navbar/topbar/sidebar dictionary fix** ✅ done
2. **Batch 2 — DB Arabic fields (migration 029) + API `display_name` localization** ✅ done
3. **Batch 3 — students list/profile Arabic names + RTL table** ✅ done
4. **Batch 4 — bulk Arabic name import/export + AI-draft preview/approval gate** ✅ done
   - `/settings/localization`: export (all/missing), AI draft → review/edit → **Apply** (nothing is written until Apply), CSV/Excel import with a dry-run preview.
   - APIs: `GET/POST /api/students/arabic-names` (export + draft + dry_run/apply, never overwrites without `overwrite:true`), `PATCH /api/students/[id]/arabic-name`.
   - Transliteration draft engine: `src/lib/i18n/translit.ts` (dictionary of common Islamic names + `Abd al-` compound handling + letter fallback; confidence + needsReview).
5. **Batch 5 — DRCE/reports Arabic names + bindings + RTL print** ✅ done
   - Snapshot generation now captures Arabic learner name (`nameAr`) + class/stream Arabic; `RawResultRow`/`SnapshotStudent`/`SnapshotClass` extended (optional — old snapshots fall back to English).
   - DRCE data context: in Arabic reports `student.fullName`/`className`/`streamName` resolve to Arabic (English fallback) so existing templates flip automatically; explicit `student.fullNameAr`/`fullNameEn`/`classNameAr` exposed + added to the binding picker. Emergency render path localized too.
   - RTL print already wired in both print paths (numerals==='arabic'). Determinism preserved (hash-invariant tests pass).
6. Batch 6 — full-route localization sweep + `/settings/localization` coverage dashboard
