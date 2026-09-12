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

      <h2>Importing learners from Start</h2>

      <p>
        The import flow works best when the file is organised the way DRAIS expects. DRAIS can auto-detect
        many columns, but the school must still give it a predictable structure. This is the main reason a
        weak Start export feels confusing: the system is smart, but the file layout still matters.
      </p>

      <Callout kind="tip" title="Expected structure">
        <p>Prepare one row per learner. The most common columns are:</p>
        <ul>
          <li><strong>name</strong> or <strong>first_name</strong> + <strong>last_name</strong></li>
          <li><strong>reg_no</strong> or admission number</li>
          <li><strong>class</strong> and optional <strong>section</strong> / stream</li>
          <li><strong>gender</strong>, <strong>date_of_birth</strong>, <strong>phone</strong>, <strong>address</strong></li>
        </ul>
        <p>
          If the import file only has one name column, map it to <strong>Full Name</strong>. If it has separate
          first and last name columns, map both separately. Do not mix the two into one column unless you are
          intentionally using a single full-name field.
        </p>
      </Callout>

      <DefTable
        rows={[
          ['Required', 'At least one name field must be present. If you have first_name and last_name, both are better.'] ,
          ['Admission number', 'Use reg_no if available. DRAIS matches duplicates by registration number first, then by name + class.'],
          ['Class names', 'Use the exact class names already in DRAIS, for example Senior One, Form 1, Primary 4.'],
          ['Streams', 'Use the same stream names your school already uses, or create them before import if needed.'],
          ['Dates', 'Keep DOB in a clear date format such as YYYY-MM-DD.'],
        ]}
      />

      <p>Example of the shape DRAIS expects:</p>
      <pre className="overflow-x-auto rounded-md bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
name,first_name,last_name,reg_no,class,section,gender,date_of_birth,phone,address
Ali Hassan,, ,ADM-001,Senior One,A,M,2010-05-14,0700000001,Kampala
Fatuma Nuru,Fatuma,Nuru,ADM-002,Senior Two,B,F,2009-08-22,0700000002,Entebbe
      </pre>

      <Steps>
        <Step title="Prepare the file from Start">
          Export the learner list with one row per learner and standard headers. Remove blank sheets and duplicate rows before uploading.
        </Step>
        <Step title="Upload and preview">
          Open the import screen, upload the file, and review the first rows. DRAIS will show the detected columns and warnings.
        </Step>
        <Step title="Map the columns">
          If DRAIS does not match the fields correctly, map each field to the correct source column. This is where the school usually corrects name and class mismatches.
        </Step>
        <Step title="Import and verify">
          Run the import, check the summary, and verify a few learners in their classes before moving on.
        </Step>
      </Steps>

      <Callout kind="warning" title="Common issue to avoid">
        <p>
          A file with two name columns but the same data in both places can confuse DRAIS. If first_name and
          last_name both point to the same source column, the import is blocked until you remap the fields.
        </p>
      </Callout>

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
