'use client';

import React from 'react';
import Link from 'next/link';
import HelpDoc, { Callout, GoTo, DefTable, Steps, Step } from '@/components/help/HelpDoc';

export default function Page() {
  return (
    <HelpDoc slug="attendance-daily">
      <p>
        Once fingerprints are enrolled, attendance mostly runs itself. This guide covers the parts that still
        need a person: reading the register, handling absences, correcting mistakes, and producing the reports
        staff and inspectors ask for.
      </p>

      <h2>The morning</h2>

      <p>
        <Link href="/attendance">Live attendance</Link> shows arrivals as they happen — name, class and photo,
        seconds after each scan.
      </p>

      <p>Worth having open during the first weeks of term, because it catches:</p>
      <ul>
        <li>a newly enrolled fingerprint that is not working;</li>
        <li>a device that has stopped reporting mid-morning;</li>
        <li>learners scanning but appearing as unknown.</li>
      </ul>

      <p><GoTo href="/attendance">Live attendance</GoTo></p>

      <h2>The daily register</h2>

      <p>
        Pick a class and a date and you get the register as teachers expect it: every learner, their status,
        and the actual arrival time where there was a scan.
      </p>

      <p><GoTo href="/attendance/logs">Attendance logs</GoTo></p>

      <p>From here you can:</p>
      <ul>
        <li>mark an absence as excused, with a reason;</li>
        <li>add a manual entry for a learner whose scan failed;</li>
        <li>sort by status to see all absences together;</li>
        <li>export or print for filing.</li>
      </ul>

      <Callout kind="note" title="Manual entries stay visible as manual">
        <p>
          DRAIS records the difference between a device scan and a staff entry, everywhere. That is deliberate:
          when someone asks how you know a learner was present, you can answer precisely — and a register that
          is entirely manual looks different from one that is entirely scans, as it should.
        </p>
      </Callout>

      <h2>How present, late and absent are decided</h2>

      <p>
        DRAIS keeps every scan exactly as it happened and applies your school&apos;s rules on top of it.
      </p>

      <DefTable
        rows={[
          ['Present', <>A scan within the window your school considers on time.</>],
          ['Late', <>A scan after the cut-off. Still present, but counted separately so lateness is visible rather than hidden.</>],
          ['Absent', <>No scan on a day the school was open to that learner.</>],
          ['Excused', <>Marked by staff — sickness, permission, a trip. Kept separate from unexplained absence in every summary.</>],
        ]}
      />

      <p><GoTo href="/attendance/settings">Attendance settings</GoTo></p>

      <Callout kind="success" title="Rules apply when attendance is read, not when it is recorded">
        <p>
          Change the late cut-off from 8:00 to 8:15 and past attendance is re-read under the new rule. The
          underlying scans never change. This is what lets a school adjust policy without corrupting history.
        </p>
      </Callout>

      <h2>Holidays and closures</h2>

      <p>
        Enter these at the start of term. A day marked as a holiday is excluded from attendance figures
        entirely — otherwise every learner shows as absent and the term percentage is wrong.
      </p>

      <p><GoTo href="/attendance/holidays">Holidays</GoTo></p>

      <h2>Term summaries</h2>

      <p>
        Days open, days attended, days absent, days late and attendance percentage — per learner, per class, or
        for the whole school. These are the figures that go onto report cards and into board meetings.
      </p>

      <p><GoTo href="/attendance/trends">Attendance trends</GoTo></p>

      <h2>The reports worth running</h2>

      <p>The useful ones surface a problem before anyone complains:</p>

      <ul>
        <li><strong>Consecutive absence</strong> — often the first sign a child has quietly stopped coming.</li>
        <li><strong>Chronic lateness</strong> — repeatedly late, never absent, so never flagged by a presence figure.</li>
        <li><strong>Never scanned</strong> — no scan all term.</li>
      </ul>

      <Callout kind="warning" title="Read a zero carefully">
        <p>
          A learner at 0% attendance almost certainly has a broken fingerprint link, not a term of absence.
          Check their fingerprint status on the learner profile before contacting the family. Getting this
          wrong is embarrassing in a way that is hard to undo.
        </p>
      </Callout>

      <h2>When a device is down</h2>

      <Steps>
        <Step title="Take attendance manually for the affected classes">
          From <Link href="/attendance/logs">Attendance logs</Link>. It is recorded as manual, which is honest.
        </Step>
        <Step title="Check the device">
          Network first — that is the cause most of the time. See{' '}
          <Link href="/attendance/health">Device health</Link>.
        </Step>
        <Step title="Let it reconcile">
          Most devices store scans locally and send them when the connection returns. You do not lose the day.
        </Step>
      </Steps>

      <h2>Attendance on report cards</h2>

      <p>
        Attendance figures print on report cards — days attended out of days open, and a percentage. They are
        frozen into the report card at generation, so a reprint shows the same figures as the original. See{' '}
        <Link href="/help/guides/marks-and-reports">Marks and report cards</Link>.
      </p>

      <h2>Notifying guardians</h2>

      <p>
        Arrival alerts and absence notices are configured separately — see{' '}
        <Link href="/help/guides/messages">Messaging guardians</Link>. Absence notices in particular are worth
        holding for staff review rather than sending automatically.
      </p>
    </HelpDoc>
  );
}
