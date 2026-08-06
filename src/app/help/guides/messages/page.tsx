'use client';

import React from 'react';
import Link from 'next/link';
import HelpDoc, { Callout, GoTo, DefTable, Steps, Step } from '@/components/help/HelpDoc';

export default function Page() {
  return (
    <HelpDoc slug="messages">
      <p>
        SMS is the feature parents notice. It is also the one that costs money on every send, so it is worth
        setting up carefully rather than switching everything on at once.
      </p>

      <h2>How it works</h2>

      <p>
        Things happen in DRAIS — a learner arrives, a learner is absent, a payment is received. Each is an
        <strong> event</strong>. Your school decides which events send a message, to whom, and whether it goes
        automatically or waits for a staff member to review it.
      </p>

      <p><GoTo href="/admin/communications">Communication settings</GoTo></p>

      <h2>The setting to think about first</h2>

      <DefTable
        rows={[
          ['Automatic', <>Sends as soon as the event happens. Right for arrival alerts — a message an hour later is worth much less than one at 7:42.</>],
          ['Reviewed', <>Prepared and held for a staff member to send. Right for absence notices and anything sensitive, where a wrong message costs more than a delayed one.</>],
        ]}
      />

      <p>The setting is per rule, so arrival alerts can be automatic while absence notices wait.</p>

      <Callout kind="tip" title="Start reviewed, then relax">
        <p>
          Schools that switch everything to automatic on day one spend the first week apologising for messages
          sent to the wrong number or about the wrong child. Start with review, watch the queue for a few days,
          and turn on automatic once the contact data is clean.
        </p>
      </Callout>

      <h2>What DRAIS can notify on</h2>

      <ul>
        <li><strong>Arrival</strong> — the most-used alert by a wide margin.</li>
        <li><strong>Departure</strong>.</li>
        <li><strong>Absence</strong> — no scan by your cut-off time.</li>
        <li><strong>Pass-out</strong> — a learner left the premises during the day, and returned.</li>
        <li><strong>Fee reminders</strong> — with the balance inserted.</li>
        <li><strong>Payment received</strong>.</li>
        <li><strong>Results released</strong>.</li>
        <li><strong>Announcements</strong> — anything you write.</li>
      </ul>

      <h2>Templates</h2>

      <p>Placeholders are filled in when the message sends:</p>

      <pre><code>{`{{studentName}} arrived at school at {{time}}.
{{schoolName}}`}</code></pre>

      <Callout kind="warning" title="Length is money">
        <p>
          SMS is billed per 160 characters. A message running to 170 characters costs <strong>twice</strong> as
          much as one at 150 — for every parent, every day. Trim the school name, drop pleasantries, and check
          the character count before saving a template you will send ten thousand times.
        </p>
      </Callout>

      <h2>Quiet hours</h2>

      <p>
        Set a window during which DRAIS will not send. Messages generated overnight are held rather than
        delivered at 3am. Boarding schools should set this before enabling departure alerts.
      </p>

      <h2>Bulk messages</h2>

      <p><GoTo href="/notifications">Notifications</GoTo></p>

      <Steps>
        <Step title="Pick the audience">
          All guardians, a class, a stream, all staff, or defaulters above an amount. The recipient count
          updates as you narrow it.
        </Step>
        <Step title="Write the message">
          Character count and estimated segments are shown live.
        </Step>
        <Step title="Check the cost estimate">
          Recipients × segments. Worth a second look for a whole-school send.
        </Step>
        <Step title="Send">
          Delivery status is recorded per recipient, so you can see which numbers failed.
        </Step>
      </Steps>

      <h2>Message credits</h2>

      <Callout kind="warning" title="Budget for arrival alerts before switching them on">
        <p>
          One message per learner per day. A school of 600 learners sending arrival alerts every day uses
          roughly 12,000 messages a month. If that is uncomfortable, consider sending arrival alerts only for
          the lower classes, or only for absences.
        </p>
      </Callout>

      <h2>When messages are not arriving</h2>

      <p>Check in this order:</p>

      <ol>
        <li>Credits — are there any left?</li>
        <li>Is the rule set to reviewed? The messages may be sitting in the queue.</li>
        <li>Quiet hours — messages generated inside the window are held.</li>
        <li>The delivery report, for failures against specific numbers.</li>
      </ol>

      <p>Failures are almost always one of:</p>

      <DefTable
        rows={[
          ['Wrong number format', <>Missing country code, or a stale number on the learner record. Fix it on the <Link href="/students">learner profile</Link>.</>],
          ['Unreachable', <>Phone off or out of network. Usually delivers later.</>],
          ['Credits exhausted', <>Check usage.</>],
        ]}
      />

      <Callout kind="tip">
        <p>
          Run the delivery report after your first week. A cluster of failures in one class almost always means
          a contact list that was imported badly, not a network problem.
        </p>
      </Callout>

      <h2>The parent portal</h2>

      <p>
        Guardians can also see attendance, results and fees themselves, which reduces both SMS volume and the
        queue at the bursar&apos;s window. Manage access from <Link href="/admin/parents">Parents</Link>.
      </p>
    </HelpDoc>
  );
}
