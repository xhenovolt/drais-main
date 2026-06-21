# DRAIS Parent Portal — Phase 0 Readiness Audit

Verified against **TiDB Cloud** (`gateway01***/drais`), school 12011. **No portal code was changed** — this is audit only, per the brief.

## Headline
The parent portal is **already ~75% built in code** with a **correct, secure canonical model** — but **its database tables do not exist**, so it is **completely non-functional today**. This is a "finish + wire + seed data" job, **not** a greenfield build. Do **not** rebuild it.

---

## What already exists (code)
- **Identity/auth lib** `src/lib/portal/`: `session.ts` (cookie tokens), `otp.ts` (hashed OTP + expiry), `linking.ts` (phone→learner matching, auto-approve setting), `context.ts` (`requirePortalContext`, `requireLinkedLearner`), `guard.ts` (`authorizedStudentIds`, `assertCanViewStudent`, `studentGateSubquery`, `parentSchools`).
- **APIs** `/api/portal/*`: `auth/register`, `auth/login`, `auth/request-otp`, `auth/reset-password`, `auth/logout`, `link/claim`, `learners`, `learners/[studentId]/overview`, `learners/[studentId]/attendance`, `me`, `snapshots/[snapshotId]`. Admin side: `/api/admin/parent-links` (+`/[id]`) approval queue.
- **UI** `/portal/*`: `login`, `register`, `reset`, dashboard (`/portal`), `learners/[id]`. (Brief asks for `/parent/*`; existing is `/portal/*`.)

## The blocker — schema missing
All four portal tables the code depends on are **MISSING** from the DB (no migration creates them anywhere):
| Table | Purpose | DB status |
|---|---|---|
| `parent_accounts` | parent identity (phone/email/name/status) | **MISSING** |
| `parent_student_links` | parent ↔ learner (school-scoped, status) | **MISSING** |
| `parent_otp_codes` | OTP (hashed, expiring) | **MISSING** |
| `parent_sessions` | session tokens | **MISSING** |
→ Every portal auth/link/session/OTP call currently throws. **This is the #1 fix.**

## Audit questions answered
1. **Where parent data lives:** designed in `parent_accounts` + `parent_student_links` (don't exist yet). Legacy/fragmented sources: `parents` (0 rows), `student_parents` (0), `contacts`(4)/`student_contacts`(3)→`people` (48 phones total), `student_next_of_kin` (0).
2. **Identity duplicated?** Yes — **4+ guardian models** coexist (see below).
3. **Phones normalized?** No central normalization; `linking.ts` normalizes at match time. Phone data is **almost absent** (48 people-with-phone across all schools).
4. **One parent → many learners?** Yes — `parent_student_links` supports it.
5. **One learner → many parents?** Yes — many links per student.
6. **Parent login exists?** Code yes (register/login/OTP/session); non-functional (tables missing).
7. **OTP works?** Code yes (hashed, expiry, retry window via `parent_otp_codes`); sends over the working SMS provider; non-functional (table missing).
8. **Parent-scoped APIs?** Yes — `studentGateSubquery`/`assertCanViewStudent` enforce per-student, school-scoped, `status='active'` access. Good design.
9. **Attendance safe to expose?** Data is trustworthy (`attendance_records`, corrected time) — **but the portal reads the wrong table** `daily_attendance` (**0 rows**) instead of `attendance_records`. Attendance view would be blank.
10. **Fees safe to expose?** `student_fee_items` (98 rows), `fee_payments` (0). No `parent_finance_visibility` setting present yet — needs a school toggle before exposing.
11. **Reports safe to expose?** `report_snapshots` (7 rows) has `status` — must filter to **published/approved only**; `/api/portal/snapshots/[id]` exists (needs a publish-gate verify).

## Security posture
**Good (already):** dedicated `parent_accounts` (not mixed into staff `users`); per-student gate (`studentGateSubquery`) + school scoping + `status='active'`; OTP hashed with expiry; approval-queue concept (`parent-links`).
**Risks to close:**
- **Phone-based over-linking** — `claimLearners` matches by phone; a stale/shared contact phone could grant access. Keep **auto-approve OFF** (require admin approval) — confirm the `parent_link_auto_approve` default.
- **No guardian phone data** — matching will find nobody until phones are captured (also why automatic SMS is limited).
- **Per-route gate not yet verified** — every `/api/portal/*` data route must call the gate; needs a route-by-route security pass.
- **Wrong attendance source** (`daily_attendance`) — fix to `attendance_records` (corrected time).

## Duplicate guardian models (consolidate)
`parent_accounts`+`parent_student_links` (portal, canonical) · `parents`+`student_parents` (legacy, empty) · `contacts`+`student_contacts` (sparse) · `student_next_of_kin` (empty) · `people.phone`.
**Recommended canonical:** `parent_accounts` (identity, normalized phone) + `parent_student_links` (access). Seed/match from `student_contacts→contacts→people.phone`. **Deprecate** `parents`/`student_parents`. Never grant access from a raw contact phone — only via an **approved** `parent_student_links` row.

## Phase status vs the brief
| Phase | State |
|---|---|
| P1 identity | code ✓ · **tables missing** |
| P2 OTP auth | code ✓ · tables missing · SMS provider works |
| P3 shell | `/portal/*` pages exist (login/register/reset/dashboard/learner) |
| P4 attendance | route exists · **reads empty `daily_attendance`** |
| P5 academics | reads `results` · partial |
| P6 reports | `/api/portal/snapshots` exists · needs publish-gate verify |
| P7 fees | reads fee tables · **no visibility toggle** |
| P8 notifications | not present |
| P9 admin UI | approval APIs exist · UI partial |
| P10 security tests | not run |

## Recommended execution order (do NOT rebuild)
1. **Create + apply the portal schema migration** (`parent_accounts`, `parent_student_links`, `parent_otp_codes`, `parent_sessions`) — unblocks everything. *(Phase 1)*
2. **Fix attendance source** in portal routes: `daily_attendance` → `attendance_records` (corrected time + `time_confidence`). *(Phase 4)*
3. **Capture guardian phones** (data) and default **auto-approve = OFF**; wire the admin approval queue UI. *(Phase 1/9)*
4. **Security pass:** confirm every `/api/portal/*` data route uses the student gate + school scope; reports filtered to published/approved; fees behind a school visibility setting. *(Phase 10)*
5. Then finish views (results/fees/reports/notifications) and run the 10 security tests.

## Remaining risks
- Portal is dead until the schema migration is applied (#1).
- Guardian phone data is the gating real-world dependency for login/matching.
- Two URL namespaces (`/portal` built vs `/parent` requested) — pick one (recommend keep `/portal`, alias `/parent`).
- `daily_attendance` vs `attendance_records` mismatch must be fixed or attendance shows blank.

**Next step:** with your go-ahead I'll start **Phase 1** — write the portal schema migration (matching exactly what the existing code expects) + apply it on TiDB, then verify register→OTP→login→link end-to-end. I will not change portal logic beyond what the audit shows is needed.
