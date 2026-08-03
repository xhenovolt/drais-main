'use client';

import React from 'react';
import Link from 'next/link';
import HelpDoc, { Callout } from '@/components/help/HelpDoc';

export default function Page() {
  return (
    <HelpDoc slug="fix-problems">
      <p>
        Most problems resolve to one of a dozen causes. Find the symptom below — working through it is usually
        faster than waiting for a reply from support.
      </p>

      <h2>Attendance</h2>

      <h3>A learner shows 0% attendance for the term</h3>
      <p>
        Nearly always an enrolment problem, not an attendance problem. Open the learner on{' '}
        <Link href="/students">Learners</Link> and check the fingerprint panel. If it says not enrolled, or
        enrolled but never distributed to a device, that is your answer.
      </p>
      <Callout kind="warning">
        <p>
          Check this <em>before</em> contacting the family. A learner marked absent for a term who was actually
          present every day is a difficult conversation to walk back.
        </p>
      </Callout>

      <h3>Scans are happening but nothing reaches DRAIS</h3>
      <p>
        Check the device&apos;s last-seen time on <Link href="/attendance/devices">Devices</Link>. If it is
        stale, the device has lost its network connection — records are usually stored locally and arrive when
        it reconnects. If the device is online, look for unlinked PINs on{' '}
        <Link href="/attendance/identity-matching">Identity matching</Link>: the scans are arriving but cannot
        be matched to a learner.
      </p>

      <h3>Attendance credited to the wrong learner</h3>
      <p>
        The identity link is wrong. Use <strong>Correct Identity</strong> from the learner profile. DRAIS shows
        what will change before you confirm, and the original scans are preserved.
      </p>

      <h3>Arrival times are hours off</h3>
      <p>
        The device clock has drifted. DRAIS records the true arrival instant, so your data is not wrong — but
        fix the device clock. Check <Link href="/attendance/health">Device health</Link>.
      </p>

      <h3>Learners marked absent who were present</h3>
      <p>
        Check the absence cut-off on <Link href="/attendance/settings">Attendance settings</Link>. A cut-off
        earlier than your actual assembly time marks late arrivals as absent.
      </p>

      <h3>Everyone shows absent on a particular day</h3>
      <p>
        The day was probably a holiday that was never entered. Add it to{' '}
        <Link href="/attendance/holidays">Holidays</Link> and the figures correct themselves.
      </p>

      <h2>Marks and report cards</h2>

      <h3>Marks were entered but do not appear</h3>
      <p>
        Check the term. Marks entered while the wrong term was current are filed against that term. Confirm the
        current term on <Link href="/terms">Terms</Link>, then check the term selector on the marks screen.
      </p>

      <h3>A report card shows old marks</h3>
      <p>
        Report cards are fixed copies taken at generation — that is what makes a reprint reproduce the
        original. Generate again to pick up corrected marks.
      </p>

      <h3>Aggregate or division looks wrong</h3>
      <p>
        Check which subjects are set to contribute. Electives and religious education do not count by default,
        which is usually right but occasionally not what a particular school intends.
      </p>

      <h3>A learner is missing from class results</h3>
      <p>Confirm their enrolment is in that class for that term and that they are not marked as left.</p>

      <h3>Totals or positions look wrong</h3>
      <p>Look for missing marks first. A blank subject is not a zero, and it changes both.</p>

      <h3>A design change is not showing on printed cards</h3>
      <p>
        The design is probably still in draft. Only a <strong>published</strong> design is used for printing —
        check on <Link href="/drce">the designer</Link>.
      </p>

      <h2>Fees</h2>

      <h3>A balance does not match the receipts</h3>
      <p>
        Open the learner&apos;s statement — every charge and payment is listed in order. It is almost always
        either a charge applied twice by two billing runs, or a payment recorded against the wrong term.
      </p>

      <h3>An imported payment went to the wrong learner</h3>
      <p>
        This happens when a row was matched by name. Reverse it with a correcting entry and record it against
        the right learner. Both entries stay visible, which is correct.
      </p>

      <h3>A money location balance does not match the cash</h3>
      <p>
        Usually missing transfers. Cash banked at the end of the day must be recorded as a transfer, or the
        cash location keeps showing money that is no longer there.
      </p>

      <h2>Messages</h2>

      <h3>Guardians are not receiving SMS</h3>
      <p>Check in this order:</p>
      <ol>
        <li>Message credits.</li>
        <li>Whether the rule is set to reviewed — the messages may be waiting in the queue.</li>
        <li>Quiet hours.</li>
        <li>The delivery report, for failures against specific numbers.</li>
      </ol>

      <h3>One family never receives messages</h3>
      <p>
        Check the number on the learner record, including the country code. A number saved without it never
        delivers.
      </p>

      <h3>Credits are disappearing faster than expected</h3>
      <p>
        Arrival alerts are usually the cause — one message per learner per day. Also check template length: a
        message over 160 characters costs double.
      </p>

      <h2>Access</h2>

      <h3>A staff member cannot see something they should</h3>
      <p>
        Check their role&apos;s permissions on <Link href="/admin/roles">Roles</Link>, then check whether the
        module is enabled on <Link href="/settings/modules">Modules</Link>. A disabled module is invisible to
        everyone, including Super Admins — this catches people out regularly.
      </p>

      <h3>A guardian cannot sign in to the portal</h3>
      <p>
        Confirm the phone number on the learner record matches the phone they are using, and that their link
        has been approved rather than left pending on <Link href="/admin/parents">Parents</Link>.
      </p>

      <h3>Nobody can sign in as an administrator</h3>
      <p>Contact DRAIS support. This is why keeping two Super Admins is worth doing.</p>

      <h2>Records</h2>

      <h3>Something has disappeared</h3>
      <p>
        Check <Link href="/admin/trash">Trash</Link> and restore it. This is the answer more often than any
        other item on this page.
      </p>

      <h3>A learner appears twice</h3>
      <p>
        Merge them. DRAIS shows what will move before you confirm and archives rather than destroys the record
        you do not keep. See <Link href="/help/guides/learners">Learners day to day</Link>.
      </p>

      <h3>Something changed and nobody knows who changed it</h3>
      <p>Check <Link href="/admin/audit-logs">the audit log</Link>.</p>

      <Callout kind="tip" title="Before contacting support">
        <p>Having these ready turns a long exchange into a short one:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>What you expected, and what happened instead.</li>
          <li>The learner or record involved — name and admission number.</li>
          <li>The date and term.</li>
          <li>A screenshot of the whole window, not just the message.</li>
          <li>Whether it affects one record or many.</li>
        </ul>
      </Callout>
    </HelpDoc>
  );
}
