# DRAIS Finance — Fee Rules Engine: Phase 0 Audit

Audit only. No code changed. Date: 2026-06-23.

## 1. How fees work today (the 10 questions)
1. **Fee items stored where?** Three overlapping tables:
   - `finance_fee_items` — school-level catalog (name, amount, class_id, program_id, term_id). **0 rows, unused.**
   - `fee_structures` — class+term templates (item, amount, is_mandatory, academic_year, due_date). **0 rows, unused.**
   - `student_fee_items` — **materialized per-learner charge lines** (item, amount, discount, waived, paid, balance). **99 rows — the only populated/live table.**
2. **How assigned?** Materialized per learner into `student_fee_items` via: (a) `POST /student_fee_items {action:'seed'}` copies `fee_structures` of a class+term to enrolled learners; (b) single add (the FeeItemModal just shipped); (c) `assignFeesToStudent()` writes `student_ledger` debits. **No rules — assignment is a manual/bulk copy.**
3. **Class-based fees?** Only at the (unused) `fee_structures` level. In practice fees are per-learner.
4. **Term/year scoping?** Yes at data level (`student_fee_items.term_id`/`academic_year`, `fee_structures` term/year).
5. **Waivers?** Yes — `waivers_discounts` (request → approve/reject; approval adds to `student_fee_items.waived`).
6. **Discounts?** Yes — `student_fee_items.discount` + `waivers_discounts.discount_type` (fixed/percentage).
7. **Manual overrides?** **No amount-override** (can only reduce via discount/waived; can't set a negotiated 180,000).
8. **Invoices from items?** `fee_invoices` 0/unused; `receipts` is the live artifact; the invoices route is PDF scaffolding.
9. **Ledger: assigned or calculated?** **Assigned/materialized** (`student_ledger` debits + stored `student_fee_items.balance`). Not rule-calculated.
10. **What breaks if fee logic changes?** `/finance/fees`, `/finance/learners-fees`, `/finance/ledger*`, `/api/finance/dashboard` (expected = SUM of `student_fee_items`), parent fees API, payment allocation, and waivers (which write `student_fee_items.waived`). **All read the materialized `student_fee_items`.**

## 2. Key constraints discovered
- **No class ordering:** `classes.class_level` / `level` are NULL. → ranges must be **explicit class sets** the school selects (P1,P2,P3), with optional numeric-range support *if* a school populates levels. The "preview affected learners" step makes this safe.
- **Learner attributes are spread across tables** — the evaluator must load the learner's **active enrollment + person**:
  - gender → `people.gender`
  - boarding/day → `enrollments.study_mode_id` → `study_modes.name` ("Boarding"/"Day")
  - program (tahfiz/secular) → `enrollments.program_id` → `programs`
  - stream → `enrollments.stream_id`; class → `enrollments.class_id`; term → `enrollments.term_id`; year → `enrollments.academic_year_id`
- `study_modes`/`programs` are partly global (school_id NULL) and partly per-school.

## 3. Architecture decision (non-breaking)
Keep `student_fee_items` as the **materialized bill-line store** (so payments/ledger/dashboard/parent keep working). Add a **rules layer that GENERATES those lines** instead of manual seeding:
- New `fee_items` (reusable, rich: category/frequency/mandatory/effective dates).
- New `fee_eligibility_rules` (conditions: class-set / class-level range / gender / boarding / stream / program / candidate / term / year).
- New `learner_fee_adjustments` (waiver / %-discount / fixed-discount / **amount override** / scholarship / staff-child / sibling) — supersedes/extends `waivers_discounts`.
- `financeFeeRuleEvaluator(learnerContext)` → applicable items + base amount + **explanation + rule_id**.
- Bill generation: evaluate → apply adjustments → preview (with reasons) → on commit, **snapshot into `student_fee_items`** (existing store) so nothing downstream changes.

This satisfies the pass criteria (no manual per-learner assignment; rules cover class/range/gender/boarding/status; waivers/discounts first-class; bills explain themselves; receipts/ledger use the adjusted materialized amounts) without a risky rewrite of the live pipeline.

## 4. Proposed implementation batches
- **Batch A — Phases 1+2 (model):** `fee_items` + `fee_eligibility_rules` tables + CRUD API + **Fee Items** & **Fee Rules** UI with "preview affected learners".
- **Batch B — Phases 3+5 (engine):** `financeFeeRuleEvaluator` (pure, explainable) + bill generation (preview with reasons) + bulk generate → snapshot into `student_fee_items`. Tests for P1–P3 / P7+ / girls / boarders.
- **Batch C — Phase 4 (adjustments):** `learner_fee_adjustments` (incl. amount override + scholarship/staff-child/sibling) + Learner Fee Preview UI ("why each fee applies" + add waiver/discount/override). Migrate `waivers_discounts` usage.
- **Batch D — Phases 7+8 (reconcile + allocate):** import balance-vs-calculated reconciliation options; receipt/ledger per-fee-item allocation + adjustment lines.
- **Phase 9 tests** run with B/C/D.

## 5. Recommendation
Start with **Batch A** (additive tables + CRUD + rule UI with preview) — zero risk to the live pipeline, and it's the foundation the evaluator (Batch B) needs. Get Batch A reviewed before wiring the evaluator that begins generating real charges.
