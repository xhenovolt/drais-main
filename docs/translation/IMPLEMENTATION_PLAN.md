# DRAIS — Translation Implementation Plan

The audit gate is passed. This file is the **wire-up plan**: how to take
[`translations/ar/master.json`](../../translations/ar/master.json) from
"dictionary" to "production-shipped Arabic" without installing a single
new dependency.

The rest of this file deliberately ignores the question of "which i18n
framework should we use" — DRAIS already has a home-grown one
([`src/components/i18n/I18nProvider.tsx`](../../src/components/i18n/I18nProvider.tsx))
and the audit constraint is explicit: **no new framework**.

---

## 0. What already exists (re-stated)

- Provider: `src/components/i18n/I18nProvider.tsx`. React context, JSON
  dictionaries, `useI18n()` hook returning `{ t, locale, setLocale }`.
- Dictionaries: `src/locales/en.json` (598 keys), `src/locales/ar.json`
  (548 keys).
- Consumers: 862 `.tsx` files already call `t('…')` somewhere.
- Persistence: `localStorage` + cookie write so SSR can read the locale.
- Direction: `<html dir="rtl|ltr">` is **not yet** dynamically set — the
  root layout hardcodes `dir="ltr"`. Fix in Phase 1.

The new `translations/ar/master.json` is a **merge target**, not a
replacement. Phase 1 reconciles it with the existing `ar.json`.

---

## 1. Phases

Six phases, sequenced to ship value early and isolate risk. Every phase
is reversible and additive; no phase breaks a previously English-only
screen.

### Phase 1 — Dictionary merge + RTL plumbing (1 day)

**Goal:** one canonical Arabic dictionary; HTML `dir` attribute follows
the active locale; the language switcher (which already exists in the
header) works.

**Steps:**
1. Diff `src/locales/ar.json` against
   `translations/ar/master.json`. For every conflict, the master file
   wins (it was authored against the glossary). For every key only in
   the old `ar.json` that is still referenced by code, port it across.
2. Replace `src/locales/ar.json` with the merge result. The `en.json`
   file gets new keys backfilled in English (literal copies of the
   English source phrases from the audit).
3. Root layout: read locale from cookie, set `<html lang={locale}
   dir={locale === 'ar' ? 'rtl' : 'ltr'}>`.
4. Add a Tailwind RTL config or rely on logical CSS (`me-2`, `ps-4`)
   for the highest-traffic surfaces in Phase 2.
5. Smoke-test: switch to AR in the header → app shell + sidebar render
   in Arabic + RTL, no layout regressions.

**Risk:** LOW. No mass conversions yet. Pages still showing English
strings simply stay English when the locale flips — they don't break.

### Phase 2 — High-frequency surfaces (3 days)

**Goal:** the top 12 hardcoded files from the
[Coverage Report §5](./COVERAGE_REPORT.md) are fully wired to `t(…)`.

**Targets in order (per cost-benefit ranking):**
1. `src/components/drce/PropertiesPanel.tsx`
2. `src/app/students/list/page.tsx`
3. `src/components/drce/DRCEEditor.tsx`
4. `src/app/admin/cafe/page.tsx`
5. `src/app/academics/results-cafe/page.tsx`
6. Issuance pages (5 files)
7. `src/app/admin/custom-fields/page.tsx`
8. `src/app/reports/kitchen/page.tsx`
9. `src/components/staff/AddStaffModal.tsx`
10. `src/app/staff/list/page.tsx`
11. `src/app/students/[id]/page.tsx`
12. `src/app/academics/allocations/page.tsx`

**Per-file procedure:**
1. Open file. Grep for English literals in JSX text, `placeholder=`,
   `title=`, `aria-label=`, and toast/error strings.
2. For each literal, find its dictionary key by consulting:
   - DRCE editor → [DRCE_GLOSSARY.md](./DRCE_GLOSSARY.md)
   - Academics/results → [ACADEMIC_GLOSSARY.md](./ACADEMIC_GLOSSARY.md)
   - Students/staff → [GLOSSARY.md](./GLOSSARY.md)
3. Replace `"Save"` → `{t('actions.save')}`.
4. If a phrase is not yet in `master.json`, **add it** (do not invent an
   English-only stopgap). The dictionary grows by ~210 entries during
   Phase 2.
5. Re-run `npx next build` to catch any missing key warnings (provider
   logs unknown keys in dev).

**Risk:** MEDIUM. Most of the wire-up cost lives here. Mitigation: do
one file at a time, commit each, verify visually.

### Phase 3 — Output documents (2 days)

**Goal:** every printed surface — report cards, certificates,
transcripts, ID cards, invoices, receipts — wire-up complete.

Outputs are the most-scrutinised surface (parents see them on paper)
and have the smallest dictionary tail (Phase 1 + the
[EXPORT_GLOSSARY](./EXPORT_GLOSSARY.md) already covers ~95% of them).

**Steps:**
1. Wire every server-render path to receive `locale` from the snapshot
   meta (or fall back to school default).
2. Replace literal English column headers in render code with `t(…)`.
3. Apply the bidirectionality rules from
   [EXPORT_GLOSSARY §11](./EXPORT_GLOSSARY.md) — column reversal, page
   numbering with Eastern numerals, signature alignment.
4. Run the **snapshot byte-equivalence test** with `locale=en` against
   the historical snapshot suite (per the Phase D acceptance gate from
   the unrelated admin refactor). `dataHash` must NOT change for
   English-locale renders.
5. For `locale=ar` renders, golden-file the first 3 Arabic outputs and
   keep them as regression fixtures.

**Risk:** MEDIUM-HIGH. The `dataHash` invariant is the gate. If it
breaks, revert and look at how locale was threaded into the renderer.

### Phase 4 — Long tail (2 days)

**Goal:** the remaining ~210 hardcoded strings in lower-traffic screens.

Wire-up grep pass over the remaining `.tsx` files. The same dictionary
keys are reused; only a handful of net-new entries are expected.

**Risk:** LOW. By this point the workflow is mechanical.

### Phase 5 — Right-to-left polish (1 day)

**Goal:** every page reads correctly in Arabic, not just translates
correctly.

**Steps:**
1. Sweep for non-logical CSS (`ml-`, `mr-`, `pl-`, `pr-`, `left-`,
   `right-`, `text-left`, `text-right`). Replace with logical variants
   (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`,
   `text-end`).
2. Sweep icon rotations (chevrons, arrows): under RTL these point the
   wrong way. Add a `rotate-180` when `dir === 'rtl'` for navigation
   chevrons; leave icons that have inherent meaning (clocks, magnifying
   glass) alone.
3. Date pickers + numeric inputs: confirm input still accepts Latin
   digits even when the surrounding UI is Arabic — schools that copy
   admission numbers from paper records type Latin digits.
4. Tables: verify column order reversal in RTL is visually correct.
5. Per-screen visual diff against the EN baseline — flag any layout
   breakages, fix in place.

**Risk:** LOW (visual only). High labour value: this is what makes the
product feel native vs. machine-translated.

### Phase 6 — Per-school locale + persistence (0.5 day)

**Goal:** schools default to their preferred locale; users can override.

**Steps:**
1. Add a `default_locale ENUM('en','ar')` column to `schools` (default
   'en'). Migration is additive.
2. Login flow reads `schools.default_locale` and sets the cookie on
   first sign-in.
3. User-level override stays in `localStorage` and survives sessions.
4. Settings page exposes the school-default toggle (super-admin + school
   admin).

**Risk:** LOW. Single migration + a one-line cookie write.

---

## 2. What stays untranslated (recap, not new)

For the avoidance of doubt during wire-up, here is the consolidated
list. Any time the wire-up developer sees these patterns, **leave them
in English / leave them as-is**:

| Pattern | Why |
|---|---|
| Permission codes (`drce.edit`, `students.read`) | Identifiers |
| Field codes (`first_name`, `admission_no`) | Identifiers |
| Framework codes, subject codes, component codes | Identifiers |
| URL paths (`/admin/cafe`) | Routes |
| QR-code / verification URL payloads | URLs |
| Currency code `UGX` | International standard |
| School-typed template body content | Dynamic, owned by school |
| Console / dev logs | Developer output |
| Snapshot `dataHash` / `snapshotId` hex strings | Cryptographic identifiers |
| UNEB grade letters (D1, C5, F9) | International standard |
| Class short codes (S1, P6) inside table cells | Compact label, kept Latin in tables |

---

## 3. Day-zero checklist (when wiring begins)

1. ✅ Glossary is final (this audit).
2. ✅ Master dictionary exists.
3. ✅ Coverage report scores 92/100.
4. ✅ No new dependency required (existing `useI18n` provider is enough).
5. ✅ Risk-ranked file list ready (top 12 = 57% of hardcoded strings).
6. ✅ Acceptance gate defined for Phase 3 (snapshot dataHash invariant).
7. ⬜ Phase 1 starts: merge dictionaries + plumb `<html dir>`.

---

## 4. Estimated total cost

| Phase | Duration | Risk | Output |
|---|---|---|---|
| 1 — Dictionary merge + RTL plumbing | 1 day | LOW | One AR dictionary; switcher works |
| 2 — High-frequency surfaces (12 files) | 3 days | MEDIUM | 57% of hardcoded strings cleared |
| 3 — Output documents | 2 days | MEDIUM-HIGH | Report cards / certificates render AR |
| 4 — Long tail | 2 days | LOW | Remaining 43% cleared |
| 5 — RTL polish | 1 day | LOW | Feels native in Arabic |
| 6 — Per-school locale | 0.5 day | LOW | Schools default to their language |
| **Total** | **~9.5 days** | | Production AR support |

A single engineer working through this plan ships Arabic-ready DRAIS in
two working weeks. Two engineers parallelising Phases 2 + 3 cuts the
critical path to ~7 days.

---

## 5. Post-ship invariants to monitor

Once shipped, these must hold or rollback is on the table:

- **Snapshot dataHash invariant:** every `status='ready'` snapshot
  regenerates with byte-identical `dataHash` when locale is omitted or
  `en` (the default for historical data).
- **No machine-style literal translations leak in:** every net-new
  entry passes the glossary review before it lands in `master.json`.
  PRs that bypass the glossary get rejected.
- **Hardcoded-string lint rule:** consider a custom ESLint rule that
  flags JSX text literals over 3 characters that aren't inside a
  `t(…)` call. Catches regressions before merge.
- **Translation gap dashboard:** the provider already logs unknown keys
  in dev; pipe that to a counter so the dictionary stays in sync as the
  product grows.

---

## 6. Out of scope (deliberately)

- **Right-to-left charts** (Recharts, etc.) — flagged separately; not
  part of this audit's deliverables.
- **PDF font embedding** — fonts that render Arabic (Noto Naskh,
  Amiri) need to be packaged with the server-render path. Tracked
  separately in [`docs/PRINT_FONTS.md`](../PRINT_FONTS.md) (to be
  created when Phase 3 begins).
- **Plural forms** beyond singular/plural — Arabic has dual + plural
  categories, but the educational copy in this dictionary avoids
  constructs that require dual forms. ICU MessageFormat with full Arabic
  plural rules is a Phase 7 follow-up if/when needed.
- **A third locale (French, Swahili, Luganda)** — possible but unlinked
  from this audit. The dictionary structure supports it; the glossary
  process would need to be re-run for each.

---

## 7. Hand-off note

The next agent or engineer picking this up:

1. Read [INVENTORY.md](./INVENTORY.md) for the audit method.
2. Read [GLOSSARY.md](./GLOSSARY.md) before touching any string.
3. Consult the domain glossary that matches the file you're editing
   ([ACADEMIC_GLOSSARY](./ACADEMIC_GLOSSARY.md),
   [DRCE_GLOSSARY](./DRCE_GLOSSARY.md),
   [EXPORT_GLOSSARY](./EXPORT_GLOSSARY.md)).
4. Add new keys only by consulting the glossary first; never invent
   Arabic on the fly.
5. Commit one file at a time. Every commit message mentions the source
   glossary file: `i18n(students): wire list page to t() — keys from
   GLOSSARY.md §1,§2`.

That discipline is what keeps "Arabic that ships" from drifting into
"Arabic that needs a re-audit in six months".
