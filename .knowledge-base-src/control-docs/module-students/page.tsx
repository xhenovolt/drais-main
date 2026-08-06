'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso, FiveQuestions } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="module-students">
      <p>
        64 API routes and 19 pages. Nothing else in DRAIS works until this does — attendance, marks, fees and
        the parent portal all resolve back to a learner record.
      </p>

      <FiveQuestions
        what={<>Learner identity and lifecycle: admission, guardians, enrolment, transfer, promotion, leaving, duplicates, documents, ID cards, and bulk import.</>}
        why={<>Every other module is a fact <em>about a learner over a period of time</em>. If identity is wrong, every downstream figure is wrong — and wrong in a way that is discovered late.</>}
        how={<>A three-table identity spine (person → student → enrolment) with append-style history, plus lifecycle operations that move records rather than rewriting them.</>}
        where={<><code>src/app/students/*</code> · <code>src/app/api/students/*</code> · <code>src/app/admissions</code> · <code>src/app/promotions</code> · <code>src/lib/biometric/person-merge.ts</code></>}
        extend={<>Attach new facts to the enrolment era, not the learner. Never collapse the spine. Never create a learner from an unverified external signal.</>}
      />

      <h2>The identity spine</h2>

      <Diagram caption="Three tables where a naive design has one. This is the most important shape in the schema.">
{`   people          the HUMAN — stable for life
      │  person_id
      ▼
   students        that human AS A LEARNER AT THIS SCHOOL
      │            school_id, admission_no, status, deleted_at
      │  student_id
      ▼
   enrollments     WHERE THEY SAT, IN A GIVEN TERM
                   class_id, stream_id, term_id
                   ONE active  +  full history

   marks · attendance · fees  attach to the ERA, not to the person`}
      </Diagram>

      <Box kind="invariant" title="Never denormalise class onto the learner">
        <p>
          Putting <code>class_id</code> on <code>students</code> looks like an obvious simplification. It makes
          &quot;which class was this learner in during Term 2 last year&quot; unanswerable, which breaks every
          historical report card and every year-on-year comparison.
        </p>
        <p>
          The separation is exactly what lets a whole class be promoted without touching a single historical
          record.
        </p>
      </Box>

      <Box kind="warning" title="person_id vs student_id">
        <p>
          Tables that can describe staff <em>or</em> learners (attendance, biometrics) key off{' '}
          <code>person_id</code>. Learner-specific tables (marks, fees) key off <code>student_id</code>.
        </p>
        <p>
          <code>attendance_records.person_id</code> is <code>students.person_id</code>, not{' '}
          <code>students.id</code>. Joining the wrong one produces a query that runs, returns rows, and is
          silently wrong.
        </p>
      </Box>

      <h2>Admission</h2>

      <p>
        A single transaction across four tables: person, student, enrolment, guardian contacts. Then two
        fire-and-forget side effects — search indexing and any admission notification.
      </p>

      <Box kind="warning" title="Search the existing records before creating">
        <p>
          Most duplicates are created here, by staff who search for &quot;Nakato&quot;, find nothing because
          the record says &quot;Nakatto&quot;, and create a new learner. A returning former learner must be{' '}
          <strong>re-enrolled, not re-admitted</strong>.
        </p>
        <p>
          There is a <code>detect-duplicates</code> route and a duplicates UI precisely because prevention is
          imperfect.
        </p>
      </Box>

      <h3>Guardian contacts matter more than they look</h3>

      <p>
        They drive parent-portal eligibility and every guardian SMS. A phone number stored without a country
        code will never deliver, and will never produce an error anyone sees — the message simply does not
        arrive.
      </p>

      <h2>Bulk operations</h2>

      <p>
        The routes reveal how much of the real work is bulk: <code>bulk/enroll</code>,{' '}
        <code>bulk/enroll-sse</code>, <code>bulk-assign-class</code>, <code>bulk-photo-upload</code>,{' '}
        <code>bulk-photo-map</code>, <code>bulk/delete</code>, <code>import</code>, <code>enroll-bulk</code>.
      </p>

      <Table
        head={['Concern', 'How it is handled']}
        rows={[
          [<>Long-running import</>, <>Server-sent events (<code>bulk/enroll-sse</code>) so the browser sees progress rather than a spinner that may or may not be alive.</>],
          [<>Silent failure</>, <>Long loops must emit through <code>useProgress()</code>. A silent long operation is treated as a defect here.</>],
          [<>Partial application</>, <>Report per-row outcomes. &quot;437 of 450 imported&quot; with the 13 named is actionable; &quot;done&quot; is not.</>],
          [<>Serverless timeout</>, <>Bounded batches. Anything scaling with school size cannot be one request.</>],
        ]}
      />

      <Box kind="tip" title="Import one class first">
        <p>
          The operational advice given to schools, and the same advice for testing a change: run one class,
          verify it, then run the rest. A bad column mapping applied to 450 learners is a long afternoon.
        </p>
      </Box>

      <h2>Promotion</h2>

      <Diagram>
{`  choose closing year → opening year        (new year + terms must exist first)
  map each class to its successor           P4→P5, S3→S4, final→leaving
  mark exceptions                           repeaters stay, non-returners leave
  PREVIEW  ← exact counts, before anything is written
  run      → closes current enrolments, opens new ones`}
      </Diagram>

      <Box kind="warning" title="Promotion is not idempotent">
        <p>
          Running it twice creates a second set of enrolments. There is a preview step because unwinding is far
          harder than reading a screen. If you are unsure whether it has run, check the current class of a few
          learners first.
        </p>
      </Box>

      <h2>Leaving</h2>

      <p>Marking a learner as left is three things, and only the first is automatic:</p>

      <ol>
        <li>Status change — they leave class lists, registers and mark sheets from that date.</li>
        <li><strong>Queue removal of their fingerprint from the device</strong>, or it keeps recognising them locally and 1:N-matching against them.</li>
        <li><strong>Settle or write off the fee balance</strong>, or outstanding figures stay permanently inflated.</li>
      </ol>

      <Box kind="invariant" title="Left is not deleted">
        <p>
          A learner who actually attended keeps their history. Deletion is for genuine mistakes — a record
          created twice, a test entry. Deleted records go to trash and are restorable; permanent purge shows
          its dependency impact first.
        </p>
      </Box>

      <h2>Duplicates and merge</h2>

      <p>
        The symptom is nearly always attendance that looks wrong — half the days under one record, half under
        another. Merge is built on the same re-attribution engine as identity correction:
      </p>

      <ul>
        <li>Detect same-name candidates; <code>normalizeName()</code> and <code>groupDuplicates()</code> are pure and unit-tested.</li>
        <li>Preview exactly what moves before confirming.</li>
        <li>Attendance, marks and payments move to the keeper.</li>
        <li>The loser is <strong>soft-deleted and restorable</strong>; raw events are never deleted.</li>
      </ul>

      <h2>Performance</h2>

      <ul>
        <li><strong>The learner list is the heaviest routine screen</strong> — 48.7 kB of client bundle, filtering across several joined tables. Server-side pagination, not <code>usePagination()</code>, which is in-memory.</li>
        <li><strong>Photos are the storage cost.</strong> Bulk photo upload and mapping exist so a school can do it once, correctly.</li>
        <li><strong>Every list query needs <code>deleted_at IS NULL</code></strong> — the most common way a removed learner reappears in a count.</li>
      </ul>

      <h2>Common mistakes</h2>

      <Table
        head={['Mistake', 'Consequence']}
        rows={[
          [<>Re-admitting a returning learner</>, <>Duplicate; history split in two.</>],
          [<>Editing class instead of changing enrolment</>, <>History rewritten; last year&apos;s report card now names the wrong class.</>],
          [<>Joining <code>student_id</code> where <code>person_id</code> is meant</>, <>Query runs, returns rows, silently wrong.</>],
          [<>Running promotion twice</>, <>Duplicate enrolments.</>],
          [<>Deleting instead of marking as left</>, <>Loses a real learner&apos;s history.</>],
          [<>Forgetting <code>deleted_at IS NULL</code></>, <>Deleted learners in lists, counts and reports.</>],
          [<>Bulk operation without progress or per-row results</>, <>Staff cannot tell what actually happened.</>],
          [<>Creating a learner from an unverified device name</>, <>Phantom learners that accrue attendance. This has happened.</>],
        ]}
      />

      <h2>Extension points</h2>

      <ul>
        <li><strong>New learner attribute</strong> → custom fields where possible; a column only if it must be queried or indexed.</li>
        <li><strong>New lifecycle event</strong> → a new enrolment era or a status transition, never an in-place edit of history.</li>
        <li><strong>New bulk operation</strong> → bounded batches, progress events, per-row results.</li>
        <li><strong>New identity signal</strong> → resolve to an existing <code>person_id</code>. Do not create people from external data.</li>
      </ul>

      <Source path="src/lib/biometric/person-merge.ts">Duplicate detection and merge; pure helpers are tested.</Source>
      <Source path="docs/guides/ENROLLMENT_REASSIGNMENT_SYSTEM.md">Reassignment rules and testing.</Source>

      <SeeAlso slugs={['schema', 'module-attendance', 'module-portal', 'request-lifecycle']} />
    </ControlDoc>
  );
}
