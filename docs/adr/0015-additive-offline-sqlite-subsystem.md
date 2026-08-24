# ADR-0015: Add an isolated SQLite execution path

- **Status:** Accepted
- **Date:** 2026-08-24
- **Supersedes:** The SQLite rejection in [ADR-0010](0010-dual-database-mode.md) for new local installs; local-MySQL remains supported.
- **Affects:** `src/lib/repo/`, `src/app/api/students/offline/`, Electron/Capacitor local runtime work

## Problem

DRAIS needs a credible path to local persistence without risking the live TiDB/MySQL application. The existing application has hundreds of raw MySQL queries and several MySQL-specific SQL assumptions. A database swap would therefore be a product rewrite disguised as a configuration change.

## Context

DRAIS is a Next.js 15 App Router application. Hosted deployments use TiDB Cloud through `mysql2/promise`. Electron and Android run the same Next standalone server locally. The application already has a typed repository boundary and a `local-sqlite` mode resolver, but existing routes intentionally remain on the established `src/lib/db.ts` path.

The SQLite driver is `better-sqlite3`, an optional native dependency. It must be dynamically imported behind local-sqlite route boundaries so hosted builds do not load it unnecessarily. The local file defaults to `~/.drais/local.sqlite` and can be overridden with `DRAIS_SQLITE_PATH`.

## Decision

Introduce SQLite additively under `src/lib/repo/` and expose new, explicitly local route namespaces. The first vertical slice is the minimal student identity workflow at `/api/students/offline` and `/api/students/offline/[id]`.

The governing rules are:

1. Existing production routes, pages, TiDB access, auth architecture, attendance ingestion, and Control Center auth remain intact.
2. Existing routes are not migrated merely to make them SQLite-compatible.
3. New local routes use typed repositories and services, not raw SQL from UI code.
4. Tenant scope comes from the authenticated session/local-install invariant, never from a request-provided school id.
5. Multi-row writes use one SQLite transaction.
6. `local-sqlite` is not exposed as a general mode switch until enough routes exist to make that switch useful.
7. Synchronization, conflict resolution, and mobile-native SQLite adapters are deferred.

## Alternatives considered

**Full database migration.** Rejected because it would require rewriting live routes, schema assumptions, and production behavior at once.

**Rewrite DRAIS around SQLite.** Rejected because it creates a second application and discards the working TiDB deployment.

**Direct SQLite access from UI.** Rejected because it bypasses server authentication, tenant isolation, validation, transactions, and the Next server boundary.

**Additive SQLite subsystem.** Chosen. It gives a reversible vertical slice and preserves the online product.

**Dual-database abstraction for every existing route.** Deferred. The repository contract exists for deliberately selected domains, but forcing all raw-query routes through it now would create a broad regression surface.

**Offline-first plus synchronization immediately.** Deferred. Local persistence is a prerequisite, not synchronization. Conflict policy, durable outbox semantics, identity, and recovery must be designed and tested separately.

## Trade-offs

- The online and offline paths may duplicate business behavior and can drift until shared pure logic is extracted deliberately.
- `better-sqlite3` is native and must be packaged/rebuilt for Electron; it is not a Vercel-safe universal driver.
- SQLite has a single-writer model and different SQL/date/locking semantics.
- The current local file is plain SQLite, not SQLCipher-encrypted; no real school data should be provisioned until at-rest protection is decided.
- A working route does not make the whole application offline-first.

## Consequences

The repository layer can be tested against real SQLite without TiDB. New offline routes can be added without modifying the  existing online route set. The Control Center now documents the boundary, route pattern, runtime constraints, and readiness score.

The current state is:

- Local database: **yes**, for the implemented subsystem.
- Offline application: **partial**, limited to offline auth and the separate student identity slice.
- Offline-first architecture: **not complete**, because no sync engine, outbox, conflict handling, or broad UI integration exists.

## Migration notes

No production database is migrated. `local-mysql` remains available for existing installations. `local-sqlite` is selected only by deliberately written code and environment/configuration that permits local mode. Existing `db.ts`, `db/pools.ts`, and online route behavior remain unchanged.

## Related systems

- `src/lib/repo/contract/`
- `src/lib/repo/sqlite/`
- `src/lib/repo/offline-auth/`
- `src/lib/repo/offline-students/`
- `src/app/api/students/offline/`
- `docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md`
- `src/app/control/docs/offline-sqlite/page.tsx`

## Future considerations

Before production local data: add a managed SQLite migration ledger, encryption at rest, packaging tests for Electron, and a supported Android adapter. Only after those foundations should a one-way sync/outbox design be implemented. Bidirectional sync and conflict resolution require a separate ADR.
