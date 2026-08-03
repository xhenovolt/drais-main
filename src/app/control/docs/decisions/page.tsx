'use client';

import React from 'react';
import Link from 'next/link';
import ControlDoc, { Box, Source, Table } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="decisions">
      <p>
        Implementation can be read from the code. <strong>Intent cannot.</strong> The ADRs record why each
        decision was made, what was rejected, and which trade-off was accepted — which is what stops a later
        engineer &quot;fixing&quot; something that was deliberate.
      </p>

      <Source path="docs/adr/">The authoritative set. Summaries below are for orientation only.</Source>

      <h2>The twelve</h2>

      <Table
        head={['ADR', 'Decision', 'Why it matters now']}
        rows={[
          [
            <strong>0001</strong>,
            <>Attendance raw events are immutable</>,
            <>Corrections re-attribute; they never delete. A device transfer or identity fix must not touch <code>attendance_raw_events</code>.</>,
          ],
          [
            <strong>0002</strong>,
            <>Device wall time is not authoritative</>,
            <><code>punch_at</code> is the actual server instant. Dedup keys off the device-reported time. Field devices have been observed hours fast.</>,
          ],
          [
            <strong>0003</strong>,
            <>Device time policies</>,
            <>How clock drift is detected and self-healed per device rather than globally assumed.</>,
          ],
          [
            <strong>0004</strong>,
            <>Timezone-safe dates</>,
            <>Store instants, derive local dates explicitly. The MySQL driver runs <code>timezone: &apos;Z&apos;</code> — a driver that helpfully converts would corrupt attendance dates.</>,
          ],
          [
            <strong>0005</strong>,
            <>Report snapshot immutability</>,
            <>Render reads only the snapshot. A reprint reproduces the original. This is the backbone of the whole reporting pipeline.</>,
          ],
          [
            <strong>0006</strong>,
            <>Contributing-subject invariant</>,
            <>One function decides which subjects count toward aggregates and divisions. Never reimplement it — the 2026-07 division mismatch came from exactly that.</>,
          ],
          [
            <strong>0007</strong>,
            <>Overall-comment render-time exception</>,
            <>The single sanctioned break from snapshot immutability, so per-template comment rules can apply at print time. Cite it as precedent; do not copy the pattern.</>,
          ],
          [
            <strong>0008</strong>,
            <>Two auth systems (in practice three domains)</>,
            <>School, parent portal and Control Center share no tables and no code. A mistake in one cannot break the others.</>,
          ],
          [
            <strong>0009</strong>,
            <>Parent portal isolation gate</>,
            <>Every parent query intersects requested ∩ authorized. A route filtering on a client-supplied student id is a cross-family leak.</>,
          ],
          [
            <strong>0010</strong>,
            <>Dual database mode</>,
            <>Online TiDB or local MySQL, resolved server-side. Serverless forces online unless explicitly opted in.</>,
          ],
          [
            <strong>0011</strong>,
            <>Platform API contract freeze</>,
            <>v1 fields may be added, never removed or narrowed. Breaking changes ship as v2 alongside.</>,
          ],
          [
            <strong>0012</strong>,
            <>Founder independence</>,
            <>The system must be operable and maintainable without its original author. Drives the Control Center, provisioning, backups and this documentation.</>,
          ],
        ]}
      />

      <Box kind="invariant" title="The four most expensive to get wrong">
        <p>
          <strong>0005</strong> and <strong>0006</strong> corrupt printed report cards, which parents keep and
          schools cannot recall. <strong>0009</strong> leaks one family&apos;s child to another. <strong>0001</strong>{' '}
          destroys the evidence a school needs to prove attendance. None of these fail loudly at the time.
        </p>
      </Box>

      <h2>When to write one</h2>

      <p>Write an ADR when a change would leave a future engineer asking &quot;why on earth is it like this?&quot; — specifically:</p>

      <ul>
        <li>you chose a constraint over the obvious approach (a queue table instead of a cron);</li>
        <li>you accepted a trade-off knowingly (derived balances cost a query per read);</li>
        <li>you are creating an exception to an existing invariant (as 0007 does to 0005);</li>
        <li>you rejected an alternative someone will otherwise propose again in six months.</li>
      </ul>

      <p>
        Do not write one for ordinary implementation. A README in the subsystem folder is the right home for
        &quot;how this works&quot;; an ADR is for &quot;why it is allowed to work this way&quot;.
      </p>

      <Source path="docs/adr/TEMPLATE.md">Start from the template; keep the rejected alternatives section honest.</Source>

      <h2>When an audit becomes an ADR</h2>

      <p>
        <code>docs/audits/</code> is the richest source of ADR material in the repository — investigations that
        established what was actually true at a moment in time. When an audit&apos;s findings get implemented,
        the durable reasoning belongs in an ADR; the audit stays as the record of what was found.
      </p>

      <Box kind="warning">
        <p>
          Audits are <strong>findings, not specifications</strong>. Several conclude with recommendations that
          were never implemented, and some are explicitly plan-only or awaiting approval. Always check the date
          against <code>git log</code> on the files discussed before acting.
        </p>
      </Box>

      <p>
        Next: <Link href="/control/docs/subsystems">Subsystem map</Link>.
      </p>
    </ControlDoc>
  );
}
