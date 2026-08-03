'use client';

import React from 'react';
import Link from 'next/link';
import ControlDoc, { Box, Source, Table } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="architecture">
      <p>
        DRAIS is a multi-tenant school management system: a Next.js App Router application over TiDB, shipping
        to web, desktop and Android, integrating with ZKTeco biometric devices, and exposing a frozen external
        API to other Xhenvolt systems.
      </p>

      <h2>The shape</h2>

      <pre><code>{`  schools ──▶ one Next.js app, one database, tenant-scoped by school_id
                    │
    ┌───────────────┼────────────────┬──────────────────┐
    │               │                │                  │
  school app     parent portal   Control Center    Platform API v1
  /(protected)   /portal /parent  /control          /api/platform/v1
  drais_session  drais_parent_…   drais_control     Bearer key:secret`}</code></pre>

      <p>
        Four surfaces, four different callers, and — importantly — <strong>three separate authentication
        systems</strong> that share no code path. See <Link href="/control/docs/security">Auth &amp; tenancy</Link>.
      </p>

      <h2>The constraints that actually shaped it</h2>

      <p>
        Most of what looks unusual in this codebase follows from a small number of hard external constraints.
        Knowing them prevents a lot of well-intentioned refactoring that would break production.
      </p>

      <Table
        head={['Constraint', 'What it forces']}
        rows={[
          [
            <>Serverless: short timeouts, no shared memory, no durable worker</>,
            <>Long jobs become client-driven step loops with state in TiDB (backup generation). Rate limits and idempotency live in tables, not memory. The in-process event bus does not cross lambdas.</>,
          ],
          [
            <>Exactly <strong>one</strong> cron available, already spent</>,
            <>Periodic work becomes a <code>platform_jobs</code> row executed by an existing tick. <strong>Never add a cron.</strong> This is why the notification drainer was extracted from its route.</>,
          ],
          [
            <>Build memory ceiling on the deploy box</>,
            <>Heap capped at 2048MB; measured failure at 1536 and SIGKILL at 4096. The working set is structural (900+ routes), so it is not fixable by tuning.</>,
          ],
          [
            <>Cloudinary ~10MB raw-file limit</>,
            <>School backups are assembled, checksummed, then split into independently valid parts, one uploaded per invocation.</>,
          ],
          [
            <>Devices in the field with inconsistent firmware</>,
            <>Device-side commands are best-effort with expiry. DRAIS never blocks an identity operation on a device round-trip.</>,
          ],
          [
            <>Schools cannot wait for a deploy</>,
            <>Report card layouts, comment rules, fee rules, permissions and assessment frameworks are all <em>data</em>, edited by the school, not code.</>,
          ],
        ]}
      />

      <h2>Three principles you will see repeated</h2>

      <h3>1. Record what happened; correct by adding, not overwriting</h3>
      <p>
        Raw attendance events are immutable. A wrong fingerprint mapping is re-pointed and the affected events
        are re-attributed — never deleted. A finance error is reversed with a compensating entry. Staff
        employment and class-teacher assignment are append-only logs. Deletion across the app is soft by
        default, via a single trash registry.
      </p>
      <p>
        This is not conservatism. A system a school uses to prove attendance to a ministry cannot also let the
        past be quietly rewritten.
      </p>

      <h3>2. Freeze what gets printed</h3>
      <p>
        Report cards render from an immutable snapshot hashed at generation time, not from live tables. A
        reprint reproduces the original bytes. There is exactly one documented exception — overall comments —
        and it is argued in full in ADR-0007 rather than left implicit.
      </p>

      <h3>3. Pure core, audited shell</h3>
      <p>
        Decision logic is factored into pure, unit-tested functions with I/O and audit around them. It is why
        the Control Center has a test file per module with no database, and why the DRCE render path forbids
        <code>Date.now()</code>.
      </p>

      <Box kind="invariant" title="The three that break things silently if violated">
        <ul className="list-disc pl-5 space-y-1">
          <li>Render paths never read live academic tables — only snapshots.</li>
          <li>Parent data queries intersect requested ∩ authorized, never requested alone.</li>
          <li>Device writes are scoped by the <em>device&apos;s</em> school_id, never the session&apos;s.</li>
        </ul>
      </Box>

      <h2>Ship targets</h2>

      <Table
        head={['Target', 'How']}
        rows={[
          ['Web', <>Vercel. The primary target.</>],
          ['Desktop', <>Electron. Can run against a local MySQL instead of TiDB — see <Link href="/control/docs/data">Data &amp; migrations</Link>.</>],
          ['Android', <>Capacitor + nodejs-mobile-cordova, embedding the server. A separate native Expo client exists as a distinct edition.</>],
        ]}
      />

      <h2>Where the authority lives</h2>

      <Source path="docs/adr/">Architecture Decision Records — the most important documentation in the repo.</Source>
      <Source path="src/lib/&lt;subsystem&gt;/README.md">Per-subsystem: responsibilities, invariants, file map, constraints.</Source>
      <Source path="src/lib/drce/RENDER_LAYERS.md">The binding contract for anything that renders a report.</Source>
      <Source path="docs/database/TABLE_DICTIONARY.md">Table dictionary.</Source>
      <Source path="CONTRIBUTING.md">Setup, tests, migrations, git workflow.</Source>

      <Box kind="tip">
        <p>
          The repo also carries a large <code>docs/audits/</code> and <code>docs/archive/</code>. Audits are
          findings at a point in time, not specifications — several end in recommendations that were never
          implemented. Check an audit&apos;s date against <code>git log</code> on the files it discusses before
          acting on it. Nothing in <code>archive/</code> is current.
        </p>
      </Box>
    </ControlDoc>
  );
}
