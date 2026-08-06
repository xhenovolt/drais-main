'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso, FiveQuestions } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="module-attendance">
      <p>
        90 API routes and 22 pages — the largest module in DRAIS, and the reason most schools buy it.
      </p>

      <FiveQuestions
        what={<>Everything from a finger on a sensor to an attendance percentage on a report card: device integration, identity resolution, event ingestion, policy evaluation, registers and guardian alerts.</>}
        why={<>Manual registers are slow, gameable, and unprovable. A school that cannot prove attendance cannot defend its funding, its inspections, or its answer to a parent asking where their child was.</>}
        how={<>Devices push scans over ADMS. DRAIS records raw events append-only, resolves PIN → person against a canonical mapping, then evaluates school policy at <em>read</em> time to produce present/late/absent.</>}
        where={<><code>src/lib/ingestion</code> · <code>src/lib/attendance</code> · <code>src/lib/biometric</code> · <code>src/lib/devices</code> · <code>src/app/api/zk-handler</code> · <code>src/app/attendance/*</code></>}
        extend={<>Add policy as evaluation rules, not as writes. Never mutate a raw event. Never block an identity operation on a device round-trip.</>}
      />

      <h2>The business problem</h2>

      <p>
        Ugandan schools are funded and inspected partly on attendance. A paper register is filled in by the
        person with the least incentive for it to be accurate, often after the fact. Parents discover a child
        skipped school days later, if at all.
      </p>

      <p>
        So the module has one job beyond recording: <strong>producing a record a school can defend.</strong>{' '}
        Every design decision below follows from that, and several of them look over-engineered until you ask
        &quot;what happens when a parent disputes this?&quot;
      </p>

      <h2>Architecture</h2>

      <Diagram caption="Four layers. Each one is allowed to read the layer above and never to rewrite it.">
{`  ┌──────────────────────────────────────────────────────────────────────┐
  │  DEVICE          ZKTeco (K40 and similar). Holds PINs + templates.    │
  │                  Matches the finger LOCALLY, sends a PIN.             │
  └───────────────────────────────┬──────────────────────────────────────┘
                                  │  ADMS push → /api/zk-handler
  ┌───────────────────────────────▼──────────────────────────────────────┐
  │  INGESTION       src/lib/ingestion                                    │
  │                  dedup · punch_at = server instant · clock-drift heal  │
  │                  → attendance_raw_events        APPEND-ONLY           │
  └───────────────────────────────┬──────────────────────────────────────┘
                                  │
  ┌───────────────────────────────▼──────────────────────────────────────┐
  │  IDENTITY        src/lib/biometric                                    │
  │                  (school, serial, PIN) → biometric_enrollments        │
  │                  miss → pending_device_users   (queued, not guessed)  │
  └───────────────────────────────┬──────────────────────────────────────┘
                                  │
  ┌───────────────────────────────▼──────────────────────────────────────┐
  │  EVALUATION      src/lib/attendance                                   │
  │                  school policy applied AT READ TIME                   │
  │                  → attendance_records (present / late / absent)       │
  └───────────────────────────────┬──────────────────────────────────────┘
                                  │
        registers · summaries · report cards · guardian SMS`}
      </Diagram>

      <h2>The three invariants</h2>

      <Box kind="invariant" title="1. Raw events are append-only">
        <p>
          Never updated, never deleted — not by a correction, not by a device transfer, not when a learner
          leaves. A wrong identity is fixed by <strong>re-attributing</strong> the event to the right person;
          the time, device and finger stay exactly as recorded.
        </p>
        <p>
          A system that lets the past be rewritten cannot be used to prove anything about it. That is the whole
          point of the module. (ADR-0001)
        </p>
      </Box>

      <Box kind="invariant" title="2. Device wall time is not authoritative">
        <p>
          <code>punch_at</code> is the actual server instant. The device-reported time is kept separately and
          used only for deduplication.
        </p>
        <p>
          Field devices have been observed <strong>five to eight hours fast</strong>. Trusting them would file
          morning arrivals on the previous or following day. Ignoring their timestamp entirely would break
          re-send dedup, because that timestamp is the event&apos;s stable identity from the device&apos;s point
          of view. (ADR-0002, ADR-0003)
        </p>
      </Box>

      <Box kind="invariant" title="3. Policy is applied when attendance is read, not when it is recorded">
        <p>
          Changing the late cut-off from 08:00 to 08:15 re-reads history under the new rule. The underlying
          scans never change.
        </p>
        <p>
          This is what lets a school adjust policy without corrupting its record — and it is why{' '}
          <code>attendance_records</code> is safe to recompute while <code>attendance_raw_events</code> is not.
        </p>
      </Box>

      <h2>Identity: where the real bugs live</h2>

      <p>
        Almost every &quot;attendance is wrong&quot; report resolves to identity, not to the device. The device
        recognised the finger perfectly; it was pointing at the wrong person.
      </p>

      <Table
        head={['Rule', 'Why it exists']}
        rows={[
          [
            <>A device name may only create a <strong>permanent</strong> mapping on a full-score match with no other plausible candidate.</>,
            <>The previous 0.6 similarity threshold mapped &quot;close enough&quot; names permanently. A forensic audit found what that cost.</>,
          ],
          [
            <>An unmatched device user is <strong>queued</strong>, never used to create a person.</>,
            <>USERINFO processing once silently created people and student rows from unknown names. A misspelling forked a duplicate learner that then accrued attendance against it.</>,
          ],
          [
            <>Two same-named learners → ambiguous → an operator decides.</>,
            <>Exact-name matching with <code>LIMIT 1</code> meant the lower id silently won the PIN forever.</>,
          ],
          [
            <>Device writes are scoped by the <strong>device&apos;s</strong> <code>school_id</code>.</>,
            <>A live K40 test exposed cross-school contamination from using the session&apos;s school instead.</>,
          ],
        ]}
      />

      <Source path="src/lib/biometric/name-match-policy.ts">
        Pure, no imports — so every caller applies exactly the same rule. Do not inline a variant.
      </Source>

      <h2>Correcting a wrong identity</h2>

      <Diagram>
{`  planCorrection()   PURE — decides validity and previews what changes
        │
        ▼
  applyCorrection()
        ├─ mapping_history row   who / when / old / new / why   ← FIRST
        ├─ move the PIN to the correct person
        └─ re-attribute historical raw events for that (PIN, device)
              events PRESERVED — only the identity label changes`}
      </Diagram>

      <p>
        Same principle in duplicate-person merge: attendance moves to the keeper, the loser is{' '}
        <strong>soft-deleted and restorable</strong>, and raw events are never deleted.
      </p>

      <h2>Devices</h2>

      <Table
        head={['Concern', 'Behaviour']}
        rows={[
          ['Ownership', <>One school at a time. Transfer is a two-step ceremony: release → acquire. Gated by <code>DEVICE_CLAIM_SECRET</code>, which is <strong>closed by default</strong> — unset means all transfers refused.</>],
          ['Offline', <>Devices buffer locally and send on reconnect. Take manual attendance meanwhile; it reconciles.</>],
          ['Clock drift', <>Detected and healed per device. Surfaced as a health badge, not only on a monitoring route.</>],
          ['Device cleanup', <>Queued as a best-effort command with an expiry. <strong>Never blocks</strong> an identity change — firmware support is inconsistent.</>],
          ['Reconciliation', <>Compares what the device holds against what DRAIS believes, in specific categories with a resolution lifecycle.</>],
        ]}
      />

      <Box kind="warning" title="Firmware is not uniform">
        <p>
          Some devices accept <code>DATA QUERY USERINFO</code>; some ignore it and the run stays pending
          forever. Some echo enrolments back; most silently ACK. Any feature that <em>requires</em> a device to
          answer will work on the bench and fail in a school. Design for the device never replying.
        </p>
      </Box>

      <h2>Live attendance</h2>

      <Box kind="warning" title="Poll-bound, not push-bound">
        <p>
          The in-process event bus does not cross serverless instances, so the ingest lambda cannot push to the
          popup. Latency is <em>ingest + poll interval</em>.
        </p>
        <p>
          There are two popup paths, and the fast one renders from a preloaded roster rather than fetching per
          scan. Do not &quot;optimise&quot; this with an in-memory emitter: it works in the Electron build and
          silently does nothing in production.
        </p>
      </Box>

      <h2>Performance</h2>

      <ul>
        <li><strong>Ingestion is the hot path.</strong> Six hundred learners arrive within twenty minutes. Keep per-event work bounded and push anything slow to a side effect.</li>
        <li><strong>Guardian SMS is fire-and-forget.</strong> A punch must never wait on a provider.</li>
        <li><strong>Cross-school health monitors are <code>GROUP BY</code>, not N+1</strong> — they scan every school.</li>
        <li><strong>Registers are per class, per day.</strong> Whole-school-per-term queries need care.</li>
      </ul>

      <h2>Testing</h2>

      <p>
        <code>npm run test:attendance</code>, <code>npm run test:ingestion</code>,{' '}
        <code>npm run test:biometric</code>. The pure modules — dedup, name-match policy, matching scores,{' '}
        <code>planCorrection</code>, merge grouping — are unit-tested without a database. Keep new logic in
        that shape.
      </p>

      <h2>Common mistakes</h2>

      <Table
        head={['Mistake', 'Consequence']}
        rows={[
          [<>Editing or deleting a raw event to &quot;fix&quot; attendance</>, <>Destroys the evidence. Re-attribute instead.</>],
          [<>Scoping a device write by the session&apos;s school</>, <>Cross-school contamination.</>],
          [<>Lowering the deterministic-match bar to clear a queue</>, <>Duplicate learners silently accruing attendance.</>],
          [<>Awaiting a device command</>, <>Identity operations hang whenever a device is offline.</>],
          [<>Adding an in-memory listener for live updates</>, <>Works locally; does nothing in production.</>],
          [<>Trusting the device timestamp</>, <>Arrivals filed on the wrong day.</>],
          [<>Treating 0% attendance as absence</>, <>It is nearly always a broken identity link. Check enrolment first.</>],
        ]}
      />

      <h2>Extension points</h2>

      <ul>
        <li><strong>New policy</strong> (shift patterns, half-days) → evaluation rules read at query time.</li>
        <li><strong>New device vendor</strong> → an adapter alongside the ZKTeco handler. Keep the raw-event shape.</li>
        <li><strong>New notification</strong> → <code>emit()</code> an event; never call a provider directly.</li>
        <li><strong>New identity signal</strong> (card, face) → resolve to <code>person_id</code> through <code>biometric_enrollments</code>; do not add a parallel mapping table.</li>
      </ul>

      <Source path="src/lib/ingestion/README.md" />
      <Source path="src/lib/biometric/README.md" />
      <Source path="src/lib/attendance/README.md" />

      <SeeAlso slugs={['request-lifecycle', 'schema', 'module-reports', 'decisions']} />
    </ControlDoc>
  );
}
