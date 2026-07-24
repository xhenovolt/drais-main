# DRAIS Route Hardening Audit

**Goal:** make every route *boring* — predictable, scoped, fast, and impossible to break silently.
**Method:** static scan of all routes (grep-based signatures, so figures are indicative, not exact — each phase re-verifies its own set before changing code). Version at audit: 1.96.0 · 2026-07-25.

## Scale & reproducible metrics (`node scripts/route-audit.mjs`)
- **654** API routes · **226** page routes · **303** lib modules · **295** components.
- Signature counts (heuristic upper bounds — each phase re-verifies its exact set before touching code):
  - `unguarded` **84 (13%)** — no auth signature (includes intentionally-public + middleware-guarded + 410 stubs; needs the review pass, not blind fixing).
  - `no-trycatch` **112 (17%)** — no `try/catch`.
  - `n-plus-1` **116 (18%)** — a loop and an `await query` in the same file (upper bound; not all are nested).
  - `select-star` **28 (4%)**.
  - `inline-schema` **13 (2%)** — runtime DDL on the request path.
  - `no-cache` **654 (100%)** — no route declares caching.
- A codebase this size can't be hand-audited route-by-route in one pass; the plan below batches by *bottleneck class*, each class a shippable phase.

## Findings (evidence-based, most severe first)

### P0 — Cross-tenant / unauthenticated data exposure
- **`/api/system-analysis`** (CONFIRMED): `SELECT SUM(amount) … FROM ledger` with **no session check and no `school_id` scope** → returns finance totals across *every* school to any caller. Must be scoped + gated immediately.
- **~30 routes** matched "no auth-guard" in the scan. Most are legitimate (auth/login, logout, zk-handler [device key], verify/[token], parent/portal [own auth], deprecated 410 stubs like finance/pay_fee_item & tahfiz/learners, public health/devices-list). **Action:** each must be individually confirmed as *intentionally public AND school-scoped where it reads tenant data* — the scan can't prove intent, so this is a review pass, not an assumption.

### P1 — Unpredictable failure & inconsistent contracts (the core "boring" gap)
- **111 / 654 routes have no `try/catch`** → an unexpected error becomes an unstructured 500 (sometimes a stack trace), and the client can't distinguish failure modes. (This class caused a real bug this cycle: the identity-correction search failed silently on an ambiguous response shape.)
- **Response envelope is ad-hoc**: 620 routes hand-roll `NextResponse.json`; only 5 use the shared `createSuccessResponse/createErrorResponse` helper. Success is sometimes `{data}`, sometimes `{rows}`, sometimes bare; errors are `{error}` | `{error:{message}}` | `{message}`. Clients can't rely on one shape.

### P2 — Query hygiene
- **28 routes use `SELECT *`** → over-fetch + break on column changes.
- **~25 routes run `await query(...)` inside a loop** (N+1) → latency scales with row count (e.g. per-device / per-record fan-outs in attendance & academics).
- **13 routes run schema-ensure (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN`) inline** on the request path → first-call latency; promise-gated so amortised, but still runtime DDL on hot paths.

### P3 — Performance / caching
- **0 / 654 routes declare any caching** (`revalidate` / `unstable_cache`) → every read hits TiDB, including hot, rarely-changing reads (module lists, dashboards, catalogs).

### P4 — Verification debt (systemic)
- **200+ unit tests, ~0 integration/E2E tests.** The platform is proven at the pure-function level and by manual DB probes, not at the route level. New, powerful surfaces (Control-Center impersonation, biometric template push, identity-correction cascade) are **shipped but unverified against a running app/device**.

### P5 — Build/deploy scaling
- 226 pages already tripped a Vercel build OOM (patched via `webpackMemoryOptimizations`); the trajectory will recur without bundle trimming or a larger build machine.

## Implementation plan — one phase per bottleneck class, each independently shippable

Every phase: audit its exact set → fix → test → `fix:`/`refactor:` patch (or `feat:` only if it adds a capability) → verify no regression. No phase touches another's surface.

**Phase 1 — Tenancy & auth (P0).** *Highest priority — a leak is the least boring thing possible.*
- Fix `/api/system-analysis` (scope to session `school_id` + require auth) now.
- Enumerate every route the scan flagged as unguarded; for each, either confirm intentionally-public or add `getSessionSchoolId` + `school_id` scoping. Produce a signed-off allowlist of the genuinely-public routes.
- Add a lightweight test asserting known tenant routes 401 without a session.

**Phase 2 — Predictable contracts (P1).** The heart of "boring."
- Introduce one `withRoute()` wrapper (auth + try/catch + standard `{ ok, data?, error? }` envelope + request id) and adopt it on the highest-traffic routes first (attendance, dashboard, finance, students), then sweep the 111 no-try/catch routes.
- Document the envelope once; make clients depend on it.

**Phase 3 — Query hygiene (P2).**
- Replace the 28 `SELECT *` with explicit column lists.
- Rewrite the ~25 N+1 loops as set-based queries (IN-lists / JOINs).
- Move the 13 inline schema-ensures to a single startup/deploy migration so the request path carries no DDL.

**Phase 4 — Read caching (P3).**
- Add short-TTL caching to hot, low-churn reads (module catalog, nav config, dashboards) with explicit invalidation on write. Measure before/after.

**Phase 5 — Verification harness (P4).**
- Stand up an integration smoke suite (auth, attendance ingest → verdict, impersonation start/exit, identity-correction cascade, SMS enqueue) that runs against a seeded DB in CI — so future changes are *proven*, not just built. **This is the single highest-leverage investment; it converts "shipped" into "trusted."**

**Phase 6 — Build/deploy scaling (P5).**
- Bundle analysis; split the heaviest client pages; decide on build-machine size. Keep deploys green as the app keeps growing.

## Sequencing recommendation
1 → 2 → 5 first (security, predictability, proof), then 3 → 4 → 6 (efficiency). Phases 1–2 make DRAIS *safe and predictable*; Phase 5 keeps it that way; 3/4/6 make it *fast and cheap*.

## Repeatability
This audit is grep-reproducible; a `scripts/route-audit.mjs` can regenerate the counts each release so the numbers become a tracked metric, not a one-off.
