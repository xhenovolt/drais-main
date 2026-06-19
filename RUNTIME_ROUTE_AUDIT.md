# DRAIS — Runtime Route Stability Audit

**Method:** live HTTP execution against the running app + TiDB Cloud, authenticated as superadmin. Routes were hit with the real session cookie and statuses/response shapes recorded. Confirmed failures were reproduced directly against the database.

## Environment tested
| Field | Value |
|---|---|
| DATABASE_ENGINE | TiDB Cloud (MySQL-compatible) |
| DB host (masked) | gateway01***…/drais |
| Commit | 63cba49 (chore: version bump) |
| App URL | http://localhost:3000 (`next dev`, Next 15.5.12) |
| School tested | 12011 (Test institution) |
| Role/user | SuperAdmin — test@xhenvolt.com |
| Env mode | `.env.local` via `--env-file` (see Finding E1) |

## Coverage achieved (honest)
- **Route inventory:** 181 UI pages, 550 API route files (150 dynamic).
- **UI walkthrough:** 164/164 **static** UI pages executed → **all HTTP 200** (no SSR/server-component crashes, no Next error page). Dynamic UI pages (`[id]`, `[type]`…) not swept.
- **API execution:** ~30 of 417 static API GET routes executed before environment instability halted the sweep (see Limitations). Confirmed failures were then reproduced/triaged directly against TiDB.

## Limitations (what this audit did NOT do)
1. **No browser** in this environment → no click-through of buttons/modals, no console-error / hydration-error / screenshot capture. UI verdicts are server-render only (HTTP 200 = shell rendered; client-side data/JS errors are NOT covered).
2. **Full 417-route API sweep did not complete.** `next dev` repeatedly hit its memory threshold and auto-restarted under sustained sequential load, and the sandbox reaps detached server processes between tool calls — so a long unattended sweep could not run to completion here. A production build (`next build && next start`, which the repo supports via `output: 'standalone'` + `ignoreBuildErrors`) on a normal host would complete it.
3. **Single role / single school** (superadmin, 12011). No teacher/bursar/limited-staff RBAC matrix.
4. **No mutations** (POST/PATCH/DELETE not fired) — read-only audit to avoid changing data. 405 on a GET means "mutation-only route," not a failure.

---

## Confirmed findings

### P1/P2 — `GET /api/academics/allocations/teacher-load` → 500 (reproducible)
Returns `500 {"success":false,"message":"… 'drais.p.first_name' … incompatible with sql_mode=only_full_group_by"}`.
**Root cause:** the query does `GROUP BY cs.teacher_id` while selecting non-aggregated `CONCAT(p.first_name,' ',p.last_name)` (two queries, lines ~26 & ~64). TiDB enforces `ONLY_FULL_GROUP_BY` by default; a looser local MySQL would have allowed it. **Reproduced directly on TiDB.**
**Fix:** add the non-aggregated columns to `GROUP BY` (e.g. `GROUP BY cs.teacher_id, p.first_name, p.last_name`) or wrap them in `ANY_VALUE(...)`.
**Class risk:** 73 API route files use `GROUP BY`; this proves at least one violates strict mode on TiDB. The whole set should be swept for the same pattern.

### P2 — Empty-body 500 risk: API routes with no try/catch
`device-alerts` and `notifications/outbox` were observed returning **500 with an empty body** once during the sweep. On re-check, **both query cleanly against the current TiDB schema** (tables/columns present), so those specific 500s were **transient** (caught in a dev memory-restart window), **not** reproducible schema bugs. **However**, both routes (and others in this style) run their DB work **without a try/catch**, so *any* transient/DB error surfaces as a bare 500 with no JSON body — which makes the frontend's `res.json()` throw "Unexpected end of JSON input." This is a systemic robustness gap, not a one-route bug.
**Fix:** wrap handler bodies in try/catch returning `NextResponse.json({ error }, { status: 500 })`; sweep admin/* and similar GET routes.

### P2 (dev-only) — `.env.local` fails to load in `next dev`
`E1:` `VERCEL_ENV=${VERCEL_ENV:-development}` self-references → `@next/env` throws `Maximum call stack size exceeded` ("Failed to load env from .env.local"). The app only ran here because env was injected via `--env-file`. **Vercel is unaffected** (it uses dashboard env, not `.env.local`), but local `next dev` is broken without the workaround.
**Fix:** change to a literal, e.g. `VERCEL_ENV=development` (or remove the line).

### P3 — Duplicate route file
`src/app/api/class-subjects/route.js` **and** `route.ts` both resolve to `/api/class-subjects` ("Duplicate page detected"). The stale `.js` should be deleted so the `.ts` is authoritative.

### P3 (infra/dev) — `next dev` memory-restart under load
The dev server logs `Server is approaching the used memory threshold, restarting…` during sustained navigation, briefly dropping requests (and re-triggering E1 on each restart). Dev-mode only; production (`next start`) behaves differently, but worth noting for anyone load-testing locally.

---

## Ranked implementation plan

**Batch A — P1 (do first)**
- A1. Fix `teacher-load` `GROUP BY` (root cause above). Files: `src/app/api/academics/allocations/teacher-load/route.ts`. Risk: low. Verify: `GET /api/academics/allocations/teacher-load` → 200.
- A2. Sweep the other 72 `GROUP BY` API routes for `only_full_group_by` on TiDB (script: run each GET, grep for the error). Fix offenders the same way.

**Batch B — P2 robustness**
- B1. Add try/catch → JSON error to admin/* GET routes lacking it (start: device-alerts, outbox). Prevents empty-body 500 → client JSON-parse crash.
- B2. `.env.local`: replace the self-referential `VERCEL_ENV` line.

**Batch C — consistency**
- C1. Delete `src/app/api/class-subjects/route.js`.

**Batch D — complete the audit (recommended next)**
- D1. Run `next build && next start` on a normal host and execute the full 417 API GET sweep + 150 dynamic routes (with real IDs) + a Playwright UI pass for console/hydration/button coverage. This is the part this sandbox could not finish.

---

## Recommendation
**Not yet verifiable as "production-ready" from this audit** — coverage was partial (UI shells all 200; only ~30 API routes executed before the environment halted the sweep). What was found is **encouraging**: every static UI page renders, and only one **reproducible** runtime bug surfaced (`teacher-load`), plus a systemic robustness gap (bare 500s) and minor dev/config issues.

**Verdict:** **Safe for limited pilot** on the modules exercised (students list/popup, attendance settings, core settings/academics pages render), **after** Batch A + B fixes. A **full production-build sweep (Batch D)** is required before declaring the whole app production-ready — particularly the dynamic routes, mutations, and the 70+ `GROUP BY` endpoints that share the TiDB strict-mode risk.
