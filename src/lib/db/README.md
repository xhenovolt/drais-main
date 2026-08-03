# `src/lib/db/` — Database mode, pools and runtime configuration

DRAIS runs against **two possible databases** and this folder decides which one a query goes to.

The query API itself (`query()`, `getConnection()`) lives in [`src/lib/db.ts`](../db.ts); this folder is what sits underneath it.

## The dual-mode model

| Mode | Database | Used by |
|---|---|---|
| `online` | TiDB Cloud | Hosted/production — the source of truth |
| `local` | Local MySQL | The packaged desktop app, offline use |

The UI chooses the mode; **the server resolves it**. Frontend buttons cannot mutate `process.env` after boot, so mode is a server-side runtime value — a module variable in the single-process desktop build.

**On serverless, local mode is impossible** — there is no localhost MySQL next to a Vercel lambda. The resolver therefore *forces* `online` unless a deployment explicitly opts in with `DRAIS_ALLOW_LOCAL`. Failing closed here prevents a hosted deployment from silently trying to reach a database that cannot exist. See [ADR-0010](../../../docs/adr/0010-dual-database-mode.md).

## Files

| File | Purpose |
|---|---|
| `db-mode.ts` | Resolves the effective mode, including the serverless override. |
| `pools.ts` | One cached pool **per mode**. Retry/backoff, keep-alive and the TiDB-safe options (`timezone: 'Z'`, `bigNumberStrings`) are preserved verbatim from the original single-pool implementation — online behaviour is unchanged; only "which config" is new. |
| `runtime-config.ts` | Lets an admin change DB credentials from the UI, which matters because the packaged desktop build has no source access. `read()` masks secrets, `test()` tries a connection without persisting, `apply()` updates env live, resets the pools (effective on the next query, no restart) and persists to `DRAIS_CONFIG_FILE` (`userData/drais.env`) so it survives restarts. |
| `students.ts` | A few shared student list queries. Not infrastructure — it happens to live here. |

## Working in this folder

- **`timezone: 'Z'` is load-bearing.** DRAIS stores instants and derives local dates explicitly ([ADR-0004](../../../docs/adr/0004-timezone-safe-dates.md)). A driver that helpfully converts timezones would corrupt attendance dates. Don't "fix" it.
- **`bigNumberStrings` likewise.** TiDB bigints exceed JS number precision; silently losing the low bits of an id is not a hypothetical.
- **Don't add a third pool keyed by anything but mode.** Per-school or per-request pools would exhaust connections on serverless.
- **Never log or return unmasked credentials** from `runtime-config.ts`.

## Known constraints

- **Mode is process-wide.** A single process cannot serve one request from local and another from online.
- **`apply()` mutates `process.env` at runtime.** Sound in the single-process desktop build; on serverless it affects only the current instance, which is why credential changes there belong in the hosting environment.
- **Pool resets drop in-flight connections.** Changing credentials mid-request will fail that request.

## Dependencies

`mysql2/promise` · `node:fs` / `node:path` / `node:os` (desktop config file)

## Related

[ADR-0010](../../../docs/adr/0010-dual-database-mode.md) · [ADR-0004](../../../docs/adr/0004-timezone-safe-dates.md) · [`docs/database/MIGRATIONS.md`](../../../docs/database/MIGRATIONS.md) · [`docs/database/TABLE_DICTIONARY.md`](../../../docs/database/TABLE_DICTIONARY.md) · [`docs/MIGRATION_RUNBOOK.md`](../../../docs/MIGRATION_RUNBOOK.md)
