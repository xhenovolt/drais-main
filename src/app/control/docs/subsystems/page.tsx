'use client';

import React from 'react';
import Link from 'next/link';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="subsystems">
      <p>
        What lives where under <code>src/lib</code>, and the one invariant that explains each subsystem&apos;s
        design. Read the folder&apos;s own README before working in it — it is closer to the code than this
        page and more likely to be right.
      </p>

      <Source path="src/lib/&lt;subsystem&gt;/README.md">
        Responsibilities, the governing invariant, a file map, extension guidelines and known constraints.
      </Source>

      <h2>Reporting</h2>

      <Table
        head={['Folder', 'Owns', 'Governing invariant']}
        rows={[
          [<code>drce</code>, <>Report composition engine — document model, expressions, formulas, rendering.</>, <>Render is a pure function of (document, data, context). No I/O, no <code>Date.now()</code>.</>],
          [<code>snapshots</code>, <>The immutable data half — generation, storage, verify tokens.</>, <>Determinism: same data in, identical bytes out. Hashed at generation.</>],
          [<code>cafe</code>, <>Competency-based assessment — components, frameworks, promotion.</>, <>Additive. Traditional numeric assessment must keep working untouched.</>],
          [<code>reports</code>, <>Contribution policy, grading, nursery handling, subject ordering.</>, <>Pure resolver split from its DB half so it stays client-importable.</>],
        ]}
      />

      <Box kind="invariant">
        <p>
          <code>src/lib/drce/RENDER_LAYERS.md</code> is the binding contract — five layers, five hard
          invariants, one documented exception. Read it before changing anything that renders.
        </p>
      </Box>

      <h2>Attendance &amp; identity</h2>

      <Table
        head={['Folder', 'Owns', 'Governing invariant']}
        rows={[
          [<code>ingestion</code>, <>Device event intake, dedup, punch time.</>, <>Raw events are append-only.</>],
          [<code>attendance</code>, <>Evaluation and policy over those events.</>, <>Rules apply at read time; changing a policy re-reads history rather than rewriting it.</>],
          [<code>biometric</code>, <>PIN ↔ person identity, matching, corrections, templates.</>, <>Events immutable, associations correctable. Auto-mapping only on a deterministic match.</>],
          [<code>devices</code>, <>Ownership transfer ceremony.</>, <>Closed-by-default claim secret; raw events never deleted by a transfer.</>],
          [<code>passouts</code>, <>Gate decisions, pass-outs, visitation cards.</>, <>SMS fires only after a real gate event is recorded.</>],
        ]}
      />

      <Box kind="warning" title="The recurring bug class here">
        <p>
          Scoping a device write by the <em>session&apos;s</em> school rather than the <em>device&apos;s</em>.
          A live K40 test exposed cross-school contamination from exactly this. <code>device-access.ts</code> exists
          to prevent it — use it.
        </p>
      </Box>

      <h2>Access</h2>

      <Table
        head={['Folder', 'Owns', 'Governing invariant']}
        rows={[
          [<code>rbac</code>, <>Permission catalog, authorization, role defaults.</>, <>The catalog is the source of truth; sync never touches <code>role_permissions</code>.</>],
          [<code>auth</code>, <>API auth helpers, module gating.</>, <>Super-admin does <strong>not</strong> bypass module gates — modules model subscription, not seniority.</>],
          [<code>portal</code>, <>Parent sessions, OTP, linking, the isolation gate.</>, <>Every query intersects requested ∩ authorized.</>],
          [<code>parent</code>, <>Cross-school parent API access resolution.</>, <>The client only ever holds an opaque <code>access_uuid</code>; <code>student_id</code> never leaves the server.</>],
        ]}
      />

      <h2>Platform</h2>

      <Table
        head={['Folder', 'Owns', 'Governing invariant']}
        rows={[
          [<code>control</code>, <>Control Center — tenants, billing, health, impersonation, jobs.</>, <>Isolated auth domain. Pure core, audited shell. One cron, many jobs.</>],
          [<code>platform</code>, <>External Platform API v1.</>, <>The contract is frozen. Add fields; never remove or narrow.</>],
        ]}
      />

      <h2>Everything else</h2>

      <Table
        head={['Folder', 'Owns', 'Note']}
        rows={[
          [<code>finance</code>, <>Fees, payments, locations, budgets, pocket money.</>, <>Balances are derived, never stored. Do not add a cached balance column.</>],
          [<code>comm</code>, <>Communication event engine.</>, <>Features emit events; they never call a provider directly.</>],
          [<code>notifications</code>, <>Policy fanout, outbox, drainer.</>, <>The drainer must stay callable from more than one place — that was the original bug.</>],
          [<code>search</code>, <>Projection index, ranking, permission filtering.</>, <>Permission-filtered in the query, not in the results.</>],
          [<code>trash</code>, <>Universal soft delete, restore, dependency preview, purge.</>, <>Register an entity; never write a bespoke delete route.</>],
          [<code>backup</code>, <>School-scoped SQL backups.</>, <>Every step bounded; state persisted between steps.</>],
          [<code>db</code>, <>Dual mode, pools, runtime credential config.</>, <><code>timezone: &apos;Z&apos;</code> and <code>bigNumberStrings</code> are load-bearing.</>],
          [<code>services</code>, <><strong>Mixed legacy folder</strong> — ledger, Dahua devices, staff/class-teacher lifecycle.</>, <>Not a subsystem. Put new code in its domain folder instead.</>],
        ]}
      />

      <h2>Coverage</h2>

      <p>
        <strong>33 of 42 folders have a README.</strong> The nine without are each 24&ndash;153 lines with a
        header comment that already says everything a README would: <code>actions</code>,{' '}
        <code>admissions</code>, <code>brand</code>, <code>calendar</code>, <code>config</code>,{' '}
        <code>internal</code>, <code>pdf</code>, <code>routes</code>, <code>version</code>.
      </p>

      <Box kind="tip" title="That is a decision, not a backlog">
        <p>
          Documentation should exist because it teaches something, not because every folder must contain a
          file. A README for a 24-line config folder is the shallow documentation this knowledge base exists to
          replace. If you substantially grow one of the nine, write it then.
        </p>
      </Box>


      <Box kind="tip" title="Two patterns worth recognising">
        <p>
          <strong>The <code>.server.ts</code> twin.</strong> Modules imported by client components must not
          import <code>@/lib/db</code> — that pulls <code>tls</code> into the client bundle. Hence{' '}
          <code>commentEngine.ts</code> / <code>overallComments.server.ts</code>,{' '}
          <code>reportComments.ts</code> / <code>.server.ts</code>, <code>subjectOrder.ts</code> /{' '}
          <code>.server.ts</code>. Follow it; do not merge them back.
        </p>
        <p>
          <strong>Runtime schema ensure.</strong> Several modules can create their own tables defensively as a
          fallback when a migration has not run. It is a safety net, not the migration strategy — see{' '}
          <Link href="/control/docs/data">Data &amp; migrations</Link>.
        </p>
      </Box>

      <Source path="docs/README.md">Indexes every subsystem README, and names the ones still missing.</Source>
      <SeeAlso slugs={['architecture', 'schema', 'playbook-module', 'frontend']} />
    </ControlDoc>
  );
}
