# DRAIS — Hybrid DB + Finance Audit (Track A & B Phase 0)

Audit only. No code changed. Date: 2026-06-23.

---

## 1. HYBRID DB AUDIT (Track A Phase 0)

### Connection layer
- **One central pool**: `src/lib/db.ts` — module-level singleton `pool` + `connectionVerified` flag, hardwired to `TIDB_CONFIG` (`TIDB_HOST/PORT/USER/PASSWORD/DB`). Exposes `query()`, `getConnection()`, `withTransaction()`, `getActiveDatabase()` (returns `'tidb'`), and a stub `getLocalMySQLConfig()` that **returns the TiDB config** (no local support yet).
- **Reach**: **435 of 573** API route files import `@/lib/db`. `dbTenant.ts` and `schoolDB.ts` both delegate to it, so they inherit the pool for free. **This single file is the chokepoint** — make it mode-aware and most of the app becomes hybrid without touching routes.

### Answers to the 7 audit questions
1. **One global pool?** Yes — one cached TiDB pool. (Plus one *legacy* stray pool, below.)
2. **Mode switch without restart?** **No.** Pool is cached at module load and verified once; nothing reads a runtime mode.
3. **Can APIs choose DB by request/session/runtime?** Not today, but cleanly possible: route all callers through a `getPool(mode)` keyed cache and resolve `mode` from a cookie/header (web) or env (packaged).
4. **Must hosted prod force online?** Yes — Vercel has no localhost MySQL. Force online unless a deploy explicitly opts in.
5. **Can packaged/local app allow local?** Yes — Electron build already boots the server in-process; a `DRAIS_ALLOW_LOCAL=true` gate fits there.
6. **Routes that hardcode TiDB?** `src/app/api/students/full.ts` & `index.ts` — **dead Pages-Router files** (`NextApiRequest`, direct `mysql.createConnection`, read `process.env.TIDB_*`). The live route is `students/route.ts`. Also `test-db/route.ts`, `health/route.ts` read env directly.
7. **Routes that read env directly / bypass the helper?** `src/utils/database.ts` is a **second independent pool** defaulting to `localhost:3306 / drais_school` (`DB_HOST/DB_USER/DB_NAME`), used by **3 live routes**: `attendance/bulk-mark`, `attendance/mark`, `attendance/export`. On Vercel these point at a non-existent localhost DB — a latent bug and a hybrid-mode landmine.

### Migration tooling (already strong)
- `scripts/db/migrate.mjs` applies `database/migrations/tidb/*.sql|.mjs`, records every run in **`schema_migrations`** (per-database ledger — already designed so "local and TiDB each keep their own history"), supports `--database <name>`, `--status`, `--dry-run`. `preflight.mjs`, `seed-rehearsal.mjs`, smoke tests exist. `scripts/db-export/` has `01-analyze-schema`, `02-export-school`, `03-export-all`.
- **Missing**: the `db:export:schema` / `db:local:init` / `db:local:verify` npm scripts Track A Phase 3 asks for (the building blocks exist; they're not wired as one-command flows).

### UI state
- Navbar/sidebar/login currently have **no DB-mode concept** — nothing to surface mode or health.

---

## 2. FINANCE TRUST AUDIT (Track B Phase 0)

**Verdict: fragmented scaffolding, low trust, almost no data.** Real infra exists (services, currency lib, receipt tokens) but it's duplicated across competing tables/endpoints and barely used. Only **school 12004** has any finance rows.

### Pages (14 — with duplicates)
`/finance`, `/finance/fees`, `/finance/learners-fees`, `/finance/ledger`, `/finance/ledger/fees`, **`/finance/ledger-v2`** (dup of ledger), `/finance/payments`, `/finance/wallets`, `/finance/expenditures`, `/finance/waivers`, `/finance/settings`, `/finance/receipts/[receiptNo]`, `/finance/reports/{balance-sheet,income-statement}`.

### APIs (~37 — heavy duplication)
- **Payments (4 competing):** `payments` (351 lines — the real, audited one), `record-payment` (57), `fee_payments` (149), `pay_fee_item` (42).
- **Fees (8 overlapping):** `fees`, `learners-fees`, `assign-fees`, `init-fees`, `sync-fees`, `fee-items`, `fee_structures`, `student_fee_items`, `missing_fee_items`.
- **Ledger (5):** `ledger`, `ledger/fees`, `student-ledger`, `ledger-reports`, plus `ledger-v2` page.
- **Receipts (3):** `payments/[id]/receipt`, `receipts/[ref]`, `receipts/[ref]/verify`.

### Tables (29 finance-related — ~25 empty, heavy duplication)
| Concept | Tables (rows) | State |
|---|---|---|
| Fee items | `student_fee_items` (**98**), `finance_fee_items` (0), `fee_structures` (0) | one used, two dead |
| Payments | `fee_payments` (0), `finance_payments` (0), `fee_payment_allocations` (0) | **none used** |
| Ledger | `student_ledger` (**15**), `ledger`/`ledger_accounts`/`ledger_entries`/`ledger_transactions` (0) | one used, four dead |
| Money location | `finance_accounts` (2, type=income/asset), `wallets` (1) | two competing models, neither real cash/bank/MM |
| Invoices | `fee_invoices` (0) | unused |
| Receipts | `receipts` (0) | infra exists, **0 ever generated** |
| Reconciliation | `payment_reconciliations` (0) | table only |
| Expenses | `expenditures` (0), `salary_payments` (0) | unused |
| Mobile money | `mobile_money_transactions` (0) | unused |
| Budgets | **none** | **missing** |
| Pocket money | **none** | **missing** |
| Import batches | **none** | **missing** |

### Code that DOES exist (reusable)
- `src/lib/currency.ts` — UGX default + 7 currencies, `formatCurrency()`. **But only 3 files use it; 8 finance pages hardcode symbols.**
- `src/lib/services/{ReceiptService,FinanceLedger,FinanceService}.ts`, `src/lib/receipts.ts`, `src/lib/finance/receiptToken.ts` (HMAC verify).

### Answers to the 15 finance questions
1. Old UI: `ledger-v2` vs `ledger`, `fees` vs `learners-fees` overlap. 2. Dead buttons: needs per-page trace (Batch 1) — but endpoints backing many pages hit **empty tables**. 3. Failing/dead APIs: the 3 redundant payment endpoints + dead fee endpoints. 4. Duplicated flows: payments ×4, fees ×8, ledger ×5. 5. Missing tables: **budgets, pocket money, import batches, a real money-location model**. 6. Reconciliation: table exists, **unused**. 7. Fee imports: `bulk-import` route exists; no source-system mapping/dedup pipeline. 8. Receipts auto-generate: infra yes, **0 generated** in practice. 9. Payment locations tracked: no (accounts/wallets exist but not wired to payments). 10. Cash/bank/MM locations: **no real taxonomy**. 11. Budgets: **no**. 12. Pocket money: **no**. 13. Reversals/voids: `finance_actions` table (0) only; not wired. 14. Audit trail: `audit_logs` exists app-wide; finance not consistently writing to it. 15. Parent portal finance: `parent_accounts` (1 row) + parent portal exists; finance read path not consolidated.

---

## 3. ARCHITECTURE DECISIONS
- **A1 — Mode resolver at the chokepoint.** New `src/lib/db/db-mode.ts` (resolve `online|local` from env + request cookie, with prod-force-online + `DRAIS_ALLOW_LOCAL` gate) and `src/lib/db/pools.ts` (cache **one pool per mode** in a `Map`, health-checked). `db.ts` `getPool()` delegates to it. No route changes for the 435 helper users.
- **A2 — Fix the bypasses first.** Migrate the 3 `utils/database.ts` routes onto `@/lib/db`; delete the dead `students/full.ts` & `index.ts`. Otherwise hybrid mode is unsound.
- **A3 — Consolidate finance, don't add a 5th of everything.** Pick the **winning** tables (`student_fee_items`, `student_ledger`, `receipts`, `finance_payments` or `fee_payments` — choose one) and the **one** payments endpoint (`/api/finance/payments`); deprecate the rest behind it. New concepts (budgets, pocket money, money locations, import batches) get clean new tables.
- **A4 — One currency formatter everywhere.** Route all finance pages through `src/lib/currency.ts` + `schools.currency`.
- **A5 — Every finance write is transactional + audited** (payment → balance → ledger → money-location → receipt → audit, in one `withTransaction`).

---

## 4. MISSING (tables / APIs / UI)
- **Tables:** `finance_money_locations` (cash/bank/mobile-money/SchoolPay/SurePay), `finance_account_transfers`, `budgets` + `budget_lines`, `expenses` (replacing empty `expenditures`), `pocket_money_accounts` + `pocket_money_transactions`, `finance_import_batches` + `finance_import_rows`, a wired `payment_reversals`.
- **APIs:** consolidated `/finance/payments` (record+receipt+ledger+location in one txn), `/finance/import` (source mapping + admission-number match + dedup + preview + commit), `/finance/accounts/transfer`, `/finance/budgets`, `/finance/expenses`, `/finance/pocket-money`, `/finance/dashboard` (trusted totals).
- **UI:** DB-mode badge/switch (login + navbar + sidebar) + health indicator; finance dashboard; money-locations; budgets; pocket money; import wizard.

---

## 5. RISK REPORT
- **R1 (high):** the 3 `utils/database.ts` attendance routes already point at localhost on prod — pre-existing latent failure and a hybrid landmine. Fix before/with Track A.
- **R2 (high):** finance duplication means "which table is truth?" is ambiguous — any new work must declare winners or it deepens the mess.
- **R3 (med):** runtime mode switch must **clear the session** and never leak across modes (a local-mode token must not authenticate online).
- **R4 (med):** prod must hard-refuse local mode (no localhost DB on Vercel).
- **R5 (low/sensitive):** local schema export must **exclude private learner/payment data** by default (seed = roles/permissions/modules/settings/reference only). Tahfiz seed needs explicit approval (per standing rule).
- **R6 (med):** `bigNumberStrings: true` — every new numeric finance flag/amount returns as a **string**; compare with `Number(...)` (known recurring bug class).

---

## 6. IMPLEMENTATION BATCHES
- **Batch 1 (recommended first):** (a) DB mode resolver `db-mode.ts` + `pools.ts` + `db.ts` delegation, prod-force-online, health check; (b) mode badge/switch on login + navbar + sidebar; (c) fix R1 bypass routes; (d) finance currency engine wired into all finance pages + a real per-page button/endpoint trace with fixes.
- **Batch 2:** local schema export/import (`db:export:schema`, `db:local:init`, `db:local:verify`) + safe-seed; finance payments+receipts trust (one payment endpoint, txn-safe, auto-receipt+QR+reprint).
- **Batch 3:** finance import/reconciliation (source mapping, admission-number match, dedup, preview, commit).
- **Batch 4:** accounts / money locations + transfers.
- **Batch 5:** budgets + expenses.
- **Batch 6:** pocket money. (Dashboard + parent-finance read fold into 4–6.)

---

## 7. WHICH BATCH FIRST
**Batch 1**, and within it start with **Track A mode resolver + bypass fix** (foundational, unblocks local testing) **then the finance currency unification + button audit** (high-trust, low-risk, no schema churn). Both are additive and don't disturb online TiDB behavior.

---

## 8. TESTING PLAN (TiDB + local)
- **Track A:** unit-test `db-mode` resolution (env/cookie/prod-force); pool cache returns same instance per mode; health check pass/fail; prod refuses local; session cleared on switch. Manual: login health indicator both modes.
- **Track B:** the 22-point matrix (UGX default, currency change, imports ×3, dup detection, payment+receipt+QR+reprint, money-location totals, cash→bank, budget create+deficit, expense, pocket money in/out, dashboard totals, parent read) — run against **TiDB first**, then **local MySQL** once Batch 2 lands. Each finance write asserts balance-before/after + ledger + audit row.
