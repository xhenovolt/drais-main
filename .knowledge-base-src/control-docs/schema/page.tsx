'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="schema">
      <p>
        There are roughly 330 tables. You will care about about fifteen. This page covers those — not their
        columns, which the dictionary lists, but <strong>why each exists</strong> and what breaks when the
        distinction it encodes is collapsed.
      </p>

      <Source path="docs/database/TABLE_DICTIONARY.md">Column-level reference for all ~330 tables.</Source>

      <h2>The identity spine</h2>

      <p>The single most important shape in the schema. Three tables where a naive design would have one.</p>

      <Diagram caption="A human, that human as a learner here, and where they sat this term.">
{`   people                     the HUMAN
     id                        stable for life; survives everything below
     first_name, last_name, gender, dob
        │
        │ person_id
        ▼
   students                   that human AS A LEARNER AT THIS SCHOOL
     id, school_id, person_id
     admission_no, status, deleted_at
        │
        │ student_id
        ▼
   enrollments                WHERE THEY SAT, IN A GIVEN TERM
     id, student_id, class_id, stream_id, term_id
     one ACTIVE at a time  +  full history

   marks / attendance / fees attach to the ENROLMENT era, not to the learner`}
      </Diagram>

      <Box kind="invariant" title="Never collapse learner and enrolment">
        <p>
          It is the distinction that makes history representable. Because a mark belongs to an era rather than
          to a person, a whole class can be promoted without touching a single historical record, and last
          year&apos;s report card correctly names last year&apos;s class.
        </p>
        <p>
          Denormalising <code>class_id</code> onto <code>students</code> — which looks like an obvious
          simplification — makes it impossible to answer &quot;which class was this learner in during Term 2
          last year&quot; without rebuilding the concept you removed.
        </p>
      </Box>

      <Table
        head={['Question', 'Where to look']}
        rows={[
          ['Who is this human?', <code>people</code>],
          ['Are they a learner here, and are they still active?', <code>students</code>],
          ['Which class are they in now?', <>the active <code>enrollments</code> row</>],
          ['Which class were they in last year?', <>the historical <code>enrollments</code> row</>],
        ]}
      />

      <Box kind="warning" title="person_id vs student_id — the recurring bug">
        <p>
          Some tables key off <code>person_id</code> (anything that can describe staff or learners —
          attendance, biometrics) and others off <code>student_id</code> (anything learner-specific — marks,
          fees). Joining the wrong one produces a query that runs, returns rows, and is silently wrong.
        </p>
        <p>
          <code>attendance_records.person_id</code> is <code>students.person_id</code>, <strong>not</strong>{' '}
          <code>students.id</code>. Join through <code>students</code>.
        </p>
      </Box>

      <h2>Attendance</h2>

      <Table
        head={['Table', 'Purpose', 'The rule']}
        rows={[
          [
            <code>attendance_raw_events</code>,
            <>Every scan, exactly as it happened. Device, PIN, both timestamps, resolved person.</>,
            <><strong>Append-only. Never updated, never deleted</strong> — not by a correction, not by a device transfer, not by a learner leaving. This is the evidence a school shows a ministry (ADR-0001).</>,
          ],
          [
            <code>attendance_records</code>,
            <>The daily roll-up: one row per person per day with a status.</>,
            <>Derived from raw events plus school policy. Safe to recompute; it is an interpretation, not evidence.</>,
          ],
          [
            <code>biometric_enrollments</code>,
            <>The identity link: <code>(school_id, device_sn, device_user_pin) → person_id</code>.</>,
            <>The canonical mapping table. <code>uk_school_pin</code> makes PIN allocation race-free. Replaced a three-table fallback chain that gave different answers to different readers.</>,
          ],
          [
            <code>pending_device_users</code>,
            <>Device users that could not be matched deterministically.</>,
            <>The queue exists so DRAIS never <em>guesses</em>. A near-match once created duplicate learners that then accrued attendance.</>,
          ],
        ]}
      />

      <Box kind="tip" title="Two timestamps, on purpose">
        <p>
          <code>punch_at</code> is the actual server instant. The device-reported time is stored separately and
          used for <strong>dedup</strong>. Field devices have been observed hours fast — trusting their clock
          would file arrivals on the wrong day, while ignoring it entirely would break re-send deduplication.
        </p>
      </Box>

      <h2>Reporting</h2>

      <Table
        head={['Table', 'Purpose', 'The rule']}
        rows={[
          [
            <code>report_snapshots</code>,
            <>A frozen copy of a class&apos;s results at generation time. <code>snapshot_json</code> LONGTEXT plus <code>data_hash</code>.</>,
            <>Immutable once written. Every render reads this and never the live results tables (ADR-0005). <code>uk_inflight</code> enforces single-flight generation per (school, term, year, type).</>,
          ],
          [
            <code>report_card_overrides</code>,
            <>Per-student, per-snapshot render adjustments.</>,
            <>Cascades on snapshot deletion via FK. Transforms the <em>document</em>, never the academic data.</>,
          ],
          [
            <code>dvcf_documents</code>,
            <>School-authored report card layouts as JSON.</>,
            <>Layout is <strong>data</strong>, which is why a school can redesign its report card without a deploy.</>,
          ],
        ]}
      />

      <Box kind="warning" title="snapshot_json is a LONGTEXT with no chunking">
        <p>
          A very large school produces a very large row. This is a known scaling ceiling, not an oversight —
          but it means &quot;just add a field to the snapshot&quot; has a real cost at the top end.
        </p>
        <p>
          Adding a field also changes <code>data_hash</code> for new snapshots. Old ones keep their old hash,
          and that is correct — do not backfill.
        </p>
      </Box>

      <h2>Finance</h2>

      <Table
        head={['Table', 'Purpose', 'The rule']}
        rows={[
          [<code>student_ledger</code>, <>Debits (charges) and credits (payments).</>, <><strong>Append-only.</strong> Balance is <code>SUM(debit) − SUM(credit)</code>, computed on read. A correction is a compensating entry.</>],
          [<code>student_fee_items</code>, <>What a learner is expected to pay this term.</>, <>Distinct from the ledger: expectation vs charge. Both must be kept in step.</>],
          [<code>finance_payments</code>, <>Receipts, with the money location they landed in.</>, <>Carries <code>account_id</code> — without it, money is recorded but not traceable.</>],
          [<code>wallets</code>, <>Money locations: cash box, bank, mobile money, aggregator.</>, <>Balance derived from opening balance ± payments, transfers and expenses.</>],
        ]}
      />

      <Box kind="invariant" title="No balance column exists anywhere, and none may be added">
        <p>
          A stored balance is a second source of truth that drifts the first time a write fails halfway. In a
          finance module, drift is not a bug you ship past — a school finds it during an audit and stops
          trusting the system.
        </p>
        <p>If a read is too slow, cache the computation with an explicit invalidation story. Do not denormalise.</p>
      </Box>

      <h2>Access</h2>

      <Table
        head={['Table', 'Domain', 'Note']}
        rows={[
          [<><code>users</code>, <code>sessions</code></>, 'School staff', <>bcrypt. <code>user_roles → roles → role_permissions → permissions</code>.</>],
          [<code>permissions</code>, 'School staff', <>A <em>projection</em> of the code catalog. Removed codes are deactivated, never deleted, so grants survive.</>],
          [<code>parent_student_links</code>, 'Parents', <>The <strong>grant</strong>. A matching phone number is only evidence; this row is access.</>],
          [<><code>control_users</code>, <code>control_sessions</code></>, 'Xhenvolt', <>scrypt. Only the SHA-256 of a session token is stored.</>],
        ]}
      />

      <h2>Tenancy: how a table joins the tenant model</h2>

      <p>
        Most tables carry <code>school_id</code>. Some are reachable only through a foreign key to one that
        does. Nothing hardcodes a list — the backup module classifies every table by walking{' '}
        <code>information_schema</code>:
      </p>

      <Table
        head={['Class', 'Detection', 'Consequence']}
        rows={[
          [<code>direct</code>, <>has a <code>school_id</code> column</>, <>Scoped with <code>WHERE school_id = ?</code>.</>],
          [<code>indirect</code>, <>FK path to a school-scoped table</>, <>Scoped by a nested subquery built from a BFS path.</>],
          [<>global</>, <>no path to <code>schools</code></>, <><strong>Excluded from school backups.</strong></>],
        ]}
      />

      <Box kind="tip" title="This is why new tables are backed up automatically">
        <p>
          Give a table a <code>school_id</code>, or an FK to something that has one, and it is included in
          school backups and exports without touching that code. A table with neither is invisible to both —
          usually correct for a global catalog, and a silent data-loss bug for anything tenant-owned.
        </p>
      </Box>

      <h2>Soft delete</h2>

      <p>
        Most tenant tables carry <code>deleted_at</code>. Deletion routes through one registry and one service
        rather than per-feature SQL.
      </p>

      <Box kind="warning" title="Two things this costs you">
        <p>
          Every query elsewhere must remember <code>deleted_at IS NULL</code>. Forgetting it is the most common
          way a &quot;deleted&quot; learner reappears in a list, a count, or a report.
        </p>
        <p>Soft-deleted rows still occupy the table. Purge is a separate, guarded operation.</p>
      </Box>

      <h2>Before you add a table</h2>

      <ol>
        <li>Does it need <code>school_id</code>? Almost certainly yes — otherwise it is invisible to backups and exports.</li>
        <li>Does it need <code>deleted_at</code>? If a user can delete it, yes.</li>
        <li>Does it key off <code>person_id</code> or <code>student_id</code>? Choose deliberately.</li>
        <li>Is it a log or a state row? Logs are append-only; state rows are updatable. Do not mix the two in one table.</li>
        <li>Write the numbered migration. The runtime ensure-schema fallback is a safety net, not the strategy.</li>
      </ol>

      <SeeAlso slugs={['data', 'playbook-module', 'module-attendance', 'module-finance']} />
    </ControlDoc>
  );
}
