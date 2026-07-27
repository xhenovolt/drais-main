# DRAIS Student Management Hardening — Audit & Roadmap

**Status:** Audit only. No implementation until the roadmap (Phase 8) is approved.
**Scope:** Integrity, reliability, maintainability, founder-independence of student workflows.
**Constraint carried from the build-memory work:** implementation must be *route-count
aware*. The production build memory floor is structural (907 routes / 725 static pages);
prefer **consolidation** (which removes routes) over proliferation. Several findings below
(two import engines, two parent systems) are consolidation opportunities that *reduce* the
build graph — a rare win-win.

---

## PHASE 0 — Platform Maturity Validation (Attendance + Control Center)

**Claim under test:** *"DRAIS Attendance and Control Center can now be operated by trained
administrators without depending on the founder for day-to-day operations."*

**Verdict: Largely TRUE, with two documented residual dependencies.**

| Area | Maturity | Notes |
|---|---|---|
| Attendance (mark/list/history/reports) | ✅ Mature | Server-side module gate (v1.134.0), tz-correct dates (v1.134.2–3), tab counts honour filters (v1.134.1) |
| Device management | ✅ Mature | Control-center device lifecycle (assign/release/suspend/retire), paginated (v1.135.0) |
| Attendance recovery / health / time-intelligence | ✅ Mature | Proactive banners, clock-skew self-heal, policy-aware |
| Identity resolution | ⚠️ Partial | Unmatched tab + self-service **Assign**; person-merge + identity-correction exist. **But** deep corruption (person_id backfill bug, clock drift) still needed founder scripts (`tmp/*.mts`) |
| Control Center (auth/2FA/RBAC) | ✅ Mature | Isolated auth, optional TOTP + recovery, least-privilege catalog |
| Subscription / billing / dunning | ✅ Mature | Ledger, gateway webhook, installation-fee + pro-rata, plan-delete now sticks (v1.135.1) |
| School lifecycle | ✅ Mature | Archive/soft-delete/restore/hard-delete + one-click provisioning (v1.136.0) |
| Platform monitoring | ✅ Mature | Health snapshots + alerts, BI, external API v1 (v1.137.0) |

**Residual founder dependence (must be closed, tracked here):**
- **F0-1 — Deep identity/data-corruption repair.** Attendance identity backfill/merge errors
  were fixed with one-off founder scripts, not an admin UI. Needs a self-service
  "identity repair" surface (safe, audited, reversible).
- **F0-2 — Schema/structural fixes** still require a developer (no admin-facing schema tools —
  acceptable, but should be *documented* as intentionally developer-only).

Conclusion: proceed to Student Management. Attendance/Control are operable by trained admins
for normal operations; the two residuals above are folded into the Student roadmap where they
overlap (identity/duplicate repair).

---

## PHASE 1 — Student Management Architecture Map

The module is **already large and sophisticated** — this is a *hardening*, not a build-out.

- **~64 student API routes**, **~22 pages**.
- **Identity model:** `students.person_id → people` (shared person entity across student/staff/
  contacts). Enrollment via `enrollments` (status='active'). Contacts via `student_contacts` /
  `next_of_kin`.
- **Lifecycle:** admit → enroll → status (active/suspended/on_leave) → promote/transfer
  (reassign-class) → withdraw/graduate → soft-delete → restore → hard-delete. Routes:
  `status`, `status-action`, `lifecycle`, `delete`, `delete-permanent`, `history`, `[id]/timeline`.
- **Bulk ops:** `bulk-assign-class`, `bulk/enroll(+sse)`, `bulk/status`, `bulk/delete(-all)`,
  `bulk-photo-upload`, `reassign-class`, `promotion-manifest`.
- **Duplicates:** `detect-duplicates`, `duplicates`, `duplicates/merge`, `duplicates/purge`,
  `list-duplicates` + `src/lib/duplicate-detection.ts` + `/students/duplicates` page.
- **Import:** **two engines** (see Phase 3).
- **Programs:** UNEB / Theology / Tahfiz (`tahfiz/enrollments`, `[id]/education-levels`).
- **Biometric:** `[id]/fingerprint/*`, `enroll-fingerprint`, `biometric_enrollments`.
- **Parent:** **two systems** (see Phase 5).
- **Cross-module links:** attendance (`person_id`), finance (`fees`, `fee_items`, student
  balances), academics (marks/results via `person_id`), report cards, parent portal.

**Finding P1-1 (maintainability):** genuine **route duplication** — two import engines and two
parent stacks. This inflates surface area *and* the build graph.

---

## PHASE 2 — Student Data Integrity

| # | Finding | Severity | Evidence |
|---|---|---|---|
| **I-1** | **No DB-level UNIQUE on `students(school_id, admission_no)`** — uniqueness enforced by app-level `SELECT COUNT(*)` in `admissionNumber.ts`. Race-prone: concurrent admit/import can create duplicate admission numbers. | **High** | `src/lib/admissionNumber.ts:45` |
| **I-2** | **Person de-dup relies on lookup logic, not a hard constraint** — `people` can accrue duplicates if the ingestion person-lookup misses (fuzzy). | Med | `ingestion/adapters/sql-person-lookup` |
| **I-3** | **Orphan risk on partial writes** — commit is per-row transactional (good), but cross-table links (enrollment/fee/contact) created across separate statements; a mid-row failure path needs verification for orphan enrollments/fee rows. | Med | `ingestion/pipelines/students.ts:240-343` |
| **I-4** | **Soft-delete consistency** — verify `deleted_at` is honoured uniformly across every read path (attendance, fees, results, portal) so a soft-deleted learner never leaks. | Med | many routes |
| **I-5** | **Enrollment history validity** — no guard found preventing overlapping active enrollments (two `status='active'` rows for one student). | Med | `enrollments` |

**Integrity is *mostly* good** (person_id model, soft-delete, transactional commit) but leans on
application logic where **database constraints** would be safer. The headline gap is **I-1**.

---

## PHASE 3 — Import Intelligence Engine

**The intelligent engine EXISTS and is genuinely good** — `src/lib/ingestion/`:
parse → **infer schema** (synonyms + memory) → **resolve identity** (exact / fuzzy /
fuzzy-ambiguous / no-match) → **resolve conflict** (`insert | update | merge | skip | orphan |
fail`) → validate → **commit changed columns only**. Honours a `ConflictPolicySet`, learns
mappings (`persistAutoMappings`), routes unresolved rows to `ingestion_orphans`.

This already satisfies much of the prompt's "understand, don't blindly import" requirement.

**But the gaps are real:**

| # | Finding | Severity |
|---|---|---|
| **IMP-1** | **The intelligent engine (v2) has NO dry-run PREVIEW.** `import/v2` runs the pipeline straight to commit. The **preview UI** (`ImportModal`, phases select→preview→importing) drives the **OLD** engine (`import/route.ts`, 1439 lines). So *smart resolution* and *preview* are in **different code paths**. | **High** |
| **IMP-2** | **Two import engines** to maintain (old `import` + new `import/v2`) — divergent behaviour, double the surface, double the bugs. | High |
| **IMP-3** | **No explicit import-resume / batch rollback** — partial success is handled via orphans, but there's no "resume this import" or "undo this whole import batch" affordance. | Med |
| **IMP-4** | **Conflict resolution is policy-driven but not interactive** — the operator can't review per-row "suggested update vs create" and approve, mid-import. | Med |

---

## PHASE 4 — Student Synchronization

**Changed-fields-only update EXISTS** (`updateStudent(... changedFields ...)` — "only update the
columns the conflict resolver said changed"). This is exactly the prompt's requirement (update
phone/fees/class without clobbering correct data). ✅

| # | Finding | Severity |
|---|---|---|
| **SYNC-1** | Sync applies only through the **v2** engine; the preview path (old engine) may not do changed-only updates → risk of overwrite depending on which importer the admin used. | High (ties to IMP-1/2) |
| **SYNC-2** | **Synchronization history** — ingestion writes an audit log, but there's no admin-facing "what did this import change, field-by-field, and can I revert it?" view. | Med |

---

## PHASE 5 — Parent Architecture

**The mature system is `/api/portal/*` + `/portal/*`** and it already models the prompt's target:
- Links created **from evidence** (verified parent phone → `parent_student_links`), matched across
  **ALL schools** (`portal/linking.ts` scans every school's contact/next-of-kin).
- Full auth (login / register / reset / OTP), per-learner **gate** (403 if not linked),
  per-school context, learner attendance/fees/overview, snapshots, notifications, compare.
- One parent → multiple learners → multiple schools → single login: **supported.** ✅

| # | Finding | Severity |
|---|---|---|
| **PAR-1** | **Two parallel parent stacks** — legacy `/api/parent` + `/parent` (OTP, `learnerAccessId`) vs. modern `/api/portal` + `/portal`. Confusing, duplicative, risk of drift. **Consolidate onto portal; retire parent.** | **High** |
| **PAR-2** | **Link auto-approve** defaults ON (phone match auto-grants). Verify this is the intended trust model per school (setting exists: `parent_link_auto_approve`). | Med |
| **PAR-3** | Confirm **soft-deleted / withdrawn** learners disappear from a parent's portal correctly (ties to I-4). | Med |

---

## PHASE 6 — Founder-Dependence Audit (Student Management)

| Workflow | Today | Target (self-service) |
|---|---|---|
| Duplicate learners | Detect/merge/purge UI exists ✅ | Verify merge is safe + reversible; surface from import |
| Broken enrollment / overlapping active | Manual DB | Admin "fix enrollment" tool (I-5) |
| Wrong fees from import | Re-import or manual | Import sync + field-revert (SYNC-2) |
| Broken parent links | `admin/parent-links` exists ✅ | Consolidate on portal (PAR-1) |
| Admission-number collision | App COUNT check (race) | DB constraint (I-1) + admin renumber tool exists (`admissionNumber.ts` renumber) |
| Deleted students | Soft-delete + restore ✅ | Verify restore re-links cleanly |
| Identity corruption (person_id) | **Founder scripts** ❌ | Self-service identity-repair (F0-1) |
| Import gone wrong | No batch undo ❌ | Import batch rollback (IMP-3) |

**Biggest remaining founder hooks:** identity/person_id repair (F0-1) and import batch undo (IMP-3).

---

## PHASE 7 — User Experience Audit

- **Strengths:** rich list (`students/list` 153 KB), wizard, bulk toolbar, duplicates page,
  import preview (old path), id-cards, timeline/history.
- **Gaps:**
  - **UX-1** Bulk *promote* / *transfer* / *restore* exist as APIs but verify each has a
    **preview + undo** in the UI (bulk ops are the highest-blast-radius actions).
  - **UX-2** Validation messages during import/edit should be **plain-language + row-anchored**.
  - **UX-3** The two import entry points (old modal vs v2) confuse operators — unify.
  - **UX-4** 100 KB+ client pages (`StudentTable` 100 KB, `students/list` 153 KB) — heavy;
    candidates for component/code-split (also helps client bundles, not build floor).

---

## PHASE 8 — Execution Roadmap (classified; NOT yet implemented)

Ordered by risk-adjusted value. **Patch = fix/perf/integrity; Minor = architectural.**
Each phase is independently shippable and route-count-aware.

### Patch track (integrity + correctness first — low risk, high trust)

- **SP-1 (patch) — DB uniqueness + integrity constraints.** Add `UNIQUE (school_id,
  admission_no)` (I-1), guard overlapping active enrollments (I-5), audit soft-delete honouring
  across read paths (I-4). *Objective: the database, not app code, guarantees no duplicate/orphan.*
- **SP-2 (patch) — Soft-delete/withdraw leak sweep.** Ensure deleted/withdrawn learners vanish
  from attendance, fees, results, **and portal** (I-4, PAR-3).
- **SP-3 (patch) — Duplicate-merge safety.** Verify merge is transactional, reversible, and
  re-parents all FKs (attendance/fees/results/contacts) — no orphan after merge (I-2).
- **SP-4 (patch) — Bulk-op preview + undo.** Confirm/add preview & undo for bulk promote/
  transfer/suspend/restore (UX-1).

### Minor track (architecture — sequenced, each with a clear objective)

- **SM-1 (minor) — Unify on ONE import engine.** Make `ingestion/` (v2) the single engine and
  give it a **true dry-run PREVIEW** (parse→infer→resolve→**plan**, return the plan without
  committing); wire `ImportModal` to it; retire the 1439-line old importer. *Closes IMP-1/2/4,
  SYNC-1; removes ~1 route + 1400 LOC (helps build memory).* **Objective: one intelligent,
  preview-first, sync-safe import path.**
- **SM-2 (minor) — Import batch history + rollback.** Persist each import as a batch with a
  field-level change log; admin view "what changed" + **undo this batch** (IMP-3, SYNC-2).
  *Objective: imports are never destructive — every import is reviewable and reversible.*
- **SM-3 (minor) — Consolidate parent stacks onto Portal.** Migrate any live `/api/parent`
  consumers to `/api/portal`, retire the legacy stack + `/parent` pages. *Removes routes;
  single multi-school parent login.* **Objective: one parent architecture.**
- **SM-4 (minor) — Self-service identity repair.** Admin-facing, audited, reversible person_id /
  merge / re-link tool that replaces the founder `tmp/*` scripts (F0-1). **Objective: eliminate
  the last founder hook in identity data.**
- **SM-5 (minor) — Student page code-split.** Break up the 100–153 KB student pages into
  lazy-loaded sections (UX-4) — client-bundle win.

### Explicitly deferred / documented as developer-only
- Raw schema migrations (F0-2) — remain developer-owned, documented as such.

---

## Success-criteria mapping

| Criterion | Addressed by |
|---|---|
| Internally consistent data | SP-1, SP-2, SP-3 |
| Intelligent (not destructive) imports | SM-1, SM-2 |
| Safe synchronization of existing records | SM-1 (already partly in v2), SM-2 |
| Duplicate prevention | SP-1 (constraint), SP-3 (merge), SM-1 (identity resolution) |
| Accurate parent relationships | SM-3, PAR-2 |
| Permanent student history | SP-2 (history preserved on delete), SM-2 |
| Admin self-repair | SP-3, SP-4, SM-2, SM-4 |
| Parent Portal fully supported | SM-3 (already ~90% there) |
| Founder-dependence eliminated/documented | SM-4 (identity), F0-2 (documented) |
| Correct patch/minor classification | This roadmap |
