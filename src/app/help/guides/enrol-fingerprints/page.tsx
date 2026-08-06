'use client';

import React from 'react';
import Link from 'next/link';
import HelpDoc, { Callout, Steps, Step, GoTo, DefTable } from '@/components/help/HelpDoc';

export default function Page() {
  return (
    <HelpDoc slug="enrol-fingerprints">
      <p>
        Getting a fingerprint working involves two separate things, and knowing which one has failed saves
        most of the time schools spend on this.
      </p>

      <DefTable
        rows={[
          ['The fingerprint', <>Stored on the device. Decides whether the learner is <em>recognised</em>.</>],
          ['The identity link', <>Stored in DRAIS. Decides <em>who gets credited</em> when they are.</>],
        ]}
      />

      <Callout kind="warning" title="Nearly every problem is the second one">
        <p>
          When attendance looks wrong, the device is usually working perfectly and simply pointing at the wrong
          learner. Check the identity link before re-enrolling anyone.
        </p>
      </Callout>

      <h2>Registering a device</h2>

      <Steps>
        <Step title="Mount, power and connect it">
          Where learners pass on arrival, at a height the youngest can reach, out of direct sunlight. It needs
          network access to reach DRAIS. Note the serial number.
        </Step>
        <Step title="Add it in DRAIS">
          <p>Enter the serial number and a name you will recognise — &quot;Main Gate&quot;, &quot;Boarding Wing&quot;.</p>
          <p><GoTo href="/attendance/devices">Devices</GoTo></p>
        </Step>
        <Step title="Confirm it is reporting">
          The device list shows status and last-seen. If it has not appeared within a few minutes, check the
          network before anything else.
        </Step>
      </Steps>

      <h2>Enrolling a learner — the reliable way</h2>

      <p>
        Enrol from DRAIS, not from the device keypad. DRAIS assigns the PIN and creates the identity link at
        the same moment as the capture, so the link is correct by construction.
      </p>

      <p><GoTo href="/attendance/enrollment">Fingerprint enrolment</GoTo></p>

      <p>You can also enrol from an individual learner&apos;s profile under <Link href="/students">Learners</Link>.</p>

      <h3>Enrolling on the device keypad</h3>

      <p>
        This works, but DRAIS then only knows there is a new PIN with whatever name was typed. It will try to
        match that name to a learner and:
      </p>

      <ul>
        <li>link it automatically only if exactly one learner matches fully and nothing else is plausible;</li>
        <li>otherwise queue it for you to resolve.</li>
      </ul>

      <Callout kind="tip">
        <p>
          DRAIS refuses to guess on purpose. A near-match silently linked to the wrong child is far more
          damaging than an item in a queue waiting thirty seconds of your attention.
        </p>
      </Callout>

      <h3>Enrolment quality</h3>

      <ul>
        <li>Capture more than one finger — a cut or a plaster should not lock a learner out.</li>
        <li>Clean, dry hands; wipe the sensor between learners during a bulk session.</li>
        <li>Do a whole class in one sitting.</li>
        <li>Check <Link href="/attendance">live attendance</Link> the next morning rather than assuming it worked.</li>
      </ul>

      <h2>When the device and DRAIS disagree</h2>

      <p>
        Over time they drift — leavers keep their fingerprints on the device, someone is enrolled twice, a PIN
        is reused. The reconciliation view compares what the device actually holds against what DRAIS believes,
        in specific categories rather than a vague warning.
      </p>

      <p><GoTo href="/attendance/identity-matching">Identity matching</GoTo></p>

      <DefTable
        rows={[
          ['Unlinked PIN', <>The device knows someone DRAIS cannot identify. Scans are arriving and going nowhere.</>],
          ['Ambiguous', <>A device name that could be two different learners. You decide.</>],
          ['Stale', <>Fingerprints for learners who have left. Queue a removal.</>],
          ['Missing on device', <>DRAIS expects an enrolment the device does not hold. Re-enrol.</>],
        ]}
      />

      <h2>Fixing a wrong identity link</h2>

      <p>
        If attendance has been credited to the wrong learner, use <strong>Correct Identity</strong> from the
        learner&apos;s profile or from the reconciliation view.
      </p>

      <p>DRAIS will:</p>
      <ul>
        <li>show exactly what will change before you confirm;</li>
        <li>move the PIN to the correct learner;</li>
        <li>re-attribute the affected historical attendance;</li>
        <li>record who did it, when and why.</li>
      </ul>

      <Callout kind="success" title="The original records survive">
        <p>
          The scans themselves are never deleted. Time, device and finger stay exactly as they were — only the
          name attached to them changes. That is what lets you correct a mistake without losing the ability to
          prove what happened.
        </p>
      </Callout>

      <h2>Device health</h2>

      <p>
        DRAIS watches devices rather than waiting for you to notice a problem.{' '}
        <Link href="/attendance/health">Device health</Link> shows online status, last successful scan,
        enrolment counts and clock drift.
      </p>

      <Callout kind="warning" title="Clock drift">
        <p>
          A device whose clock has drifted makes arrivals appear at the wrong hour. DRAIS detects this and
          records the true arrival instant, so your data stays correct — but fix the device clock, and tell
          support if it recurs on the same device.
        </p>
      </Callout>

      <h2>When a learner leaves</h2>

      <p>
        Queue the removal of their fingerprint from the device at the same time as marking them as left.
        Otherwise the device keeps recognising them locally. You can do this from the learner profile.
      </p>

      <p>
        Next: <Link href="/help/guides/attendance-daily">Attendance day to day</Link>.
      </p>
    </HelpDoc>
  );
}
