'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="playbook-module">
      <p>
        Adding a table is easy. Wiring it into everything a tenant table must participate in is what gets
        missed — and each omission fails silently, months later.
      </p>

      <h2>The six that get forgotten</h2>

      <Box kind="warning">
        <ol className="list-decimal pl-5 space-y-1.5">
          <li><strong><code>school_id</code></strong> — without it the table is invisible to backups and exports. Silent data loss.</li>
          <li><strong><code>deleted_at</code></strong> — without it, deletion is permanent and unrecoverable.</li>
          <li><strong>Trash descriptor</strong> — without it there is no restore, no dependency preview, no uniform audit.</li>
          <li><strong>Permission catalog entries</strong> — without them the route cannot be gated properly.</li>
          <li><strong>Module gate</strong> — if the feature is optional, or every school gets it whether they paid or not.</li>
          <li><strong>Search indexing</strong> — if the entity should be findable, or it never will be.</li>
        </ol>
      </Box>

      <h2>1. The migration</h2>

      <pre><code>{`-- database/migrations/tidb/040_visitation_cards.sql

CREATE TABLE IF NOT EXISTS visitation_cards (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  school_id   BIGINT       NOT NULL,          -- tenancy. Non-negotiable.
  student_id  BIGINT       NULL,
  card_uid    VARCHAR(64)  NOT NULL,
  status      VARCHAR(24)  NOT NULL DEFAULT 'active',
  expires_at  DATETIME     NULL,

  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME     NULL,              -- soft delete
  deleted_by  BIGINT       NULL,
  delete_reason VARCHAR(255) NULL,
  restored_at DATETIME     NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uk_school_card (school_id, card_uid),
  KEY idx_school_status (school_id, status),
  KEY idx_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`}</code></pre>

      <Table
        head={['Detail', 'Why']}
        rows={[
          [<>Numbered file, forward-only</>, <>Migrations are never edited after they have run anywhere.</>],
          [<>The five lifecycle columns</>, <><code>deleted_at</code>, <code>deleted_by</code>, <code>delete_reason</code>, <code>restored_at</code> — the trash UI requires them in its display select.</>],
          [<>Uniqueness scoped by <code>school_id</code></>, <>A globally unique card id would let one school&apos;s data collide with another&apos;s.</>],
          [<>Indexes lead with <code>school_id</code></>, <>Every query filters on it, so it belongs at the front of the composite.</>],
        ]}
      />

      <Box kind="note" title="Runtime ensure-schema is a safety net, not the strategy">
        <p>
          Several modules can create their own tables defensively on first use so they work where a migration
          has not run. <strong>Ship the numbered migration anyway.</strong> Relying on the fallback produces
          schema drift between environments that only surfaces when something behaves subtly differently in
          production.
        </p>
      </Box>

      <h2>2. Tenancy — verify, do not assume</h2>

      <p>
        The backup module classifies every table by walking <code>information_schema</code>. A table with{' '}
        <code>school_id</code> is <code>direct</code>; one with an FK path to a school-scoped table is{' '}
        <code>indirect</code>; one with neither is <strong>global and excluded from school backups</strong>.
      </p>

      <Box kind="warning" title="Check which class your table landed in">
        <p>
          If it holds tenant data and is classified global, it will not appear in a school&apos;s backup or
          export, and nobody will find out until someone needs to restore it.
        </p>
      </Box>

      <h2>3. Permissions</h2>

      <pre><code>{`// src/lib/rbac/catalog.ts
p('visitation', 'cards', 'view',   'View visitation cards'),
p('visitation', 'cards', 'manage', 'Issue, suspend and revoke visitation cards'),`}</code></pre>

      <ol>
        <li>Add the <code>p(...)</code> lines.</li>
        <li>Run the catalog sync from the admin UI — it inserts the codes.</li>
        <li>Add them to the relevant <code>ROLE_DEFAULTS</code> entries if a canonical role should have them.</li>
        <li>Run <code>npm run lint:permissions</code>.</li>
      </ol>

      <Box kind="invariant" title="Never delete a catalog entry to revoke access">
        <p>
          A removed code is marked inactive, and existing grants survive for audit. Sync never touches{' '}
          <code>role_permissions</code> — that is what makes catalog evolution safe on live schools.
        </p>
      </Box>

      <h2>4. Module gate, if the feature is optional</h2>

      <pre><code>{`export const GET = withModule('visitation', async (req) => { … });`}</code></pre>

      <p>
        Then hide the UI entry with <code>useEnabledModules()</code>. Both — the hook is presentational, the
        wrapper is the enforcement. Super-admin does <strong>not</strong> bypass a module gate: modules model
        subscription, not seniority.
      </p>

      <h2>5. Trash registry</h2>

      <pre><code>{`// src/lib/trash/registry.ts
{
  code: 'visitation_card',
  label: 'Visitation Card',  pluralLabel: 'Visitation Cards',
  tableName: 'visitation_cards',
  primaryKey: 'id',
  schoolIdColumn: 'school_id',

  // MUST include id, deleted_at, deleted_by, delete_reason, restored_at
  displaySelect: \`vc.id, vc.card_uid AS label, s.first_name AS subtitle,
                  vc.deleted_at, vc.deleted_by, vc.delete_reason, vc.restored_at\`,
  displayJoins: 'LEFT JOIN students s ON s.id = vc.student_id',

  searchPredicate: (t) => ({ sql: 'vc.card_uid LIKE ?', params: [\`%\${t}%\`] }),
  dependencies: [
    { tableName: 'visitation_events', fkColumn: 'card_id',
      label: 'Visit events', blocking: false },
  ],
}`}</code></pre>

      <p>
        One descriptor gives you archive, restore, list, search, dependency preview and purge — with uniform
        audit and permission handling. <strong>Never write a bespoke delete route.</strong> It will lack at
        least one of those, and nobody notices until a school asks for something back.
      </p>

      <p>Then run <code>npm run trash:verify</code>, which checks descriptors against the real schema.</p>

      <Box kind="tip" title="Blocking vs informational dependencies">
        <p>
          Mark a dependency <code>blocking</code> only when orphaning it would corrupt data — not merely when
          it would be untidy. Everything blocking gives you an un-purgeable database; nothing blocking lets a
          purge silently orphan rows that mattered.
        </p>
      </Box>

      <h2>6. Search, if it should be findable</h2>

      <ol>
        <li>Register the entity type in <code>src/lib/search/entities.ts</code> with its real catalog permission codes and a rank weight.</li>
        <li>Add a builder in <code>indexer.ts</code>.</li>
        <li>Call <code>reindexEntity()</code> fire-and-forget from every write path — <strong>including delete</strong>, or the record keeps appearing.</li>
      </ol>

      <p>Miss the last step and the entity is searchable but permanently stale.</p>

      <h2>7. The service layer</h2>

      <pre><code>{`// src/lib/visitation/service.ts
export async function issueCard(schoolId: number, input: IssueInput) { … }`}</code></pre>

      <Box kind="tip" title="Take a resolved schoolId, not a session">
        <p>
          This is the single most reusable pattern in the codebase. A service that takes{' '}
          <code>schoolId</code> can be called by a school route (session-scoped) <em>and</em> by a Control
          Center route (operator picks the school) without either sharing auth code. The backup module is the
          reference implementation.
        </p>
      </Box>

      <p>Factor the decision logic into a pure function and test it without a database — that is why the Control Center has a test file per module.</p>

      <h2>8. Write the README</h2>

      <p>
        <code>src/lib/&lt;subsystem&gt;/README.md</code>: responsibilities, the governing invariant, a file
        map, extension guidelines, known constraints. Then add it to the table in{' '}
        <code>docs/README.md</code>.
      </p>

      <p>
        23 of 40 subsystems have one. Yours should not be in the other 17.
      </p>

      <h2>Full checklist</h2>

      <Table
        head={['#', 'Step', 'Verify with']}
        rows={[
          ['1', 'Numbered migration with tenancy + lifecycle columns', 'Run it locally'],
          ['2', 'Confirm backup classification (direct / indirect / global)', 'Generate a school backup'],
          ['3', 'Permission catalog entries + role defaults', <code>npm run lint:permissions</code>],
          ['4', 'Module gate on routes, hook on the UI', 'Sign in as a school without the module'],
          ['5', 'Trash descriptor', <code>npm run trash:verify</code>],
          ['6', 'Search registration + reindex on every write', 'Create, rename, delete — search after each'],
          ['7', 'Service taking a resolved schoolId', 'Unit test the pure part'],
          ['8', 'Subsystem README + docs/README entry', 'Read it back as a stranger'],
          ['9', 'ADR if you constrained the design or made an exception', <code>docs/adr/TEMPLATE.md</code>],
        ]}
      />

      <Box kind="note" title="When to write an ADR">
        <p>
          When a future engineer would otherwise ask &quot;why on earth is it like this?&quot; — you chose a
          constraint over the obvious approach, accepted a known trade-off, created an exception to an existing
          invariant, or rejected an alternative someone will propose again in six months.
        </p>
        <p>Not for ordinary implementation. That is what the subsystem README is for.</p>
      </Box>

      <Source path="src/lib/backup/README.md">The reference implementation of the resolved-schoolId pattern.</Source>
      <Source path="docs/MIGRATION_RUNBOOK.md">Running migrations safely.</Source>

      <SeeAlso slugs={['schema', 'data', 'playbook-api', 'security']} />
    </ControlDoc>
  );
}
