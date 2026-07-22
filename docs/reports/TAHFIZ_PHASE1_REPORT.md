# Tahfiz Phase 1 — De-risk & Consolidate (COMPLETE)

Founder-independent goal for this phase: an admin can mark a learner as a Tahfiz participant, suspend/withdraw them, and see real counts — **from the UI, with no data-loss landmines**.

## Files changed
- **Added** `sql/tahfiz_enrollments.sql` — participation model.
- **Added** `src/app/api/tahfiz/enrollments/route.ts` — GET (list + `?summary=1`), POST (enroll existing student, idempotent reactivate).
- **Added** `src/app/api/tahfiz/enrollments/[id]/route.ts` — PATCH (suspend/reactivate/withdraw/complete), DELETE (soft-delete only).
- **Added** `src/app/tahfiz/participants/page.tsx` — canonical Tahfiz learner UI (summary cards, participant table, add-participant student picker, status actions).
- **Replaced** `src/app/api/tahfiz/learners/route.ts` — all handlers now return **410 Gone** (the dangerous code is gone).
- **Replaced** `src/app/tahfiz/learners/page.tsx` — redirects to `/tahfiz/participants`.
- **Edited** `src/app/tahfiz/page.tsx` — overview stats now show **real participant counts**.
- **Edited** `src/lib/navigationConfig.tsx` — nav "Learners" → **"Participants"** → `/tahfiz/participants`.

## Tables changed
- **New:** `tahfiz_enrollments` (school_id, student_id, **track** [`academic_plus_tahfiz`|`tahfiz_only`], **program**, **status** [active/suspended/withdrawn/completed], joined/left dates, notes, created_by, full soft-delete columns; `UNIQUE(school_id, student_id)`). Applied to TiDB Cloud.
- No other tables modified. **No data deleted.**

## UI changed
- New **Tahfiz → Participants** page: real list, summary cards (Total / Active / Suspended / Academic+Tahfiz / Tahfiz-only), "Add participant" (search existing students), and per-row Suspend / Reactivate / Complete / Withdraw / Remove.
- Overview dashboard cards now reflect live participant counts.
- Old `/tahfiz/learners` page auto-redirects to the canonical page.

## Old behavior → New behavior
| | Old | New |
|---|---|---|
| Remove a Tahfiz learner | `DELETE FROM students …` — **hard-deleted the canonical student** | Soft-delete the **enrollment** only; the student record is untouched |
| "Who is in Tahfiz?" | fragile `class.name LIKE '%Tahfiz%'` / `notes LIKE '%tahfiz%'` | explicit `tahfiz_enrollments` rows (first-class participation) |
| Learner surfaces | duplicate `/tahfiz/learners` **and** `/tahfiz/students` | one canonical `/tahfiz/participants`; `/tahfiz/learners` API → 410, page → redirect |
| Learner models | only academic-class-bound | **academic-only / academic+Tahfiz / Tahfiz-only / hybrid** via `track` + presence of a row |
| Dashboard counts | hardcoded `0` | live counts from `tahfiz_enrollments` |

## Scoring source-of-truth decision (Phase 1 item #3 — documented, nothing deleted)
The three overlapping models are resolved by **grain**, not by dropping tables:
- **Canonical transactional truth = `tahfiz_records`** (one row per presentation). Phase 5 extends it with lesson type (sabaq/sabqī/manzil) + mistakes + quality.
- **Aggregates are derived** from records (term/period) — not hand-entered.
- **Deprecated but preserved** (all currently empty): `tahfiz_evaluations` (4-metric), `tahfiz_seven_metrics`, and manual `tahfiz_results` entry. They are **not dropped**; they will be migrated/retired in Phase 5. No blind deletes.

## Tests run (live, dev server + TiDB)
```
enroll (tahfiz_only)        -> 200  {success:true}
list                        -> participant present
summary?summary=1           -> {total:1, active:1, tahfiz_only:1}
PATCH suspend               -> 200  status=suspended
DELETE (soft remove)        -> 200  removed
student 1622004 preserved   -> YES ✓ (not deleted)
deprecated /tahfiz/learners -> 410  (dangerous route dead)
tahfiz_enrollments after cleanup -> 0 rows (no orphans)
```
Lint clean on all changed files.

## TiDB Cloud verification
`tahfiz_enrollments` created on the shared TiDB (gateway01) with the full column set + `UNIQUE(school_id, student_id)` + status index. Enroll/suspend/soft-delete round-trip verified against it.

## Remaining risks
- `/tahfiz/students` page still exists (academic-class lens) — harmless but a secondary surface to reconcile/retire in a later phase.
- `tahfiz_attendance` silo, the empty scoring tables, and Quran-naïve books are **untouched** (Phases 2–6).
- Writes are gated by `tahfiz.records.manage`; a dedicated `tahfiz.enroll` permission could be added later for finer control.

## Next recommended phase
**Phase 2 — Book Structure Engine:** make `/tahfiz/books` real with structure types (Quran / Yassarnā / Shāṭibiyyah / generic) and seed Quran reference data (114 sūrah, ayah counts, juzʾ/ḥizb/page mapping) so portions can be selected by Surah/Juz/Page/Ayah from the UI — the foundation the daily register (Phase 4) and engine (Phase 5) build on.
