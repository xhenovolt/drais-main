'use client';

import React from 'react';
import Link from 'next/link';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="data">
      <p>
        TiDB in production, optionally local MySQL for the desktop build. Multi-tenant by{' '}
        <code>school_id</code>. Soft delete almost everywhere. A few driver settings that look like details and
        are not.
      </p>

      <h2>Dual mode</h2>

      <Table
        head={['Mode', 'Database', 'Used by']}
        rows={[
          [<code>online</code>, <>TiDB Cloud</>, <>Hosted production — the source of truth</>],
          [<code>local</code>, <>Local MySQL</>, <>Packaged desktop app, offline use</>],
        ]}
      />

      <p>
        The UI chooses; the <strong>server</strong> resolves. Frontend buttons cannot mutate{' '}
        <code>process.env</code> after boot, so mode is a server-side runtime value — a module variable in the
        single-process desktop build.
      </p>

      <Box kind="warning" title="Serverless forces online">
        <p>
          There is no localhost MySQL beside a Vercel lambda, so the resolver forces <code>online</code> unless
          a deployment explicitly opts in with <code>DRAIS_ALLOW_LOCAL</code>. Failing closed here prevents a
          hosted deployment silently trying to reach a database that cannot exist.
        </p>
      </Box>

      <Source path="src/lib/db/README.md" />
      <Source path="docs/adr/0010-dual-database-mode.md" />

      <h2>Two driver settings that are load-bearing</h2>

      <Box kind="invariant">
        <p>
          <code>timezone: &apos;Z&apos;</code> — DRAIS stores instants and derives local dates explicitly
          (ADR-0004). A driver that helpfully converts timezones would corrupt attendance dates for every
          school. Do not &quot;fix&quot; it.
        </p>
        <p>
          <code>bigNumberStrings</code> — TiDB bigints exceed JS number precision. Silently losing the low bits
          of an id is not hypothetical.
        </p>
      </Box>

      <h2>Migrations</h2>

      <Source path="database/migrations/tidb/">Numbered SQL migrations — the production schema strategy.</Source>
      <Source path="docs/MIGRATION_RUNBOOK.md">How to run one safely.</Source>
      <Source path="docs/database/MIGRATIONS.md">The mechanisms, including the runtime-ensure fallback.</Source>

      <h3>The runtime ensure-schema fallback</h3>

      <p>
        Several modules can create their own tables defensively on first use — the backup center, overall
        comment rules, pass-out columns, biometric enrollment tables. It exists so a module still works on an
        environment where its migration has not been run.
      </p>

      <Box kind="warning">
        <p>
          It is a <strong>safety net, not the migration strategy</strong>. Ship the SQL migration too.
          Relying on the fallback means schema drift between environments that only surfaces when something
          subtle behaves differently in production.
        </p>
        <p>
          Where <code>ALTER</code>s are used this way they are best-effort — &quot;duplicate column&quot; on
          re-run is expected and ignored.
        </p>
      </Box>

      <h2>Soft delete</h2>

      <p>
        Deletion across the app routes through one registry and one service. Adding a new archivable entity is
        a descriptor, not a route.
      </p>

      <ul>
        <li><code>archiveEntity</code> flips <code>deleted_at</code>. It never hard-deletes.</li>
        <li><code>purgeEntity</code> is the only physical delete — super-admin, explicit confirmation, dependency check.</li>
        <li>Dependencies are informational by default; <code>blocking: true</code> refuses the purge.</li>
      </ul>

      <Box kind="warning" title="Two consequences to remember">
        <p>
          Every query elsewhere must remember <code>deleted_at IS NULL</code>. And soft-deleted rows still
          count toward table size.
        </p>
        <p>Run <code>npm run trash:verify</code> after touching the registry — it checks descriptors against the real schema.</p>
      </Box>

      <Source path="src/lib/trash/README.md" />

      <h2>Tenant scoping in the schema</h2>

      <p>
        Most tables carry <code>school_id</code> directly. Some are reachable only through a foreign key to a
        table that does. The backup module classifies every table by walking{' '}
        <code>information_schema</code> rather than holding a hardcoded list:
      </p>

      <Table
        head={['Class', 'Meaning']}
        rows={[
          [<code>direct</code>, <>Has <code>school_id</code> → <code>WHERE school_id = ?</code></>],
          [<code>indirect</code>, <>Reachable by FK → nested subquery built from a BFS path</>],
          [<>global</>, <>No path to <code>schools</code> → excluded from school-scoped backups</>],
        ]}
      />

      <Box kind="tip">
        <p>
          This is why a new module&apos;s tables are backed up automatically: give a table a{' '}
          <code>school_id</code>, or an FK to something that has one, and it is included without touching the
          backup code. A table with neither is invisible to school backups — usually correct, occasionally a
          bug.
        </p>
      </Box>

      <h2>Backups</h2>

      <p>
        School-scoped SQL dumps to Cloudinary. There is deliberately <strong>no full-database mode</strong> —
        every backup is one school.
      </p>

      <p>Shape is dictated by two external limits:</p>
      <ul>
        <li><strong>Short serverless timeouts, no durable worker</strong> → generation is a client-driven step loop with progress persisted to TiDB between steps.</li>
        <li><strong>Cloudinary&apos;s ~10MB raw ceiling</strong> → the assembled file is split into independently valid gzip parts, one uploaded per invocation.</li>
      </ul>

      <Box kind="warning" title="Restore is not implemented">
        <p>
          Backups are generated, verified and downloadable. Restoring is a manual database operation. This is
          the largest gap in the module and worth knowing before promising a school anything.
        </p>
      </Box>

      <Source path="src/lib/backup/README.md" />

      <h2>Reference</h2>

      <Source path="docs/database/TABLE_DICTIONARY.md">Look up a table.</Source>
      <Source path="src/lib/control/data-export.ts">Per-school JSON export — the export-before-hard-delete safeguard.</Source>

      <p>
        Next: <Link href="/control/docs/platform-api">Platform API v1</Link>.
      </p>
      <SeeAlso slugs={['schema', 'playbook-module', 'operations', 'architecture']} />
    </ControlDoc>
  );
}
