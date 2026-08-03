# Database Migrations

**Three schema-evolution mechanisms coexist in this repository.** That is unusual and worth understanding before you change any schema — using the wrong one silently produces a schema that differs between environments.

| # | Mechanism | Location | Status |
|---|---|---|---|
| 1 | Managed migration runner | `database/migrations/tidb/` | **Use this for all new work** |
| 2 | Legacy loose SQL | `database/migrations/*.sql` | Historical — do not add to |
| 3 | Runtime TypeScript ensure-schema | `src/lib/*/migrations/`, `src/lib/*/schema.ts` | Defensive fallback only |

## 1. Managed runner — the one to use

`scripts/db/migrate.mjs` applies numbered files from `database/migrations/tidb/` and records every run in a `schema_migrations` ledger.

```bash
node --env-file=.env.local scripts/db/migrate.mjs --status    # what's pending
node --env-file=.env.local scripts/db/migrate.mjs --dry-run
node --env-file=.env.local scripts/db/migrate.mjs             # apply
node --env-file=.env.local scripts/db/migrate.mjs --database drais_rehearsal
```

**Design properties worth knowing:**

- **One ledger per database.** Local and TiDB Cloud each keep their own history, so they can legitimately be at different points.
- **An applied migration never re-runs.**
- **Checksums are enforced.** Editing an already-applied migration aborts the run. An edit-after-apply is a *new* migration, not an edit — the `--allow-checksum-drift` escape hatch exists but should be treated as a last resort.
- **Failures are recorded** with `status='failed'` and retried on the next invocation.
- **Idempotency errors are tolerated** on re-run: `1050` (table exists), `1060` (duplicate column), `1061` (duplicate key name), `1091` (can't drop, already gone). TiDB unsupported-operation no-ops are **not** tolerated — they fail loudly rather than pretending to succeed.
- **`.sql` and `.mjs` migrations are both supported.** Use `.mjs` (`export default async ({ query }) => {…}`) for logic SQL can't express — conditional renames, batched dedupes.

### Writing one

Create `database/migrations/tidb/NNN_short_description.sql` with the next number.

```sql
-- What this changes and why. Link the ADR or audit if there is one.
ALTER TABLE some_table ADD COLUMN IF NOT EXISTS new_col BIGINT NULL AFTER other_col;
ALTER TABLE some_table ADD INDEX IF NOT EXISTS idx_some_new (school_id, new_col);
```

Rules:

- **Additive and idempotent.** `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ADD INDEX IF NOT EXISTS`.
- **New tenant tables need `school_id`** — per-school backup, export, and delete discover tables by that column. Without it (and without an FK path to a table that has it), your table is treated as global and silently excluded from per-school operations.
- **Never destructive without a plan.** Dropping a column or table is not reversible by re-running.
- **Comment the intent.** The next engineer reads the migration to learn why the column exists.

## 2. Legacy loose SQL — do not add to

`database/migrations/*.sql` (numbered `001`–`016`+) predates the managed runner and is **not tracked in any ledger**. There is no record of what has been applied where.

Alongside it, `database/` contains ~80 historical `.sql` files (`FINAL_SCHEMA_v4.0_…`, `consolidated_schema.sql`, `production_init.sql`). These are archaeological and **not authoritative**.

**The authoritative current schema is the live database**, captured periodically in `database/exports/` (e.g. `drais-1.48.2-schema.sql`) and catalogued in [`TABLE_DICTIONARY.md`](TABLE_DICTIONARY.md).

Note that the managed `tidb/` folder does not contain the *base* schema either: `001_canonical_core_tables.sql` creates only ~16 attendance/biometric/notification/device tables. Foundational tables (`schools`, `students`, `users`, `staff`) predate the managed system entirely.

## 3. Runtime ensure-schema — defensive fallback

Several subsystems create their own tables lazily at runtime from TypeScript, using a promise-gated `ensureXSchema()` called at the top of every exported function:

- `src/lib/attendance/time-intelligence/schema.ts` — `ensureTimeIntelligenceSchema()`, `ensureFirstArrivalSchema()`
- `src/lib/backup/schema.ts` — `ensureBackupSchema()`
- `src/lib/{attendance,biometric,devices,notifications}/migrations/*.ts`

**These duplicate a managed migration; they do not replace it.** The pattern exists so a developer machine or a self-hosted install that has not run the migration script still works. The managed `.sql` file remains the source of truth.

**If you add one, add the matching migration too.** Keeping them in sync is manual, and drift between them is exactly the failure this section exists to warn about.

## When schema and code disagree

The live database wins. Regenerate [`TABLE_DICTIONARY.md`](TABLE_DICTIONARY.md) and reconcile — do not assume a `.sql` file in `database/` reflects reality.

## Related

- [`../MIGRATION_RUNBOOK.md`](../MIGRATION_RUNBOOK.md) — running migrations safely against production
- [`TABLE_DICTIONARY.md`](TABLE_DICTIONARY.md) — every table, scope, and soft-delete status
- [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) — the day-to-day workflow
