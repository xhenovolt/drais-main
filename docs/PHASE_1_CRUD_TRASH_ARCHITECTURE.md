# Phase 1 — Universal CRUD + Trash Management Architecture

> **Mission:** DRAIS must never require direct SQL access or founder
> intervention for normal operational data management. The database is an
> implementation detail. All operational control lives in the UI.
>
> **Non-negotiable safety:** every destructive action is reversible,
> permissioned, audited, and dependency-aware. Trash is not a feature —
> it is the *default* behaviour.

---

## 1. Architecture analysis

### What already exists (do not duplicate)

- **37 tables already carry `deleted_at`** (people, staff, students,
  classes, streams, subjects, terms, departments, enrollments, exams,
  result_types, schools, users, roles, payroll_definitions, salary_payments,
  branches, biometric_devices, attendance_sessions, class_results,
  expenditures, tahfiz_results, workplans, …). Soft delete is the
  *de-facto* convention — Phase 1 formalises it.
- **`audit_logs` table** — `school_id`, `user_id`, `action`,
  `entity_type`, `entity_id`, `old_values` JSON, `new_values` JSON,
  `ip_address`, `user_agent`, `status`, `action_type`, `details`,
  `source`, `created_at`. Rich; production-ready.
- **`logAudit(entry)` helper** in `src/lib/audit.ts` — writes to
  `audit_logs`, swallows errors by default, has a `strict: true` mode for
  unit-tests, and exposes the `AuditAction` constant catalog.
- **`requirePermission()` and `userCan()`** in `src/lib/rbac.ts` —
  string-coded permission checks, super-admin bypass, NextResponse
  helper variants.
- **`GET /api/admin/audit-logs`** — paginated, filterable; admins can
  already see the audit trail.

### What is missing (Phase 1 must build)

| Concern | Today | Phase 1 target |
|---|---|---|
| `deleted_by`, `delete_reason`, `restored_at`, `restored_by` columns | None | Added to every soft-delete table |
| Central trash service | None — every route soft-deletes ad-hoc | `src/lib/trash/service.ts` reusable |
| Entity registry | None — knowledge of "what is archivable" is scattered | `src/lib/trash/registry.ts` central catalog |
| Trash UI | None — archived rows are invisible to admins | `/admin/trash` page with tabs, search, actions |
| Dependency analysis | None | `getDependencies(entity, id)` returns counts of FK references before purge |
| Per-action permissions | Only `staff.delete` exists | `trash.archive`, `trash.restore`, `trash.purge` global perms + per-entity refinement later |
| Restore flow | Schools manually `UPDATE` SQL when something disappears | One-click restore from UI |
| Permanent delete | Hard `DELETE FROM` scattered | Centralised, super-admin-only, dependency-aware |

---

## 2. Founder-dependent bottlenecks (identified, fixed in Phase 1)

The brief lists this category of recurring escalations. Concrete examples
the trash system removes:

1. **"Learner accidentally deleted"** → admin calls founder → founder
   runs `UPDATE students SET deleted_at = NULL WHERE id = ?`. Replaced
   by: admin opens `/admin/trash`, finds the learner, clicks Restore.
2. **"Wrong subject archived from a class"** → SQL. Replaced by trash
   UI restore.
3. **"We need to permanently remove a duplicate parent record"** → SQL.
   Replaced by purge flow with dependency preview + super-admin confirm.
4. **"Audit needed: who deleted this last term?"** → SQL on
   `audit_logs`. Replaced by the trash UI showing `deleted_by` +
   `deleted_at` on every archived row, with a link to the full audit
   entry.

---

## 3. Schema strategy

### Universal soft-delete columns

Every table that currently has `deleted_at` gets four additional columns
in one migration (`migrations/phase_1_soft_delete_columns.sql`):

```sql
ADD COLUMN deleted_by    BIGINT       NULL,
ADD COLUMN delete_reason VARCHAR(500) NULL,
ADD COLUMN restored_at   DATETIME     NULL,
ADD COLUMN restored_by   BIGINT       NULL;
```

**Why no FK to `users(id)` on `deleted_by` / `restored_by`?**

`users.id` is school-scoped; over time users can be archived themselves.
A FK would force ON DELETE SET NULL semantics and create cycle risks
(user table soft-deletes its own rows). Keeping `deleted_by` / `restored_by`
as plain BIGINT references with no FK gives us flexibility — the trash
service joins on demand and tolerates orphaned IDs cleanly.

### Convention semantics

| State | `deleted_at` | `restored_at` |
|---|---|---|
| Active (never archived) | NULL | NULL |
| Active (was restored once before) | NULL | not NULL |
| Archived (first time) | not NULL | NULL |
| Archived (was restored, re-archived) | not NULL | not NULL, but `< deleted_at` |

The trash service treats `deleted_at IS NOT NULL` as the *sole* truth
for "archived"; `restored_at` is informational (audits, "this learner
has been restored before — admin double-check").

---

## 4. Entity registry

`src/lib/trash/registry.ts` is a typed catalog of every entity that
participates in the trash system. Adding a new entity = one entry.

```ts
interface EntityDescriptor {
  code:           string;          // 'student', 'staff', 'subject'
  label:          string;          // 'Learners', 'Staff', 'Subjects'
  pluralLabel:    string;
  tableName:      string;          // physical table
  primaryKey:     string;          // 'id'
  schoolIdColumn: string | null;   // 'school_id' or null for global
  /** SELECT columns for the trash display row. Must include `id`,
   *  `deleted_at`, `deleted_by`, `delete_reason`, `restored_at`. */
  displaySelect:  string;
  /** JOINs needed to compute the display label (e.g. JOIN people for staff). */
  displayJoins?:  string;
  /** Free-text search predicate; receives the search term as `?`. */
  searchPredicate?: (term: string) => { sql: string; params: unknown[] };
  /** Tables that reference this entity (for dependency analysis). */
  dependencies:   DependencyRule[];
  /** Permission codes used by the trash service. */
  permissions: {
    archive: string;
    restore: string;
    purge:   string;
  };
  /** Optional hook: invoked after archive/restore/purge for side-effects
   *  (e.g. cascade-archive enrollments when a student is archived). */
  onArchive?:     (id: number, schoolId: number) => Promise<void>;
  onRestore?:     (id: number, schoolId: number) => Promise<void>;
}

interface DependencyRule {
  tableName:  string;
  fkColumn:   string;
  label:      string;     // "report cards", "attendance records"
  /** If true, this dependency is blocking — purge requires it to be archived first. */
  blocking?:  boolean;
}
```

### Initial entity coverage (Phase 1 release)

The registry ships with these 12 entries — covering the operational
surface where admins most often need to archive / restore / purge:

`student`, `staff`, `class`, `stream`, `subject`, `department`, `term`,
`academic_year`, `result_type`, `exam`, `role`, `user`.

Other entities (workplans, biometric_devices, expenditures, etc.) can
be added in follow-up rounds; the schema migration prepares them, the
registry simply hasn't enumerated them yet.

---

## 5. Trash service (reusable core)

`src/lib/trash/service.ts` exposes five idempotent operations:

### `archiveEntity({ code, id, schoolId, userId, reason, ip, userAgent })`

1. Look up descriptor by `code`. Reject if unknown.
2. Verify the row exists, belongs to the caller's school, and is **not
   already archived**.
3. `UPDATE <table> SET deleted_at = NOW(), deleted_by = ?, delete_reason = ?
   WHERE id = ? AND school_id = ? AND deleted_at IS NULL`.
4. Write `audit_logs` entry: action `ARCHIVED_<ENTITY>`,
   old_values = pre-state, new_values = post-state.
5. Invoke `descriptor.onArchive` if defined (cascade hook).
6. Return `{ ok: true, id }`.

### `restoreEntity({ code, id, schoolId, userId, ip, userAgent })`

1. Verify the row exists, belongs to school, **is archived**.
2. `UPDATE <table> SET deleted_at = NULL, restored_at = NOW(), restored_by = ?
   WHERE id = ? AND school_id = ? AND deleted_at IS NOT NULL`.
3. Audit log entry `RESTORED_<ENTITY>`.
4. Invoke `descriptor.onRestore`.

### `purgeEntity({ code, id, schoolId, userId, confirmation, ip, userAgent })`

1. Require `confirmation === true` in the body. Reject otherwise.
2. Require super-admin (`session.isSuperAdmin`).
3. Run `getDependencies` first; if any blocking dependency has live
   rows, refuse with structured 409 listing them.
4. `DELETE FROM <table> WHERE id = ? AND school_id = ?`. Cascade FKs
   handle their own children.
5. Audit log entry `PURGED_<ENTITY>` with full pre-state in `old_values`.

### `listTrash({ schoolId, code?, search?, page, limit })`

- If `code` provided, filter to that entity. Otherwise union across
  every registry entry into a paginated "all archived" view.
- Returns: `{ entity, id, label, archived_at, archived_by_name,
  delete_reason, restored_before }`.
- The label is computed from `descriptor.displaySelect`.

### `getDependencies({ code, id, schoolId })`

- For each `descriptor.dependencies`, run
  `SELECT COUNT(*) FROM <dep.tableName> WHERE <dep.fkColumn> = ?
   AND deleted_at IS NULL`.
- Return `{ dependencies: [{ label, count, blocking }] }`.
- Used by the purge confirmation modal: "This will affect 14 report
  cards and 3 attendance records."

---

## 6. API design

Five generic admin endpoints. No per-entity routes — the registry is the
source of truth.

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/admin/trash`                       | Paginated list of archived items. `?entity=`, `?search=`, `?page=`, `?limit=` |
| `POST` | `/api/admin/trash/archive`               | Body `{ entity, id, reason? }` — soft-delete |
| `POST` | `/api/admin/trash/restore`               | Body `{ entity, id }` — un-archive |
| `POST` | `/api/admin/trash/purge`                 | Body `{ entity, id, confirmation: true }` — hard delete (super-admin) |
| `POST` | `/api/admin/trash/dependencies`          | Body `{ entity, id }` — preview FK impact before purge |

Existing entity-specific delete routes (e.g. `DELETE /api/staff/[id]`)
continue to work and are *encouraged* to delegate to
`archiveEntity()` internally so all soft-delete paths converge on one
implementation. Phase 1 doesn't force the rewrite — it provides the
target and migrates one reference entity (students) to demonstrate the
pattern.

---

## 7. Permission system

### Global permissions (seeded by `phase_1_trash_permissions.sql`)

| Code | Default holders |
|---|---|
| `trash.read`    | Admin, Super Admin |
| `trash.archive` | Admin, Super Admin (also implied by entity-specific `<entity>.delete`) |
| `trash.restore` | Admin, Super Admin |
| `trash.purge`   | **Super Admin only** — hard delete is dangerous |

### Per-entity refinement (later phases)

Each `EntityDescriptor.permissions` can override the global default
with a more specific code (e.g. `students.archive`,
`students.restore`, `students.purge`). Phase 1 seeds the global
codes; per-entity codes are added as needed by ops policy.

---

## 8. Audit log architecture

Every trash operation writes:

```ts
{
  action: 'ARCHIVED_STUDENT' | 'RESTORED_STUDENT' | 'PURGED_STUDENT' | ...
  entity_type: 'student',
  entity_id:   123,
  old_values:  <row before action>,
  new_values:  <row after action> | null for purge
  ip_address, user_agent, source: 'WEB',
}
```

The action constant is added to `AuditAction` in `src/lib/audit.ts`:
`ARCHIVED_<ENTITY>`, `RESTORED_<ENTITY>`, `PURGED_<ENTITY>` per
entity. Generic fallback `ARCHIVED_ENTITY` / `RESTORED_ENTITY` /
`PURGED_ENTITY` for entities not yet listed individually.

---

## 9. Trash UI

`/admin/trash` page:

- **Tabs** along the top: All / Learners / Staff / Classes / … driven
  by the registry, dynamically.
- **Search box** — full-text across the entity's display label.
- **Table** — one row per archived item, columns: Name, Type, Archived
  on, Archived by, Reason.
- **Per-row actions:**
  - **Restore** — instant, returns the entity to active state.
  - **Purge** — opens dependency-preview modal first, requires explicit
    confirmation; super-admin gated.
- **Bulk actions** — checkbox column → Restore Selected / Purge Selected.
- **Loading states** — SWR-backed; optimistic update on restore (re-fetch
  on success) and on purge (re-fetch after dep check).

Existing entity detail pages (e.g. `/staff/[id]`) gain an **Archive**
button that calls `POST /api/admin/trash/archive` — gradually retiring
the per-route soft-delete logic.

---

## 10. Dependency-handling strategy

Two dependency classes:

| Class | Example | Behaviour on purge |
|---|---|---|
| **Hard** (FK with ON DELETE CASCADE, or FK with RESTRICT) | `class_results.class_id` → `classes.id` | DB-level cascade or explicit rejection |
| **Soft** (foreign reference, no DB FK) | `audit_logs.entity_id` ↔ student | Counted only; doesn't block |

The registry's `dependencies: [{ blocking: true }]` array drives the
pre-purge UI warning. The DB still has the final say via its own FK
constraints.

---

## 11. Migration strategy

Two migrations:

### `migrations/phase_1_soft_delete_columns.sql`

`ALTER TABLE <each table with deleted_at> ADD COLUMN deleted_by …,
ADD COLUMN delete_reason …, ADD COLUMN restored_at …,
ADD COLUMN restored_by …`. Idempotent via `IF NOT EXISTS`-style
column-existence guards (a stored-procedure helper because MySQL
doesn't support `ADD COLUMN IF NOT EXISTS` in stable releases — TiDB
8.0+ supports it).

### `migrations/phase_1_trash_permissions.sql`

`INSERT IGNORE` 4 rows into `permissions`. Grant the new permissions
to `admin` and `super_admin` system roles via `INSERT IGNORE` into
`role_permissions`.

Both migrations are **additive, idempotent, and reversible**.

---

## 12. Edge cases

| Case | Behaviour |
|---|---|
| Archiving an already-archived row | 409 with `{ code: 'ALREADY_ARCHIVED' }` |
| Restoring a not-archived row | 409 with `{ code: 'NOT_ARCHIVED' }` |
| Purging without `confirmation: true` | 400 `{ code: 'CONFIRMATION_REQUIRED' }` |
| Purging when blocking dependencies exist | 409 `{ code: 'DEPENDENCIES_PRESENT', dependencies: [...] }` |
| Cross-school access via guessed id | 404 (do not leak existence) |
| User who archived has since been deleted | `deleted_by_name` shows "unknown user" — no crash |
| Snapshot already references archived student | Snapshot stays intact (frozen by design); restoring student doesn't retroactively change snapshots |

---

## 13. Testing strategy

- **Unit tests** for the trash service: archive → verify columns, audit
  row written, no double-archive; restore → verify reset; purge →
  verify deps check + super-admin gate.
- **Integration tests** per API route: 401 / 403 / 404 / 409 / 200.
- **Snapshot byte-equivalence test** — regenerate every existing
  `status='ready'` snapshot after Phase 1 migration → `meta.dataHash`
  unchanged. (Phase 1 must not affect any frozen snapshot output.)

---

## 14. Production rollout

1. Apply `phase_1_soft_delete_columns.sql` (online ALTER, fast).
2. Apply `phase_1_trash_permissions.sql` (INSERT IGNORE).
3. Deploy app — new `/admin/trash` page becomes visible to admins.
4. Migrate per-entity delete routes to `archiveEntity()` incrementally
   (one entity per follow-up commit).
5. Snapshot regeneration test in CI.

Rollback: drop the new columns, revoke the new permissions. Code
rollback is a single `git revert`.

---

## 15. Rollout list (entities still to wire into the trash UI)

Phase 1 release ships registry entries for 12 entities. Remaining
entities below get added in follow-up rounds — schema is already
ready (Phase 1 migration applied to all 37 soft-delete tables); only
the registry entry + dependency rules are needed.

- `branch`, `village`, `contact`
- `attendance_session`, `manual_attendance_entry`
- `enrollment`, `promotion`
- `biometric_device`, `device`
- `notification`, `announcement`
- `workplan`
- `expenditure`, `salary_payment`, `payroll_definition`, `waiver_discount`
- `marks_migration_policy`, `result_types`
- `feature_flag`
- `tahfiz_results`

Each takes ~15 lines in `registry.ts`.

---

**End of Phase 1 architecture.**
