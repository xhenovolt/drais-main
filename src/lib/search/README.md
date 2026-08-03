# `src/lib/search/` — Global search

The command palette. One projection table, ranked in application code, permission-filtered at query time.

## Why a projection table and not FULLTEXT

TiDB portability. Rather than depend on a `FULLTEXT` index, source tables are projected into `search_index` rows and ranking happens in app code. That keeps search working identically on TiDB Cloud and on the local MySQL of the desktop build ([ADR-0010](../../../docs/adr/0010-dual-database-mode.md)), and it makes ranking debuggable — you can read the scoring function.

## How a query resolves

```
1. tokenize; match rows whose search_text contains EVERY token
   (AND semantics — "S2 unpaid" narrows, it doesn't widen)
2. pull a BOUNDED candidate set, filtered by school_id + permitted types
3. score in app code:
      exact title  >  title-prefix  >  token-coverage
      × entity rank_weight
      + typo tolerance (Levenshtein ≤ 1 per token, so "Musa" finds "Musab")
```

**Every query is hard-filtered by `school_id`.** Search touches every entity type in the system, which makes it the single place where a missing tenant filter would leak the most.

## Permissions are enforced in the query, not the results

Each entity type declares the RBAC codes that allow seeing it, **match-any**: holding any one of them qualifies, so view-and-manage roles both work without enumerating combinations.

The search only queries entity types whose permission the caller actually holds. Filtering after the fact would still expose result counts and would waste the work; not filtering at all would turn the palette into a permission bypass. Super-admin sees all types.

## Files

| File | Purpose |
|---|---|
| `entities.ts` | The registry: per type, the permitted RBAC codes (real codes from [`rbac/catalog.ts`](../rbac/catalog.ts)), a base `rank_weight` for tie-breaking, and a label + icon hint for grouping. |
| `indexer.ts` | `reindexSchool(schoolId, type?)` for bulk rebuilds and `reindexEntity(schoolId, type, id)` for incremental upserts. Mutation routes call the latter fire-and-forget after a write. |
| `query.ts` | Tokenization, candidate fetch, scoring. |

## Working in this folder

- **Adding an entity type?** Register it in `entities.ts` with real catalog codes, add a builder in `indexer.ts`, and call `reindexEntity` from that entity's write paths. Miss the last step and the type is searchable but permanently stale.
- **Builders must be individually defensive.** A missing optional table or column must not break indexing of the other types — each builder is wrapped by the caller for exactly this reason.
- **Keep the candidate set bounded.** Scoring in app code is only viable because the SQL stage limits how much comes back.
- **Never widen to OR semantics.** Adding a token must narrow results; a palette that returns more as you type more is unusable.

## Known constraints

- **The index is eventually consistent.** A record is unsearchable until reindexed; a write path that forgets `reindexEntity` leaves it stale indefinitely.
- **No stemming or synonyms** — token containment plus Levenshtein ≤ 1.
- **Ranking is per-request, not learned.** `rank_weight` is static.
- **Deletes must be propagated explicitly**, or a soft-deleted record keeps appearing.

## Dependencies

`src/lib/db` · `src/lib/rbac` (permission codes)

## Related

[`../rbac/README.md`](../rbac/README.md) · [ADR-0010](../../../docs/adr/0010-dual-database-mode.md)
