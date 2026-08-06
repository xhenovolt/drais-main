'use client';

import React from 'react';
import Link from 'next/link';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="operations">
      <p>
        How DRAIS is built, shipped and kept running — and the two ceilings that constrain nearly every
        operational decision.
      </p>

      <h2>Ceiling one: exactly one cron</h2>

      <Box kind="invariant" title="Never add a cron">
        <p>
          The hosting plan permits one scheduled job and DRAIS already spends it. Periodic work becomes a{' '}
          <code>platform_jobs</code> <strong>row</strong>, executed by the existing daily cron or any
          request-driven tick.
        </p>
      </Box>

      <p>To add periodic work:</p>
      <ol>
        <li>Register a handler in <code>src/lib/control/job-handlers.ts</code> (idempotent, called before <code>runDueJobs</code> on each tick).</li>
        <li>Enqueue a <code>platform_jobs</code> row.</li>
        <li>The runner claims it, executes it, and retries with backoff on failure.</li>
      </ol>

      <p>
        The scheduling maths (<code>computeBackoffSeconds</code>, <code>isDue</code>) is pure and unit-tested.
      </p>

      <Box kind="warning" title="The failure this prevents">
        <p>
          The notification drainer originally lived inside the <code>GET</code> handler of a route that was
          never scheduled — no cron existed for it and none could be added. Queued notifications therefore{' '}
          <strong>never sent, silently</strong>, for as long as that was true. The core was extracted so more
          than one caller can pump the queue.
        </p>
        <p>Keep queue-pumping logic callable from anywhere. That is the lesson, not the specific fix.</p>
      </Box>

      <Source path="src/lib/control/job-runner.ts" />
      <Source path="src/lib/notifications/README.md" />

      <h2>Ceiling two: build memory</h2>

      <Table
        head={['Heap cap', 'Result']}
        rows={[
          [<code>1536</code>, <>FATAL — out of memory</>],
          [<code>2048</code>, <><strong>OK</strong> — RSS ~5.9GB. The setting in use.</>],
          [<code>4096</code>, <>SIGKILL</>],
        ]}
      />

      <p>
        The build box has roughly 8GB (the 2GB figure elsewhere is function memory, not build memory). The
        working set is <strong>structural</strong> — 900+ routes — so it is not tunable away.
      </p>

      <Box kind="warning" title="Things that were tried and did not help">
        <p>
          Disabling source maps, reducing parallelism, and <code>optimizePackageImports</code>. Reducing the
          real footprint did help: removing dead dependencies and lazy-loading heavy ones. If the build starts
          failing again, look for a newly added heavy dependency before adjusting the cap.
        </p>
      </Box>

      <h2>Ship targets</h2>

      <Table
        head={['Target', 'How', 'Notes']}
        rows={[
          ['Web', <>Vercel, on push to <code>main</code></>, <>The primary target.</>],
          ['Desktop', <>Electron</>, <>Can run against local MySQL. Credentials editable from the UI and persisted to <code>DRAIS_CONFIG_FILE</code>.</>],
          ['Android', <>Capacitor 8 + nodejs-mobile-cordova</>, <>Needs JDK 21, NDK 27.0.12077973, CMake 3.22.1. A staging script replicates the cordova prepare step after <code>cap sync</code>.</>],
        ]}
      />

      <Source path="docs/BUILD_PIPELINE.md" />
      <Source path="docs/guides/DEPLOYMENT_GUIDE.md" />

      <h2>Maintenance mode</h2>

      <Table
        head={['Mode', 'Effect']}
        rows={[
          [<code>off</code>, <>Normal.</>],
          [<code>banner</code>, <>Notice to all schools; full access.</>],
          [<code>read_only</code>, <>Notice plus tenant writes blocked in the route wrapper. Reads still work.</>],
        ]}
      />

      <Box kind="tip">
        <p>
          The Control Center is <strong>never</strong> blocked by read-only mode, so an operator can always
          switch it back off. <code>getMaintenance</code> is cached for 30s so it costs nothing on the hot path.
        </p>
      </Box>

      <h2>Monitoring</h2>

      <ul>
        <li><Link href="/control/system-health">System Health</Link> — cross-school scan: expired licences, stalled attendance, all-offline devices, clock drift, failed SMS, sync failures. Each monitor is one <code>GROUP BY</code>, no N+1.</li>
        <li>Daily per-school health snapshots, plus an alert when a school newly turns critical.</li>
        <li><Link href="/control/audit">Audit log</Link> — every Control Center mutation.</li>
        <li><Link href="/control/sms">SMS</Link> — one platform provider account; per-school quota and usage.</li>
      </ul>

      <Box kind="warning">
        <p>
          SMS usage is derived from <code>SMS_SENT</code> audit events, because <code>logSMSActivity</code> only
          writes to console. Prune those events and historical usage goes with them.
        </p>
      </Box>

      <h2>Destructive operations</h2>

      <h3>Hard-deleting a school</h3>
      <p>Four guardrails, all server-side:</p>
      <ol>
        <li>Super-admin only.</li>
        <li>The school must already be soft-deleted.</li>
        <li>The caller must retype the exact school name.</li>
        <li>A data-heavy school is refused without <code>force: true</code>.</li>
      </ol>
      <p>Audited with a per-table row-count summary. It is not reversible and not transactional across every table.</p>

      <Box kind="warning" title="Export first">
        <p>
          <code>data-export.ts</code> produces a per-school JSON extract of every scoped table. Take one before
          any hard delete — that is what it is for.
        </p>
      </Box>

      <h3>Device transfers</h3>
      <p>
        Release → acquire, or decommission. Gated by <code>DEVICE_CLAIM_SECRET</code>, which is{' '}
        <strong>closed by default</strong>: unset means all transfers refused. Super-admins may force-transfer
        without it; accountability comes from <code>device_transfers</code> plus <code>audit_logs</code>.
      </p>
      <p>Partial failures leave an auditable <code>aborted</code> row and need a manual <code>forceRetry</code>.</p>

      <h2>Tests</h2>

      <Table
        head={['Command', 'Covers']}
        rows={[
          [<code>npm run test:drce</code>, <>Formulas, visibility, mutations, comments, ranking, totals</>],
          [<code>npm run test:snapshots</code>, <>Integrity invariants, template resolution, print state</>],
          [<code>npm run verify:divisions</code>, <>Aggregate/division consistency against real snapshots</>],
          [<code>npm run test:attendance</code> / <code>:ingestion</code> / <code>:biometric</code>, <>Attendance pipeline</>],
          [<code>npm run test:passouts</code> / <code>:notifications</code> / <code>:allocations</code>, <>Those modules</>],
          [<code>npm run lint:permissions</code>, <>Permission literals against the catalog</>],
          [<code>npm run trash:verify</code>, <>Trash descriptors against the real schema</>],
        ]}
      />

      <Box kind="invariant">
        <p>
          After any change touching marks, aggregates or divisions, run <code>test:drce</code>,{' '}
          <code>test:snapshots</code> <strong>and</strong> <code>verify:divisions</code>. The 2026-07 division
          mismatch is why that is three commands and not one.
        </p>
      </Box>

      <Source path="CONTRIBUTING.md">Setup, tests, git workflow, migrations.</Source>
      <SeeAlso slugs={['architecture', 'data', 'platform-api', 'playbook-module']} />
    </ControlDoc>
  );
}
