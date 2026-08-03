# `src/lib/backup/` — Database Backup Center

School-scoped SQL backups: discover every table belonging to a school, dump it, compress, split, upload to Cloudinary, verify.

## Responsibilities

Produce a **restorable, standard SQL file** for one school's complete dataset, uploaded to durable cloud storage, fully audited. There is deliberately **no full-database mode** — every backup is scoped to a single school.

## Why it looks the way it does

Two external constraints shape the whole design, and neither is negotiable from inside this module:

**1. Short serverless timeouts, no durable background worker.** A backup of a school with years of attendance cannot run in one HTTP request. So generation is a **client-driven step loop**: the browser calls `start`, then `step` repeatedly (each call bounded), then `finalize` repeatedly. Progress is written to **TiDB between steps** — not local disk, which is not shared across serverless invocations.

**2. Cloudinary's ~10MB raw-file ceiling.** Real backups exceed it even gzipped. So the assembled file is **split into parts** under the cap, each an independently valid gzip stream, uploaded one per invocation.

## Pipeline

```
start      discover tables → COUNT(*) pre-flight → create backup_records row
  │              (pre-flight sets the "this is large" warning up front)
step ×N    per table: SHOW CREATE TABLE + batched INSERTs → gzip → backup_chunks
  │
finalize   assemble + sha256 over the FULL file → split into ≤7MB parts
  ×N       → upload one part per call → verify → completed
```

## Files

| File | Purpose |
|---|---|
| `discovery.ts` | Which tables belong to a school, and the `WHERE` clause to scope each |
| `generator.ts` | `SHOW CREATE TABLE` DDL, batched row dumps, the `esc()` value escaper |
| `assembly.ts` | Concatenate, checksum, split into upload parts |
| `cloudinaryUpload.ts` | `resource_type: 'raw'` chunked upload; delete |
| `verify.ts` | Integrity gate before a backup may be marked `completed` |
| `orchestrator.ts` | The shared core both route families call |
| `schema.ts` | Runtime ensure-schema fallback for the three tables |

## Table discovery — no hardcoded list

`discovery.ts` classifies every table by walking `information_schema`:

- **`direct`** — has a `school_id` column → `WHERE school_id = ?`
- **`indirect`** — reachable by FK to a school-scoped table → nested `WHERE col IN (SELECT id FROM parent WHERE school_id = ?)`, built from a BFS path
- **global** — no path to `schools` → **excluded** from school backups

This is why a new module's tables are picked up automatically: give a table a `school_id` column (or an FK to something that has one) and it is backed up without touching this code.

> The BFS terminates when an edge reaches `schools` and compares that edge's own column directly (`school_id = ?`). It does **not** wrap `schools` in another subquery — `schools` has no `school_id` column, so doing that silently matches nothing. This was a real bug caught in testing.

## Auth — two entry points, one core

DRAIS has two separate auth systems ([ADR-0008](../../../docs/adr/0008-two-auth-systems.md)), so this module is factored as **plain functions taking a resolved `schoolId`**:

- `/api/backup/*` — school admins. `getSessionSchoolId` + `requirePermission`. **Always `session.schoolId`, never client-supplied.**
- `/api/control-center/backup/*` — `getControlSession` + `canManage`, operator picks any single school.

**Reuse the logic, not the auth.** This is the reference implementation of that pattern.

## Extension guidelines

- **Every step must stay bounded.** A new stage that scales with data size breaks the timeout guarantee. Make it iterative and driven by the client loop.
- **Persist between steps.** Anything held only in request memory is lost across invocations.
- **Keep `finalize` idempotent.** It can legitimately be called again after a failure; `assembleAndSplit` clears leftover part rows before recomputing precisely because insert-then-delete is not atomic across statements.
- **Adding a storage backend?** Implement alongside `cloudinaryUpload.ts` with the same one-part-per-call contract. The `backup_parts` table is already provider-agnostic.

## Known constraints

- **Restore is not implemented.** Backups are generated, verified, and downloadable; restoring is a manual database operation. This is the largest gap.
- **Multi-part downloads** return a manifest page, not one file — parts must be concatenated in order before restoring.
- **Cloudinary's free-tier ceiling** is the binding limit; a school large enough to exceed it even split will fail loudly rather than truncate.
- **The client must stay on the page.** Closing the tab mid-run leaves the backup `generating`; `backup_records` is durable so it is visible and diagnosable, but nothing resumes it automatically.
- **`backup_chunks` rows are retained on failure** deliberately, for diagnosis. They are cleaned up on success.

## Dependencies

`src/lib/db` · `cloudinary` (`CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET`) · `src/lib/audit.ts` · `src/lib/control/auth.ts` (control routes only)

## Related

[ADR-0008](../../../docs/adr/0008-two-auth-systems.md) · [ADR-0010](../../../docs/adr/0010-dual-database-mode.md) · [`docs/database/MIGRATIONS.md`](../../../docs/database/MIGRATIONS.md) · migration `044_backup_center.sql`
