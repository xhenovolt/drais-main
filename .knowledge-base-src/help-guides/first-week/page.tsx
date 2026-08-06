'use client';

import React from 'react';
import Link from 'next/link';
import HelpDoc, { Callout, Steps, Step, GoTo, Where, DefTable } from '@/components/help/HelpDoc';

export default function Page() {
  return (
    <HelpDoc slug="first-week">
      <p>
        There is an order to setting up DRAIS. Following it means nothing has to be redone; skipping ahead
        usually means re-entering learners because the classes were not ready. This is that order.
      </p>

      <h2>Before anything else: the academic structure</h2>

      <p>
        Almost everything in DRAIS attaches to a <strong>term</strong> and a <strong>class</strong>. Until those
        exist, there is nowhere for a learner, a mark or a fee to go.
      </p>

      <Steps>
        <Step title="Create the academic year and its terms">
          <p>Set start and end dates for each term — they decide which days count for attendance.</p>
          <p><GoTo href="/academics/years">Academic Years</GoTo></p>
        </Step>
        <Step title="Set the current term">
          <p>
            This is the term DRAIS assumes when someone records something without saying otherwise.
            <strong> Set it at the start of every term.</strong> Forgetting is the most common setup mistake and
            it files a week of records against the wrong term.
          </p>
          <p><GoTo href="/terms">Terms</GoTo></p>
        </Step>
        <Step title="Create classes and streams">
          <p>Your levels, and their divisions if you use them.</p>
          <p><GoTo href="/academics/classes">Classes</GoTo></p>
        </Step>
        <Step title="Add subjects and allocate them to classes">
          <p>What is taught, and which classes take each subject. Marks entry depends on this.</p>
          <p><GoTo href="/academics/subjects">Subjects</GoTo></p>
        </Step>
      </Steps>

      <Callout kind="warning" title="Do not admit learners before this is done">
        <p>
          A learner admitted without classes existing has nowhere to be enrolled. It is far quicker to spend
          thirty minutes on structure than to fix two hundred enrolments afterwards.
        </p>
      </Callout>

      <h2>Then: your school profile</h2>

      <p>
        Name, address, phone, motto and logo. These print on every report card and receipt, so it is worth
        getting the logo right — upload the highest-quality version you have.
      </p>

      <p><GoTo href="/settings/school">School Information</GoTo></p>

      <h2>Then: staff and access</h2>

      <p>
        Add your staff and give each one a role before you hand the system over to them. Decide the access
        first — widening access later is easy, taking it back is awkward.
      </p>

      <ul>
        <li><Link href="/admin/staff">Staff records</Link> — who works at the school.</li>
        <li><Link href="/admin/users">User accounts</Link> — their sign-ins.</li>
        <li><Link href="/admin/roles">Roles</Link> — what each role can do.</li>
      </ul>

      <Callout kind="tip">
        <p>
          Keep two Super Admins — no more, no fewer. One means being locked out when that person is away;
          several means nobody is really accountable. See <Link href="/help/guides/users-and-access">Staff
          accounts and access</Link>.
        </p>
      </Callout>

      <h2>Then: learners</h2>

      <p>
        Now the structure is ready, admit learners into it. For a whole school, use the import rather than
        typing — but import one class first and check it before running the rest.
      </p>

      <p><GoTo href="/students">Learners</GoTo></p>

      <p>
        See <Link href="/help/guides/learners">Learners day to day</Link> for admission, guardians and the
        traps around duplicates.
      </p>

      <h2>Then: devices and fingerprints</h2>

      <p>
        Register your fingerprint devices, then enrol learners class by class. Enrolling a whole class in one
        sitting is far faster than a few at a time across a week.
      </p>

      <ul>
        <li><Link href="/attendance/devices">Devices</Link> — register and check status.</li>
        <li><Link href="/attendance/enrollment">Fingerprint enrolment</Link>.</li>
      </ul>

      <p>
        Full detail in <Link href="/help/guides/enrol-fingerprints">Enrolling fingerprints</Link>.
      </p>

      <Callout kind="warning" title="Check the next morning">
        <p>
          Do not assume an enrolment session worked. Watch{' '}
          <Link href="/attendance">live attendance</Link> the following morning and confirm learners are
          appearing. Finding a problem on day two is cheap; finding it at the end of term is not.
        </p>
      </Callout>

      <h2>Then: attendance rules</h2>

      <p>Set the times that decide present, late and absent, and enter the term&apos;s holidays.</p>

      <DefTable
        rows={[
          ['School day start', <>When the day begins.</>],
          ['Late cut-off', <>After this, an arrival counts as late.</>],
          ['Absence cut-off', <>After this, a learner with no scan is absent — and absence notices can go out.</>],
          ['Holidays', <>Days excluded from attendance figures entirely.</>],
        ]}
      />

      <ul>
        <li><Link href="/attendance/settings">Attendance settings</Link></li>
        <li><Link href="/attendance/holidays">Holidays</Link></li>
      </ul>

      <h2>Last: messages and fees</h2>

      <p>
        Leave these until the data is clean. Switching on arrival alerts while contact numbers are still
        half-imported means a week of messages to the wrong families.
      </p>

      <ul>
        <li><Link href="/admin/communications">Communication settings</Link> — start with messages held for review, not automatic.</li>
        <li><Link href="/finance">Finance</Link> — fee structure, then billing.</li>
      </ul>

      <p>
        See <Link href="/help/guides/messages">Messaging guardians</Link> and{' '}
        <Link href="/help/guides/fees">Fees and payments</Link>.
      </p>

      <h2>The short version</h2>

      <ol>
        <li>Academic year and terms → set current term</li>
        <li>Classes and streams → subjects</li>
        <li>School profile and logo</li>
        <li>Staff, users, roles</li>
        <li>Learners</li>
        <li>Devices → fingerprints → verify next morning</li>
        <li>Attendance rules and holidays</li>
        <li>Messages (reviewed first), then fees</li>
      </ol>

      <Callout kind="success" title="Every term after this">
        <p>
          Create the term · set it as current · run promotion and check class lists · enter holidays · confirm
          fee structures. Five minutes that prevents most week-one problems.
        </p>
      </Callout>
    </HelpDoc>
  );
}
