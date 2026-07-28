# Finance Module Consolidation Plan

**Status: PLAN ONLY. No schema changes, no route removals, no data migration
has been made from this document.** This is the audit-to-plan deliverable
agreed before any finance code changes — the module manages live money data
across every school, currently written by three independent code paths, and
a big-bang rewrite is exactly the kind of failure mode this whole exercise
exists to prevent.

---

## 1. What's actually there (confirmed by direct route/schema inspection)

### 1.1 Three independent "fee item" data models, all feeding one table

| Model | Tables | Class targeting | Fee identity |
|---|---|---|---|
| **V1 (oldest)** | `fee_structures` → `student_fee_items` | Real FK (`class_id`, `section_id`, `term_id`) | **Free text** — `item VARCHAR(120)`, e.g. `'Tuition'` typed literally in `src/lib/fees.ts:48-51` and `src/app/api/finance/sync-fees/route.ts:44-58` |
| **"finance_fee_items"** | `finance_fee_items` (used only by `assignFeesToStudent()` in `FinanceLedger.ts:226+`) | Real FK (`class_id`, `program_id`, `term_id`) | Name string, no eligibility layer |
| **V2 (newest, intended canonical)** | `fee_items` (school-wide catalog) + `fee_eligibility_rules` | `class_ids` as a **JSON array**, plus `level_min/max`, `gender`, `boarding`, `stream_id`, `program_id` | Catalog has a real `id` — but `generateBills()` (`feeRules.ts:388`) still writes the fee's **name as a string** into `student_fee_items.item`, not a `fee_item_id` FK back to its own catalog |

**The core problem, precisely**: `student_fee_items` — the one table every parent balance, every payment, every report reads from — identifies a fee by name text (`item`), not by a foreign key, *even in the "modern" rule-engine path*. Two rows saying `"Tuition"` from two different upstream systems are indistinguishable from two coincidentally-identical strings.

### 1.2 Three independent "assign fees to students" write paths

- `POST /api/finance/assign-fees` → `assignFeesToStudent()` — reads `finance_fee_items`, writes `student_ledger`.
- `POST /api/finance/init-fees` (`src/lib/fees.ts`) and `POST /api/finance/sync-fees` — near-duplicate inline logic, both read/create `fee_structures`, both hardcode fallback names (`'Tuition'`, `'Development'`, `'Registration'`).
- `POST /api/finance/fee-rules/generate` → `generateBills()` — the V2 rule engine.
- `POST /api/students/fee_items` — a fourth, older bulk creator.

None share a code path. A bug fixed in one is not fixed in the others.

### 1.3 Four ledger-shaped tables

- `ledger` — simple single-entry wallet ledger.
- `student_ledger` — per-student debit/credit trail (written by `FinanceLedger.ts`).
- `ledger_accounts` / `ledger_entries` / `ledger_transactions` — a full parallel double-entry system (draft/posted/voided transactions, debit/credit, running balance).
- `finance_payments` — the table the *canonical* payment route (`/api/finance/payments`) and the newer parent portal actually write/read.

### 1.4 Confirmed dead / duplicate surface

- `finance/ledger` (marked `common.archived` in its own nav) vs `finance/ledger-v2`, both linked under the identical i18n label.
- `finance/import` vs `finance/import-fees` — two separate bulk-import UIs.
- `payroll/payments` vs `payroll/salary_payments` — near-identical pages; one calls `/api/finance/wallets` (exists), the other calls `/api/wallets` (**does not exist** — that page is broken today).
- `GET/POST /api/finance/fee_payments` returns HTTP 410 with a comment confirming an earlier partial consolidation attempt — but the underlying `fee_payments` table is **still read** by the older `portal/learners/[studentId]/fees` route.
- `waivers_discounts` vs `learner_fee_adjustments` — same concept (waive/reduce a fee), two schemas, two workflows, no evidence either was retired.
- Two parent-facing fee endpoints on two different portal trees (`/portal/...` reading the deprecated table, `/parent/...` reading the current one) — likely serving two different parent-app implementations that both still exist.

### 1.5 Platform billing — confirmed clean, not part of this problem

`platform_invoices` / `platform_payments` (Control Center billing schools for their DRAIS subscription) share no tables, routes, or code with anything above. No action needed here.

---

## 2. Target architecture (what Phase 4/5 of the brief asked for)

```
Fee Type (catalog: name, category, currency, frequency)
    │
    ▼
Fee Structure / Rule (amount + WHO it applies to: class, stream, section,
                       boarding/day, academic year, term, student category)
    │
    ▼
Student Assignment (materialized, one row per student per fee per term,
                     referencing the Fee Type by FOREIGN KEY, never by name)
    │
    ▼
Payments / Ledger (single source of truth for what's been paid against
                    which assignment)
```

This is close to what `fee_items` + `fee_eligibility_rules` already are — the newest system is the right *shape*. The gap is that its own output (`student_fee_items`) doesn't carry the FK back to it, and it's the third of three systems still live in parallel.

**Recommendation: `fee_items` + `fee_eligibility_rules` is the system to keep and complete, not replace.** `fee_structures`/V1 and `finance_fee_items` should be retired, not merged — merging three incompatible targeting mechanisms (plain FK / JSON array / eligibility rules) into "one" model would just create a fourth. Retire toward the one that already has the right shape.

---

## 3. The one schema change this actually requires

Add `fee_item_id BIGINT NULL REFERENCES fee_items(id)` to `student_fee_items`, populated going forward by `generateBills()` alongside the existing `item` text column (kept for backward-reading compatibility during transition, not removed immediately). This is the single highest-value, lowest-risk change: every future query can join on `fee_item_id` instead of matching on text, without touching a single existing row.

Everything else in this plan is about **stopping new fragmentation** and **draining the old paths**, not a new mega-migration.

---

## 4. Staged plan (each stage independently safe to stop after)

### Stage A — Stop the bleeding (no schema change, low risk)
1. Add `fee_item_id` to `student_fee_items` (additive column, nullable, zero impact on existing rows/queries).
2. Update `generateBills()` to populate it going forward.
3. Redirect `init-fees` and `sync-fees` to call the SAME underlying function (pick one, e.g. `lib/fees.ts`'s implementation) instead of duplicating logic — collapses two maintenance burdens into one without changing behavior.
4. Fix the broken `payroll/salary_payments` page (`/api/wallets` → `/api/finance/wallets`) or remove it if `payroll/payments` fully supersedes it — five-minute fix either way, currently a dead page.

### Stage B — Consolidate reads (backfill, still no deletions)
1. Backfill `fee_item_id` on historical `student_fee_items` rows by matching `item` text to `fee_items.name` per school where unambiguous; leave unmatched rows as-is (they stay readable by name, exactly as today).
2. Point BOTH parent-fee routes (`/portal/...` and `/parent/...`) at `finance_payments` + `student_fee_items` (the current/canonical pair) — stop the older route from reading the deprecated `fee_payments` table, without deleting the route itself yet (avoid breaking whichever portal app still calls it).
3. Point `finance/ledger` (archived) to redirect to `finance/ledger-v2`, or remove it from nav — it's already marked dead in its own UI.

### Stage C — Retire the superseded engines (requires a green period on Stage B first)
1. Once `assign-fees`/`init-fees`/`sync-fees` have zero traffic (confirm via access logs or a deprecation header, same pattern already used on `fee_payments`), retire them the same way `fee_payments` was retired: return 410 with a clear message, keep the route file as documentation of what replaced it.
2. Decide, with the user, whether `waivers_discounts` or `learner_fee_adjustments` is the keeper (recommend `learner_fee_adjustments` — newer, has `effective_from/to` and a `tag` for categorization) and redirect the waivers UI to it.
3. Merge `finance/import` and `finance/import-fees` into the newer preview→commit pipeline (`finance_import_batches`/`rows`), retire the other.

### Stage D — Only after A–C are stable: consider dropping dead tables
`fee_structures`, `finance_fee_items`, `fee_payments`, the losing waiver table — dropped only after a full term's data has been confirmed migrated and nothing reads them. This is explicitly **out of scope** for now; premature.

---

## 5. What this plan deliberately does NOT do

- It does not touch `ledger_accounts`/`ledger_entries`/`ledger_transactions` (the double-entry GL) vs `ledger`/`student_ledger` — reconciling those is a separate, larger decision (does the school need real double-entry accounting, or is the simpler ledger sufficient?) that needs its own conversation, not a byproduct of fee-item cleanup.
- It does not change payment-gateway integration (M-Pesa) — untouched, orthogonal.
- It does not attempt Phase 6 (UI redesign) or Phase 7 (the "ideal flow") until Stages A–C land — a data-first UI is only trustworthy once the data itself has one source of truth.

---

## 6. Decisions needed from you before Stage A starts

1. Confirm `fee_items` + `fee_eligibility_rules` as the keeper system (Section 2's recommendation).
2. Confirm `lib/fees.ts`'s `initializeFeesSystem()` as the one implementation `init-fees`/`sync-fees` both call (vs. picking the other).
3. Confirm `learner_fee_adjustments` as the keeper over `waivers_discounts` (or flag if the older one has an in-use approval workflow that must be preserved).
4. Whether `payroll/payments` or `payroll/salary_payments` is the one to keep (which do bursars currently actually use?).
5. Whether both `/portal/...` and `/parent/...` parent-facing apps are still active in production, or one is already legacy and safe to schedule for removal.

Once these are answered, Stage A is additive/safe and can start immediately without further discussion.
