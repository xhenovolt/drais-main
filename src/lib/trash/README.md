# `src/lib/trash/` — Universal soft-delete and restore

One registry, one service, one API. Every destructive admin action in DRAIS routes through here so that soft-delete, audit logging, permission gates and dependency analysis are uniform instead of reimplemented per feature.

## Responsibilities

Archive, restore, list, preview dependencies, and (rarely) purge — for any registered entity, without per-entity routes or duplicated SQL.

## The model

```
registry.ts          one EntityDescriptor per archivable thing
      │
      ▼
service.ts           archive · restore · list · dependencies · purge
      │
      ▼
/api/admin/trash     ?entity=student
```

**Adding a new entity is one descriptor.** No new route, no new SQL. A descriptor declares the table, primary key, school-scope column, the display `SELECT` (which must include `id`, `deleted_at`, `deleted_by`, `delete_reason`, `restored_at`), any joins, a search predicate, cascade dependencies, and the permission codes.

## Archive is not delete

**`archiveEntity` never hard-deletes.** It flips `deleted_at`. That is what makes every destructive action in the admin UI reversible, and it is why the Trash UI can offer restore at all.

**`purgeEntity` is the only path that physically removes rows**, and it requires super-admin, explicit confirmation, and a dependency check.

## Dependencies: blocking vs informational

A `DependencyRule` describes a foreign-key reference into the entity. Before a purge, the service computes what would be affected — "deleting this learner will affect 14 reports and 3 attendance records".

- **`blocking: true`** — the API refuses the purge until those rows are cleared.
- **Default (non-blocking)** — informational. The operator sees the impact and decides.

Most dependencies are informational on purpose. Making everything blocking would produce an un-purgeable database; making nothing blocking would let a purge silently orphan rows that matter.

## Files

| File | Purpose |
|---|---|
| `registry.ts` | `EntityDescriptor` and the descriptors themselves. The single source of truth for what is archivable. |
| `service.ts` | The five functions. Uniform audit, permissions and scoping for all of them. |

## Working in this folder

- **Register, don't special-case.** A bespoke delete route somewhere else in the codebase is a bug — it will lack audit, restore or dependency analysis, and nobody will notice until a school asks for something back.
- **Include the five lifecycle columns in `displaySelect`** or the Trash UI cannot render the row.
- **Mark a dependency blocking only when orphaning would corrupt data**, not merely when it would be untidy.
- **Run `npm run trash:verify`** (`scripts/verify-trash-descriptors.mts`) after touching the registry — it checks descriptors against the actual schema, which is what catches a renamed column before a school sees a broken tab.

## Known constraints

- **Restore does not resurrect cascaded children automatically** in every case — check the entity's `dependencies` before assuming a restore is complete.
- **Soft-deleted rows stay in their tables.** They count toward table size and every query elsewhere must remember `deleted_at IS NULL`.
- **Purge is not transactional across every dependent table.**

## Dependencies

`src/lib/db` · `src/lib/audit` · `src/lib/rbac`

## Related

[`docs/PHASE_1_CRUD_TRASH_ARCHITECTURE.md`](../../../docs/PHASE_1_CRUD_TRASH_ARCHITECTURE.md) · [`docs/database/TABLE_DICTIONARY.md`](../../../docs/database/TABLE_DICTIONARY.md) · [`scripts/verify-trash-descriptors.mts`](../../../scripts/verify-trash-descriptors.mts)
