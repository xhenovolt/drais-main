# Attendance Policy Scoping — Phase 0 Audit + Phase 1/2 Foundation

## Phase 0 — audit (7 questions answered)
1. **Where policy is loaded:** classification rules in `src/lib/attendance/engine.ts` → `evaluateDay()` (`SELECT … FROM attendance_rules WHERE school_id=? AND is_active=1 AND applies_to IN (…) ORDER BY priority ASC` → takes the first). Device-time policy in `src/lib/attendance/device-clock.ts` → `resolveTimePolicy(schoolId)` (table `attendance_time_policy`). Classification math in `rule-evaluator.ts` `evaluate(rule, ctx)`.
2. **School-only?** No — rules carry `applies_to` (student/staff/all), `priority`, `effective_date/end_date`, and (unused) `applies_to_classes` + `boarding_scope`. But **selection only filters by role + priority**; class/boarding columns aren't used to *pick* a rule, and **boarding isn't wired** (engine passes `personIsBoarding=true` to everyone).
3. **Staff vs learner differ?** Yes, via `applies_to` (role) — that part works.
4. **Device-time separate from classification?** Yes (good) — `attendance_time_policy` vs `attendance_rules`. But device-time is **school-only** (no per-device override).
5. **Individual override?** No — no learner/staff/class/stream/department/device scope.
6. **Precedence?** Only `priority` within role. No specificity chain.
7. **Explainability?** Partial — `attendance_records.rule_id` is stored, but **no reason / scope / fallback** is recorded.

**Net:** a real rules table exists but selection is role+priority only; most scopes are dormant; no precedence chain; no explanation. That's the gap this work closes — **without disturbing the live pipeline** (Test/City Parents).

## Phase 1 — scoped model (applied to TiDB, non-destructive)
Extended `attendance_rules` with **`scope_type`** (`school|role|class|stream|department|boarding|device|learner|staff|shift|holiday`) + **`scope_id`**. Migrated the 9 existing rows (→ 3 `school`, 6 `role`) so current behaviour is preserved. No data destroyed.

## Phase 2 — deterministic resolver + explainability (`src/lib/attendance/policy-resolver.ts`)
`selectPolicy(rules, ctx)` (pure) + `resolveAttendancePolicy(ctx)` (DB). Precedence (most specific wins): **learner/staff → device → class/stream/department → boarding → role → school**. Ties: lower `priority` → newest `effective_date` → else **ambiguous, fall back to school default with a warning**. Honors `effective_date/end_date/is_active`. Returns `{ policy_id, scope_type, scope_id, reason, fallback_used, ambiguous }` — e.g. *"Boarding-status policy (boarding) — 'Boarders rule'"*.

**Tested (10/10 pass, `npx tsx --test`):** school default · staff≠learner · boarder overrides role · day-scholar doesn't apply to a boarder · class beats role+boarding · individual learner beats all · device beats class/role not learner · expired override excluded · priority tie-break · ambiguous→school fallback.

## ⚠ Deliberately NOT done yet (to protect the live pipeline)
- **Evaluator wiring (Phase 8):** the resolver is **not yet called by `engine.ts`** — so attendance behaviour is unchanged. Wiring is a single contained change (replace the role+priority `SELECT` in `evaluateDay` with `resolveAttendancePolicy(ctx)`, passing class/stream/department/boarding/device), with the resolver's school/role fallback reproducing today's result for existing setups (zero behaviour change until someone adds an override).
- **Phase 9 record audit:** add `attendance_records.policy_resolution_json` (+ reuse `rule_id`) to store the reason.
- **Device-time per-device (Phase 4):** extend `attendance_time_policy` with an optional `device_sn` scope.
- **UI (Phase 5/6):** scoped tabs + person-profile overrides.
- **Simulator (Phase 7):** `resolveAttendancePolicy` already returns the explanation — the simulator is a thin UI over it.

## Files / tables
- New: `src/lib/attendance/policy-resolver.ts`, its test, `sql/attendance_policy_scope.sql`.
- Changed table: `attendance_rules` (+`scope_type`,`scope_id`; existing rows migrated). No code in the live path changed.

## Next recommended phase
**Phase 8 — wire the resolver into `engine.ts`** (fallback-preserving, verified against a couple of real punches for Test/City Parents so classification is provably unchanged), then **Phase 9** (store the reason) and **Phase 7** (simulator over the resolver). Boarding status + class/stream/department/device must be passed into `ResolveContext` from the punch's person record at that step.
