'use client';

import React from 'react';
import Link from 'next/link';
import HelpDoc, { Callout, Steps, Step, GoTo, DefTable } from '@/components/help/HelpDoc';

export default function Page() {
  return (
    <HelpDoc slug="learners">
      <p>
        Admission is a one-off. Everything after it is the long work — transfers, promotion, leavers, and the
        duplicates that appear no matter how careful the office is.
      </p>

      <h2>One idea worth ten minutes</h2>

      <p>
        DRAIS separates the <strong>learner</strong> from their <strong>enrolment</strong>. The learner is the
        child. The enrolment says which class they were in, in which term.
      </p>

      <p>
        That separation is why a learner can move class, repeat a year or be promoted without losing a single
        historical mark — and why last year&apos;s report card still names last year&apos;s class. It also
        explains most of the &quot;why does it work like that?&quot; questions below.
      </p>

      <h2>Admitting a learner</h2>

      <p><GoTo href="/admissions">Admissions</GoTo></p>

      <Callout kind="warning" title="Search before you admit">
        <p>
          Most duplicates are created by staff who search for &quot;Nakato&quot;, find nothing because the
          record says &quot;Nakatto&quot;, and create a new one. Search by admission number, or by part of a
          name rather than the whole name.
        </p>
        <p>
          If a former learner is returning, <strong>find their existing record and re-enrol them</strong>. Do
          not admit them again.
        </p>
      </Callout>

      <p>Get the guardian details right at admission — they drive parent portal access and every SMS:</p>
      <ul>
        <li>Full phone number including the country code. A number saved without it never delivers.</li>
        <li>Which guardian should receive messages.</li>
        <li>More than one contact, where a family has two.</li>
      </ul>

      <h2>The learner profile</h2>

      <p>
        Everything about one learner in one place — details, enrolment history, guardians, attendance, results,
        fees and fingerprint status.
      </p>

      <p><GoTo href="/students">Learners</GoTo></p>

      <Callout kind="tip">
        <p>
          The fingerprint panel tells you not just whether they are enrolled but <em>where the process is
          stuck</em> if they are not. That is usually enough to fix it without contacting support.
        </p>
      </Callout>

      <h2>Moving between classes or streams</h2>

      <Steps>
        <Step title="Open the learner and choose Change Class">
          Or move several at once from the learners list.
        </Step>
        <Step title="Pick the new class, stream and term">
          DRAIS closes the current enrolment and opens a new one.
        </Step>
        <Step title="Confirm">
          Previous marks, attendance and fees stay attached to the enrolment they were recorded under.
        </Step>
      </Steps>

      <Callout kind="note" title="History does not follow them, and should not">
        <p>
          A learner who moves from S1 East to S1 West in Term 2 keeps their Term 1 record under S1 East.
          That is correct — the Term 1 report card should say S1 East, because that is where they were.
        </p>
      </Callout>

      <h2>End of year: promotion</h2>

      <p>Move whole classes up at once, after results are final.</p>

      <p><GoTo href="/promotions">Promotions</GoTo></p>

      <Steps>
        <Step title="Create the new academic year and terms first">
          <Link href="/academics/years">Academic Years</Link>.
        </Step>
        <Step title="Map each class to its successor">
          P4 → P5, S3 → S4. Final-year classes map to leaving.
        </Step>
        <Step title="Mark the exceptions">
          Repeaters stay put; non-returners are marked as leaving.
        </Step>
        <Step title="Read the preview, then run">
          DRAIS shows exactly how many learners move where before writing anything. That screen is much easier
          than unwinding afterwards.
        </Step>
      </Steps>

      <Callout kind="warning">
        <p>
          Run promotion <strong>once</strong>. Running it twice creates a second set of enrolments. If you are
          not sure whether it has already run, check the current class of a few learners first.
        </p>
      </Callout>

      <h2>Learners who leave</h2>

      <p>Mark them as left, with a reason and a date. Then do two things at the same time:</p>

      <ul>
        <li>
          <strong>Queue removal of their fingerprint from the device</strong> — otherwise it keeps recognising
          them locally.
        </li>
        <li><strong>Settle or write off the fee balance</strong>, so outstanding figures stay meaningful.</li>
      </ul>

      <h2>Duplicates</h2>

      <p>
        The symptom is usually attendance that looks wrong — half the days under one record, half under
        another. DRAIS groups likely duplicates by name and shows what each record holds.
      </p>

      <p>You choose which record to keep, preview exactly what will move, and merge:</p>
      <ul>
        <li>attendance, marks and payments move to the record you keep;</li>
        <li>the other is archived, not destroyed;</li>
        <li>the whole operation is logged.</li>
      </ul>

      <h2>Correcting details</h2>

      <DefTable
        rows={[
          ['Name', <>Safe to correct. If the fingerprint was enrolled on the device keypad under the old spelling, the device shows the old name until re-synced.</>],
          ['Admission number', <>Changeable, but it appears on documents already issued. Correct a genuine error; think twice otherwise.</>],
          ['Class', <>Use Change Class rather than editing, so the enrolment history stays right.</>],
          ['Guardian phone', <>Correct it here and the parent portal and SMS both follow.</>],
        ]}
      />

      <p>Changes are recorded in the <Link href="/admin/audit-logs">audit log</Link>.</p>

      <h2>Deleting a learner</h2>

      <Callout kind="warning">
        <p>
          In almost every case the right action is to mark a learner as <strong>left</strong>, not to delete
          them. Deleting is for genuine mistakes — a record created twice, or a test entry. A learner who
          actually attended your school should keep their history.
        </p>
        <p>
          Deleted records go to <Link href="/admin/trash">Trash</Link> and can be restored. See{' '}
          <Link href="/help/guides/recover-data">Recovering data</Link>.
        </p>
      </Callout>
    </HelpDoc>
  );
}
