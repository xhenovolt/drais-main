'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso } from '../ControlDoc';
import { LessonIntro, Concept, Exercise, SelfCheck } from '../Lesson';

export default function Page() {
  return (
    <ControlDoc slug="learn-lab-attendance">
      <LessonIntro
        level="Advanced"
        prereqs="TypeScript from DRAIS · Good, better, best · Auth & tenancy."
        teaches={['end-to-end tracing', 'protocol boundaries', 'identity resolution', 'read-time policy', 'debugging method']}
        outcome={<>Follow one finger-scan from the sensor to a figure on a report card, name the file responsible at each hop, and diagnose the four things that most often go wrong.</>}
      />

      <Box kind="tip" title="Do this with the repository open">
        <p>
          This is a lab, not a page to skim. Open each file as it is named. The aim is that afterwards you can
          navigate this module without a map — and the same method works on any other module.
        </p>
      </Box>

      <h2>The scenario</h2>

      <p>
        07:42 on a Tuesday. A learner places a finger on the gate device. By the end of term that touch has to
        become a percentage on a report card that a parent may dispute. Follow it.
      </p>

      <Diagram caption="Seven hops. Each is a file you can open.">
{`  1  DEVICE            matches locally → sends a PIN + a wall-clock string
  2  /api/zk-handler   ADMS endpoint. No session — the serial identifies it.
  3  wall-time.ts      the string is captured VERBATIM
  4  ingestion         dedup → attendance_raw_events        (append-only)
  5  biometric         (school, serial, PIN) → person_id    or → queue
  6  attendance        policy applied AT READ TIME → present / late
  7  snapshots         frozen into a report card that must reprint identically`}
      </Diagram>

      <h2>Hop 1–2: the device and the endpoint</h2>

      <p>
        The device does the fingerprint matching itself and sends only a PIN. DRAIS never sees the fingerprint
        during a normal punch.
      </p>

      <Source path="src/app/api/zk-handler/route.ts" />

      <Concept name="A route with no user session">
        <p>
          Every other write path in DRAIS starts with <code>getSessionSchoolId(req)</code>. This one cannot —
          there is no user. The device authenticates by <strong>serial number</strong>, and the serial resolves
          to the device row, whose <code>school_id</code> becomes the trusted scope.
        </p>
        <p>
          <strong>This is the exception to &quot;scope from the session&quot;</strong>, and it has its own
          failure mode: using a session&apos;s school here caused real cross-school contamination in a live K40
          test. Device writes scope by the <em>device&apos;s</em> school. Always.
        </p>
      </Concept>

      <h2>Hop 3: the string stays a string</h2>

      <p>The device reports a bare local wall clock:</p>

      <pre><code>{`"2026-07-17 07:42:11"     // no timezone. Just what the clock said.`}</code></pre>

      <Source path="src/lib/attendance/acquisition/wall-time.ts" />

      <Box kind="invariant" title="Captured verbatim; converted exactly once">
        <p>
          The wall string is the punch&apos;s identity through staging, inspection and validation. Conversion to
          a real UTC instant happens <strong>once</strong>, in <code>wallToUtc</code>, with the offset passed
          explicitly, at persistence time.
        </p>
        <p>
          <strong>No function in that module consults the host timezone.</strong> Everything is tz-invariant and
          unit-tested as such — because ad-hoc <code>Date</code> wrapping under three different conventions is
          what produced silent ±3h shifts whose direction depended on where the server ran.
        </p>
      </Box>

      <p className="text-slate-400 text-sm">
        Open the file and read the header comment before going further. It is the clearest statement in the
        codebase of why a type was introduced to stop a bug.
      </p>

      <h2>Hop 4: the event is written and never touched again</h2>

      <Table
        head={['Field', 'Value', 'Why']}
        rows={[
          [<code>punch_at</code>, <>the actual <strong>server</strong> instant</>, <>Devices have been observed 5–8 hours fast. Their clock cannot be authoritative.</>],
          [<>device-reported time</>, <>stored separately</>, <>It is the dedup key — the event&apos;s stable identity from the device&apos;s point of view. Devices re-send.</>],
          [<code>device_sn</code>, <>the serial</>, <>Determines the tenant scope.</>],
          [<code>pin</code>, <>as reported</>, <>Resolved to a person next; kept even if resolution fails.</>],
        ]}
      />

      <Box kind="invariant" title="attendance_raw_events is append-only">
        <p>
          Never updated, never deleted — not by a correction, not by a device transfer, not when a learner
          leaves. This is the evidence a school shows a ministry, and it is the reason corrections
          re-attribute rather than rewrite.
        </p>
      </Box>

      <h2>Hop 5: who was that?</h2>

      <pre><code>{`(school_id, device_sn, device_user_pin)  →  biometric_enrollments  →  person_id`}</code></pre>

      <p>Two outcomes, and the second is the interesting one:</p>

      <Table
        head={['Outcome', 'What happens']}
        rows={[
          [<strong>Hit</strong>, <>Resolved to a person. Continue.</>],
          [<strong>Miss</strong>, <>Lands in <code>pending_device_users</code> as <code>pending</code> (no candidate) or <code>ambiguous</code> (several). <strong>The event is still recorded.</strong></>],
        ]}
      />

      <Box kind="tip" title="A scan with no known owner is still a fact">
        <p>
          The event is kept even when the person is unknown, because someone did scan. Discarding it would lose
          the evidence that a scan occurred at all — and it is what lets the reconciliation view show
          &quot;unlinked PIN&quot; rather than silence.
        </p>
      </Box>

      <h2>Hop 6: policy at read time</h2>

      <p>
        Nothing so far decided whether this was <em>present</em> or <em>late</em>. That happens when attendance
        is <strong>read</strong>, by applying the school&apos;s configured cut-offs to the stored events.
      </p>

      <Concept name="Read-time policy">
        <p>
          Change the late cut-off from 08:00 to 08:15 and history is re-read under the new rule. The scans never
          change.
        </p>
        <p>
          <strong>Why this matters:</strong> a school can adjust its policy without corrupting its record. The
          alternative — writing a status at punch time — means a policy change either rewrites history or
          leaves it inconsistent with the current rule. Both are worse.
        </p>
        <p>
          This is why <code>attendance_records</code> is safe to recompute and{' '}
          <code>attendance_raw_events</code> is not: one is an interpretation, the other is evidence.
        </p>
      </Concept>

      <h2>Hop 7: onto the report card</h2>

      <p>
        At generation time the term figures are computed and <strong>frozen into the snapshot</strong>. A
        reprint next year shows the same numbers as the original, because the render path reads only the
        snapshot and never the live tables.
      </p>

      <h2>Diagnosing the four common failures</h2>

      <Table
        head={['Symptom', 'Where to look', 'Usually']}
        rows={[
          [
            <>A learner shows <strong>0%</strong> for the term</>,
            <>Learner profile → fingerprint panel</>,
            <><strong>Not absence.</strong> A broken identity link, or an enrolment that never reached the device. Check before contacting the family.</>,
          ],
          [
            <>Scans happen, nothing appears</>,
            <>Device last-seen, then reconciliation</>,
            <>Network if stale; an unlinked PIN if the device is online — the events are arriving and failing to resolve.</>,
          ],
          [
            <>Times are hours off</>,
            <>Device health → clock drift</>,
            <>Device clock drift. DRAIS records the true instant regardless, so the data is right; fix the device.</>,
          ],
          [
            <>Present learners marked absent</>,
            <>Attendance settings</>,
            <>An absence cut-off earlier than the school&apos;s actual assembly time.</>,
          ],
        ]}
      />

      <Box kind="invariant" title="The method generalises">
        <p>
          Work <strong>backwards along the pipeline</strong> and ask at each hop: did the data get this far?
          Device online → event recorded → identity resolved → policy applied. The first &quot;no&quot; is the
          bug, and each of those is a screen you can look at.
        </p>
        <p>Guessing which layer is at fault is slower than checking them in order.</p>
      </Box>

      <Exercise
        n={1}
        title="Trace it yourself"
        objective={<>Open the seven files in order without using this page as a map. At each, write one sentence: what did it receive, and what did it hand on?</>}
        hints={<>Start at <code>src/app/api/zk-handler/route.ts</code> and follow the imports. The subsystem READMEs in <code>ingestion</code>, <code>biometric</code> and <code>attendance</code> are the orientation layer if you get lost.</>}
        mistakes={<>Reading the README instead of the code. The README says what is true; the lab is about being able to find it yourself.</>}
      />

      <Exercise
        n={2}
        title="Add a field to the raw event"
        objective={<>Suppose devices begin reporting a verification method (finger, card, face). Plan the change end to end — do not implement it yet.</>}
        hints={
          <ul className="list-disc pl-5 space-y-1">
            <li>Which migration, and does the column need a default for existing rows?</li>
            <li>Does it change the dedup key? (Think carefully.)</li>
            <li>Is it evidence or interpretation — and therefore append-only or recomputable?</li>
            <li>Does it belong in the snapshot? If so, what is its sort order?</li>
          </ul>
        }
        mistakes={
          <ul className="list-disc pl-5 space-y-1">
            <li>Adding it to the dedup key. A device re-sending with a different method would then create a duplicate event.</li>
            <li>Backfilling a guess for historical rows. Unknown is a legitimate value; inventing one corrupts the evidence.</li>
            <li>Adding it to the snapshot without deciding its ordering — that makes generation non-deterministic.</li>
          </ul>
        }
        solution={<p>Nullable column, no backfill, not part of the dedup key, surfaced in the logs view. Snapshot inclusion only if it must appear on a report card — and then with an explicit sort order, because <code>dataHash</code> depends on it.</p>}
      />

      <Exercise
        n={3}
        title="Break it deliberately"
        objective={<>In a local branch, change the ingestion path to trust the device-reported time as <code>punch_at</code>. Set your machine&apos;s clock forward three hours and observe.</>}
        hints={<>Watch which day the punch lands on, and what the daily register shows for that learner.</>}
        mistakes={<>Doing this against a shared database. Local only.</>}
        solution={<p>You have reproduced RC-1. The point is to see that <strong>nothing errors</strong> — the data is simply wrong, in a way that depends on where the server runs. That is the class of bug the wall-time module and its branded type exist to prevent.</p>}
      />

      <SelfCheck
        questions={[
          {
            q: <>Why does <code>/api/zk-handler</code> not call <code>getSessionSchoolId</code>?</>,
            a: <p>There is no user. The device authenticates by serial, and that device row&apos;s <code>school_id</code> is the trusted scope. Using a session&apos;s school here caused real cross-school contamination.</p>,
          },
          {
            q: <>Two timestamps are stored. What is each for?</>,
            a: <p><code>punch_at</code> is the true server instant, because device clocks drift by hours. The device-reported time is the dedup key — the event&apos;s stable identity from the device&apos;s side, needed because devices re-send.</p>,
          },
          {
            q: <>A school changes its late cut-off mid-term. What happens to last month&apos;s attendance?</>,
            a: <p>It is re-read under the new rule. The scans are unchanged — policy is applied at read time, which is what lets a school adjust policy without corrupting its record.</p>,
          },
          {
            q: <>A scan arrives whose PIN maps to nobody. Why keep the event?</>,
            a: <p>Someone did scan; that is a fact. Keeping it preserves the evidence and lets reconciliation surface an unlinked PIN instead of silence.</p>,
          },
          {
            q: <>A learner shows 0% attendance. What do you check first, and what do you not do?</>,
            a: <p>Check the fingerprint panel on their profile — it is nearly always a broken identity link or an enrolment that never reached the device. Do <strong>not</strong> contact the family first; a wrongly accused absence is hard to walk back.</p>,
          },
        ]}
      />

      <SeeAlso slugs={['module-attendance', 'learn-patterns', 'request-lifecycle', 'schema']} />
    </ControlDoc>
  );
}
