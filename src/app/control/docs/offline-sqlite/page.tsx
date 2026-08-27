'use client';

import React from 'react';
import Link from 'next/link';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso } from '../ControlDoc';

const readinessRows = [
  ['Database abstraction', 'YELLOW', 'Typed Repos exist for selected tables; most routes still use raw mysql2.', 'SQLite can grow behind a deliberate adapter.', 'Add only per-domain contracts.', 'Later'],
  ['Business-logic separation', 'YELLOW', 'Offline students has a service; legacy routes mix SQL and orchestration.', 'Pure logic is reusable; route logic is not portable.', 'Keep new services auth-free.', 'Now'],
  ['Persistence abstraction', 'YELLOW', 'School, student, people, attendance, academic, staff and auth repos exist.', 'Enough for a slice, not the full product.', 'Expand by domain with parity tests.', 'Now'],
  ['Authentication', 'YELLOW', 'Offline login and session validation are wired through dynamic imports.', 'Local sessions work; key custody and broader identity policy remain.', 'Keep school auth separate.', 'Later'],
  ['Authorization/RBAC', 'ORANGE', 'RBAC exists but route adoption is partial.', 'Offline routes inherit only the gates they explicitly implement.', 'Audit each new route before release.', 'Later'],
  ['Tenant isolation', 'YELLOW', 'Local install enforces one school; repos still filter school_id.', 'Provisioning must never copy another school.', 'Keep verifier and scoped queries.', 'Now'],
  ['Filesystem/runtime', 'YELLOW', 'SQLite path defaults to ~/.drais/local.sqlite; Electron runs a local Node server.', 'Writable local storage is available on desktop, not Vercel.', 'Use runtime-specific adapters.', 'Now'],
  ['SQLite compatibility', 'YELLOW', 'better-sqlite3 schema and repos are real and tested.', 'MySQL SQL cannot be assumed portable.', 'Port only selected tables.', 'Now'],
  ['Transactions', 'YELLOW', 'SQLite supports transactions; student create now uses one.', 'Single-writer behavior differs from TiDB.', 'Test rollback and contention.', 'Now'],
  ['Migrations', 'ORANGE', 'Schema is deterministic CREATE IF NOT EXISTS, but no SQLite ledger exists.', 'Schema upgrades cannot yet be governed like TiDB.', 'Add versioned SQLite migrations.', 'Later'],
  ['IDs/timestamps', 'ORANGE', 'SQLite rowids and ISO strings are normalized at repo boundaries.', 'Sync cannot use auto-increment ids as global identity.', 'Add sync UUID/version later.', 'Later'],
  ['API compatibility', 'ORANGE', 'New offline routes are isolated; existing APIs remain MySQL-shaped.', 'No blanket route compatibility exists.', 'Add routes one slice at a time.', 'Now'],
  ['UI compatibility', 'ORANGE', 'Offline students page exists separately from the full students UI.', 'Most existing pages still assume online APIs.', 'Integrate only after route coverage.', 'Later'],
  ['Electron', 'YELLOW', 'Same Next standalone server runs locally; SQLite is optional native dependency.', 'Electron ABI/native packaging needs verification.', 'Rebuild/package better-sqlite3.', 'Later'],
  ['Capacitor/Android', 'ORANGE', 'Embedded Node server exists; better-sqlite3 is not proven for Android.', 'Desktop native binaries do not imply Android support.', 'Choose a mobile adapter.', 'Later'],
  ['Offline state', 'ORANGE', 'SQLite persists records and sessions; SWR is not an offline cache policy.', 'UI cannot assume connectivity-independent cache behavior.', 'Define local state and retry rules.', 'Later'],
  ['Sync readiness', 'RED', 'No sync engine or durable outbox exists.', 'Local writes do not reach TiDB.', 'Design one-way sync first.', 'Later'],
  ['Conflict resolution', 'RED', 'No conflict table or policy enforcement exists.', 'Concurrent edits can be unsafe to merge.', 'Create domain-specific policies.', 'Later'],
  ['Observability/recovery', 'ORANGE', 'Errors are typed; SQLite integrity/restore work is separate foundation.', 'Corruption and recovery need operational proof.', 'Add local diagnostics and backups.', 'Later'],
  ['Testability', 'YELLOW', 'Real in-memory/file SQLite tests and route-bridge tests exist.', 'No packaged Electron/Android test yet.', 'Keep tests driver-independent where possible.', 'Now'],
  ['Deployment/package', 'ORANGE', 'Standalone and Electron packaging exist; native SQLite packaging is unverified.', 'Optional dependency may be absent or ABI-incompatible.', 'Add packaging matrix.', 'Later'],
  ['Offline-first completeness', 'RED', 'This is a local execution path, not a sync-authoritative product.', 'SQLite alone does not satisfy offline-first.', 'Complete local workflows before sync.', 'Later'],
];

const roadmap = [
  ['0. Reconnaissance', 'Record evidence and boundaries.', 'Docs and ADRs only; no production code changes.', 'Existing app remains unchanged.', 'Review route/database/runtime inventory.', 'Score and assumptions are reproducible.'],
  ['1. SQLite foundation', 'Connection, schema, migrations, repos, transaction tests.', '`src/lib/repo/sqlite/`, contracts, migration ledger.', '`src/lib/db.ts`, existing online routes.', 'better-sqlite3 packaging and dialect drift.', 'Open file, migrate twice, rollback, contract tests.'],
  ['2. First offline domain', 'Ship one small useful domain end to end.', '`offline-auth/`, `offline-students/`, isolated routes.', 'Full `/students/list` and its APIs.', 'Scope creep into enrollment/fees.', 'Offline auth plus student CRUD works without network.'],
  ['3. Additional routes', 'Add selected domains by vertical slice.', 'One contract/service/route/test set per domain.', 'Unrelated production pages.', 'Duplicate logic and missing auth gates.', 'Each route has read/write/error/transaction tests.'],
  ['4. Offline identity hardening', 'Secure local identity and authorization policy.', 'Session, lockout, audit, encryption work.', 'Control Center auth and school auth boundaries.', 'Stale roles or stolen device.', 'Threat model, key storage, access tests pass.'],
  ['5. Offline attendance', 'Use acquisition/engine without network.', 'Attendance adapters and local repos.', 'Existing ADMS/relay ingestion.', 'Time, dedup, identity and audit errors.', 'Device/import fixtures pass and no silent guesses occur.'],
  ['6. Outbox', 'Persist local operations awaiting sync.', 'Outbox/idempotency tables and service.', 'No premature sync in existing routes.', 'Duplicate writes or lost operations.', 'Crash/restart resumes without duplication.'],
  ['7. One-way sync', 'Pull cloud changes safely.', 'Cursor, protocol, server endpoint.', 'Conflict UI and bidirectional writes.', 'Schema mismatch and replay.', 'Offline install reconnects and resumes a cursor.'],
  ['8. Conflict policies', 'Handle results, identity and finance deliberately.', 'Conflict records and review UI.', 'Automatic merging of high-stakes data.', 'Silent data loss.', 'Simulated conflicts are visible and resolvable.'],
  ['9. Offline-first UI', 'Integrate only proven local workflows.', 'SWR/local state policy and selected pages.', 'Global UI rewrite.', 'Stale or contradictory caches.', 'Core user journey works with network disabled.'],
  ['10. Hardening', 'Package, observe, back up, restore and upgrade.', 'Encryption, diagnostics, packaging, chaos tests.', 'Live TiDB behavior and auth contracts.', 'Native ABI, corruption, upgrade failure.', 'Desktop/mobile matrix and restore drills pass.'],
];

export default function Page() {
  return (
    <ControlDoc slug="offline-sqlite">
      <p>
        This is the additive SQLite execution path for DRAIS. It is deliberately small: it proves a real local
        request path without migrating the production database or rewriting the existing application.
      </p>

      <Box kind="warning" title="Architecture status: 43/100">
        <p><strong>Current stage:</strong> Foundation plus one focused offline domain.</p>
        <p><strong>SQLite routes implemented:</strong> offline student list/create/get/update/delete/restore, plus offline auth routes.</p>
        <p><strong>SQLite tables implemented:</strong> schools, people, students, attendance core, academic core, staff and offline auth support tables.</p>
        <p><strong>Production integration:</strong> NOT REPLACED.</p>
        <p><strong>Offline-first:</strong> NOT YET COMPLETE.</p>
        <p><strong>Synchronization:</strong> NOT IMPLEMENTED.</p>
        <p><strong>Next recommended milestone:</strong> add a managed SQLite migration ledger and encryption-at-rest decision before provisioning real school data.</p>
      </Box>

      <h2>What this subsystem is</h2>
      <p>
        A server-side, file-backed SQLite path beside the existing TiDB/MySQL path. The current implementation
        uses typed contracts, `better-sqlite3`, a deterministic schema, a singleton local file, offline session
        validation, and a small student identity service.
      </p>

      <h2>What it is not</h2>
      <ul>
        <li>It is not a replacement for TiDB Cloud or the production MySQL schema.</li>
        <li>It is not a second copy of the DRAIS application.</li>
        <li>It is not automatic synchronization.</li>
        <li>It is not proof that every existing page works offline.</li>
        <li>SQLite locally is not the same thing as an offline-first application.</li>
      </ul>

      <h2>Three different claims</h2>
      <Table head={['Claim', 'Current DRAIS status', 'Meaning']} rows={[
        [<strong>Local database</strong>, 'YES', 'The implemented subsystem persists to a SQLite file.'],
        [<strong>Offline application</strong>, 'PARTIAL', 'Offline login and the isolated student slice work through real route handlers.'],
        [<strong>Offline-first architecture</strong>, 'NO', 'There is no outbox, sync protocol, conflict handling, or broad local UI policy.'],
      ]} />

      <h2>Current architecture</h2>
      <Diagram caption="Existing production behavior remains the system of record.">{`DRAIS
├── Existing system
│   ├── UI and API routes
│   ├── existing business logic
│   └── src/lib/db.ts → TiDB/MySQL
│
└── Additive offline subsystem
    ├── src/lib/repo/contract      typed domain contracts
    ├── src/lib/repo/sqlite        better-sqlite3 + schema
    ├── src/lib/repo/offline-auth  local session and audit support
    ├── src/lib/repo/offline-students
    └── /api/students/offline      isolated HTTP route

Future, not implemented:
SQLite → outbox/sync engine → TiDB Cloud`}</Diagram>

      <h2>Readiness matrix</h2>
      <p>The score is an assessment, not a claim of feature completeness. Each of the 22 criteria is rated Green (5), Yellow (3), Orange (1), or Red (0), then weighted for production importance: persistence, runtime, security, and testability carry more weight than documentation. The resulting weighted score is <strong>43/100</strong>. RED blockers are not hidden by the existence of SQLite.</p>
      <div className="not-prose overflow-x-auto">
        <Table head={['Area', 'State', 'Current evidence', 'SQLite implication', 'Recommended action', 'When']} rows={readinessRows.map((r) => r.map((v, i) => i === 1 ? <strong key={i}>{v}</strong> : v))} />
      </div>

      <h2>First SQLite route</h2>
      <Table head={['Item', 'Implementation']} rows={[
        [<strong>Endpoint</strong>, <><code>/api/students/offline</code> and <code>/api/students/offline/[id]</code></>],
        [<strong>Database</strong>, <><code>~/.drais/local.sqlite</code>, overridden by <code>DRAIS_SQLITE_PATH</code></>],
        [<strong>Tables</strong>, <><code>people</code> and <code>students</code>, with <code>schools</code> tenant anchor</>],
        [<strong>Read</strong>, 'List/search and get compose typed repository records.'],
        [<strong>Write</strong>, 'Create, update, soft-delete and restore.'],
        [<strong>Validation</strong>, 'Required names, numeric ids, mode gate, session gate and typed repository errors.'],
        [<strong>Transactions</strong>, 'Create inserts person and student in one SQLite transaction; duplicate admission rolls back both.'],
        [<strong>Errors</strong>, '401 unauthenticated, 400 invalid input/id, 404 missing record, 409 duplicate, 500 unexpected failure.'],
        [<strong>Tests</strong>, <><code>npm run test:repo</code> uses real SQLite memory and file connections plus real NextRequest/NextResponse bridges.</>],
      ]} />

      <h2>Route development pattern</h2>
      <ol>
        <li>Choose a deliberately small offline domain and define its boundary.</li>
        <li>Confirm the local schema and add the table to the SQLite schema/migration mechanism.</li>
        <li>Define driver-free TypeScript contracts and normalize dates, numbers and nullable fields at boundaries.</li>
        <li>Implement the SQLite repository with school scoping, duplicate mapping and explicit transaction behavior.</li>
        <li>Add a service for business rules or multi-repository composition. Keep it independent of NextRequest.</li>
        <li>Add a route bridge that resolves the offline-aware session and dynamically imports SQLite code.</li>
        <li>Return stable error envelopes for malformed input, missing data, duplicates and database failures.</li>
        <li>Add pure repository/service tests, then route-bridge tests using real SQLite and HTTP-shaped requests.</li>
        <li>Register the route here and record what remains deliberately unsupported.</li>
      </ol>

      <h2>Repository and service conventions</h2>
      <p>
        Repositories own SQL and map rows to domain types. Services own decisions and composition. Routes own
        transport, authentication and response status. Do not put SQLite imports in client components or call
        repositories directly from UI code. Use transactions for a logical operation spanning multiple writes.
      </p>
      <Source path="src/lib/repo/contract/" />
      <Source path="src/lib/repo/sqlite/" />
      <Source path="src/lib/repo/offline-students/" />
      <Source path="src/app/api/students/offline/" />

      <h2>Initialization, schema and errors</h2>
      <p>
        `openSqliteDb()` creates or opens the selected file, enables WAL and foreign keys, and runs the current
        deterministic schema. The singleton creates the parent directory and reopens when the configured path
        changes. This is a foundation, not a substitute for a versioned migration ledger.
      </p>
      <Box kind="invariant" title="Fail closed on unsafe assumptions">
        <p>Never trust a request school id. Derive scope from the validated local session and one-school install invariant.</p>
        <p>Never silently convert a duplicate, missing row or transaction failure into success.</p>
        <p>Never make an existing online route depend on SQLite as a side effect.</p>
      </Box>

      <h2>Runtime compatibility</h2>
      <Table head={['Runtime', 'Current position', 'Required before production']} rows={[
        ['Development', 'Works with Node and real better-sqlite3 tests.', 'Run repository and route tests locally.'],
        ['Vercel/serverless', 'Hosted mode is forced online; writable persistent SQLite is unsupported.', 'Do not enable this path on Vercel.'],
        ['Electron/desktop', 'Same standalone Next server and user-data filesystem are available.', 'Verify native ABI rebuild, asar packaging and user-data path.'],
        ['Android/Capacitor', 'Embedded Node server exists, but desktop better-sqlite3 binary compatibility is unproven.', 'Select and test an Android-compatible SQLite adapter.'],
        ['Packaging', 'better-sqlite3 is optional and externalized in Next config.', 'Add Windows/Linux/Android build matrix and cold-start tests.'],
      ]} />

      <h2>Existing DRAIS Code We Are Not Rewriting</h2>
      <ul>
        <li>Existing production API routes and UI pages.</li>
        <li>Existing `src/lib/db.ts` and TiDB/MySQL access.</li>
        <li>Existing authentication domains and RBAC architecture.</li>
        <li>Existing attendance ingestion, ADMS, TCP and relay paths.</li>
        <li>Existing school management, reports, SMS and finance infrastructure.</li>
        <li>Existing Electron and Capacitor boot architecture.</li>
      </ul>

      <h2>Phased roadmap</h2>
      <p>Every phase must meet both its entry dependency and its exit evidence before the next phase starts.</p>
      <Table head={['Phase', 'Objective', 'Files/components', 'Untouched', 'Risks', 'Exit criteria']} rows={roadmap.map((r) => r.map((v) => v))} />

      <h2>Future synchronization</h2>
      <Diagram>{`SQLite local writes
      ↓
Durable outbox + install identity + idempotency key
      ↓
Resumable sync protocol
      ↓
TiDB Cloud
      ↓
Conflict records for identity, results and finance`}</Diagram>
      <p>
        Synchronization is not implemented. It will require stable sync identities, monotonic versions, cursors,
        retry/idempotency, schema negotiation, audit preservation and explicit conflict policies. Results and
        finance must not be silently last-write-wins.
      </p>

      <h2>Recommended next action</h2>
      <Box kind="tip">
        <p>Implement a versioned SQLite migration ledger and choose the at-rest encryption adapter, then rerun the route and packaging matrix before provisioning real school data.</p>
      </Box>

      <SeeAlso slugs={['architecture', 'data', 'schema', 'security', 'request-lifecycle', 'playbook-module']}>
        <p><Link href="/control/docs/architecture">Architecture overview</Link> and <Link href="/control/docs/data">Data &amp; migrations</Link> describe the existing system this subsystem must preserve.</p>
      </SeeAlso>
    </ControlDoc>
  );
}
