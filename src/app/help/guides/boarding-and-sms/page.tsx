'use client';

import React from 'react';
import HelpDoc, { Callout, GoTo, DefTable, Steps, Step } from '@/components/help/HelpDoc';

export default function Page() {
  return (
    <HelpDoc slug="boarding-and-sms">
      <p>
        This guide explains, in plain language, how DRAIS decides who is present, who is a boarder, when a parent
        receives an SMS, and how to check what was sent and why. Everything here can be seen and changed from inside
        DRAIS — you should never need to ask anyone how a rule works.
      </p>

      <h2>How attendance is worked out</h2>
      <p>
        Every fingerprint scan is kept exactly as it happened. DRAIS then applies your school&apos;s attendance rules
        to those scans to decide each learner&apos;s result for the day.
      </p>
      <DefTable rows={[
        ['Present', 'The learner scanned on or before the late time.'],
        ['Late', 'The learner scanned after the late time you set in Attendance Settings.'],
        ['Absent', 'No scan by the absence cut-off, on a school day, for a learner who is set up on the fingerprint device.'],
        ['Not yet recorded', 'The learner has not scanned and the day has not been closed yet. This is not an absence.'],
      ]} />
      <Callout kind="note" title="Learners who are not on a fingerprint device">
        <p>
          A learner who was never enrolled on a device cannot scan, so DRAIS will not call them absent and will not
          text their parents about it. They show as &ldquo;Not yet recorded&rdquo; until they are enrolled or marked by hand.
        </p>
      </Callout>

      <h2>Day scholars and boarders</h2>
      <p>
        Each learner has a <b>Residence</b>: <b>Day scholar</b> or <b>Boarding</b>. You set it on the learners list, one
        learner at a time or in bulk. Learners with no Residence set are counted as day scholars.
      </p>
      <p><GoTo href="/students/list">Learners list</GoTo></p>

      <h2>The two boarding policies</h2>
      <p>Your school chooses how boarders are treated. Day scholars are never affected by this choice.</p>
      <DefTable rows={[
        ['Daily punch (default)', 'Boarders are expected to scan every school day, exactly like day scholars. A boarder who does not scan is absent and the normal late and absence rules and SMS apply.'],
        ['Reported once', 'A boarder is considered reported after their first valid arrival scan in the reporting period (a term, a week, or a number of days you choose). They are not treated as absent for not scanning again, and their parent receives one “has reported to school” SMS.'],
      ]} />
      <p><GoTo href="/attendance/settings#boarding">Attendance Settings → Day &amp; boarding</GoTo></p>

      <h3>Reported is not the same as present today</h3>
      <p>DRAIS keeps these apart on purpose:</p>
      <DefTable rows={[
        ['Reported to school', 'The boarder has scanned at least once in the current reporting period.'],
        ['Present today', 'The learner scanned today.'],
      ]} />
      <p>
        Under <b>Reported once</b>, a boarder can be <i>reported</i> without being <i>present today</i> — and that is fine, they
        are not required to scan again. Under <b>Daily punch</b>, boarders are counted present or absent each day like everyone else.
      </p>

      <Callout kind="warning" title="Changing the policy never rewrites the past">
        <p>
          A change takes effect from the day you make it. Attendance already recorded keeps the behaviour it had at the time.
          Every change is recorded with who made it, when, and what it was before — open <i>Who changed this, and when</i> in the same panel.
        </p>
      </Callout>

      <h2>When a parent receives an SMS</h2>
      <p>DRAIS makes one decision for every attendance message, using the same rules everywhere:</p>
      <DefTable rows={[
        ['Day scholar arrives on time / late', 'Arrival or late-arrival message, if your school has that message switched on.'],
        ['Day scholar does not arrive', 'Absence message, once the day is closed and only for learners set up on a device.'],
        ['Boarder, Daily punch', 'Same as a day scholar.'],
        ['Boarder, Reported once, first scan of the period', 'One “has reported to school” message. Never a late or absence message.'],
        ['Boarder, Reported once, scans again', 'Nothing — the parent has already been told for this period.'],
        ['Boarder, Reported once, does not scan', 'Nothing — boarders are not marked absent daily under this policy.'],
      ]} />
      <p>
        A message is never sent about an old date. If a punch or a result is more than a day old when it is processed, DRAIS
        records the reason and does not text the parent.
      </p>
      <p><GoTo href="/attendance/settings#sms">Attendance Settings → SMS notifications</GoTo></p>

      <h2>The SMS Outbox</h2>
      <p>
        The SMS Outbox shows every message DRAIS created and how far it got. Open it to answer &ldquo;did that parent get the
        message?&rdquo; without guessing.
      </p>
      <p><GoTo href="/admin/notifications/outbox">SMS Outbox</GoTo></p>
      <DefTable rows={[
        ['Queued', 'Created by DRAIS, waiting to be sent.'],
        ['Sending', 'Being handed to the SMS provider.'],
        ['Sent to provider', 'The SMS company accepted the message. This does not yet prove it reached the phone.'],
        ['Delivered', 'The SMS company confirmed the message reached the phone.'],
        ['Failed', 'It could not be sent, or the SMS company reported it undeliverable. The reason is shown.'],
        ['Expired', 'Closed without sending — for example it was too old, or something was interrupted. It is never re-sent automatically, to avoid double-texting a parent.'],
      ]} />
      <Callout kind="note" title="Sent is not Delivered">
        <p>
          DRAIS only shows <b>Delivered</b> when the SMS provider sends back a delivery report. Until then a message that the provider
          accepted shows as <b>Sent to provider</b>. If you never see Delivered, delivery reports have not been switched on for your
          account — ask your DRAIS administrator to set them up; messages are still being sent.
        </p>
      </Callout>

      <h3>Finding a message</h3>
      <Steps>
        <Step title="Search">Type a parent&apos;s name, a phone number or a learner&apos;s name in the search box.</Step>
        <Step title="Narrow it down">Open <b>Filters</b> to choose the type of message, the channel, or a date range. Click a status tile to see only failed, or only sent, messages.</Step>
        <Step title="Open the message">Click any row. You will see who it went to, the exact text, each step it went through, and the provider&apos;s reference.</Step>
      </Steps>

      <h3>Why was this sent?</h3>
      <p>
        Every attendance message stores the reasoning behind it. At the bottom of the message you will see <b>Why was this sent?</b>:
        the learner&apos;s residence, the boarding policy in force, the attendance result, and the rule that applied. For example:
      </p>
      <Callout kind="success" title="Example">
        <p>
          Residence: Boarding · Boarding policy: Reported once · Attendance result: present · First valid arrival punch in Term 3 —
          sent “reported to school” (not a late or absence message).
        </p>
      </Callout>

      <h2>Attendance numbers on the dashboard</h2>
      <p>
        The attendance dashboard splits your learners into day scholars and boarders, and into girls and boys, and shows present, absent and
        not-yet-recorded for each group. DRAIS checks that the groups add up (day + boarding = all learners; girls + boys + not recorded =
        all learners). If they ever do not, a red notice tells you exactly which total is wrong instead of hiding it.
      </p>
      <Callout kind="tip" title="“Not recorded” gender">
        <p>
          Learners with no gender on file are counted in their own group so nobody disappears from the totals. Fill in gender on the learners
          list to move them into Girls or Boys.
        </p>
      </Callout>

      <h2>Filtering the attendance logs</h2>
      <p>
        On <a href="/attendance/logs">Attendance logs</a>, the date, search and actions stay on the main row. Open <b>Filters</b> for time of day,
        arrival status, residence (day scholars or boarding), gender, class and device. When filters are on, the bar shows <i>Filters • 3 active</i> with
        a small chip for each one, and each chip has an × to remove it.
      </p>

      <h2>When something looks wrong</h2>
      <DefTable rows={[
        ['A boarder received a “has reported to school” SMS', 'The school\'s boarding policy is Reported once and this was the learner\'s first valid scan in the current reporting period. Open the message in the SMS Outbox and read Why was this sent?.'],
        ['A boarder did not receive any SMS today', 'Under Reported once they only receive a message on their first scan of the period. Open Attendance Settings → Day & boarding to see the policy and the period; the Outbox shows earlier messages for that learner.'],
        ['A boarder is counted as day scholar', 'Their Residence is not set to Boarding. Change it on the learners list.'],
        ['A parent says they got nothing', 'Search the Outbox for the parent. Failed shows the reason (for example a wrong number). Sent to provider means DRAIS did its part and the SMS company accepted it.'],
        ['Only one parent was texted', 'A learner with two guardians gets a message to each guardian who has a phone number saved.'],
        ['The SMS balance is low', 'See the SMS balance card on the dashboard. Bulk messages are blocked at zero; attendance alerts keep going so a child\'s safety message is never blocked.'],
        ['The numbers do not add up', 'The dashboard says exactly which total is off. This usually means a learner with a missing residence or gender — fix it on the learners list.'],
      ]} />

      <Callout kind="warning" title="Two things DRAIS cannot know">
        <p>
          DRAIS cannot tell whether a phone was switched off or out of coverage — that is between the parent and the network. And it can only report
          what the SMS provider tells it; if delivery reports are not switched on, the furthest a message can show is <b>Sent to provider</b>.
        </p>
      </Callout>
    </HelpDoc>
  );
}
