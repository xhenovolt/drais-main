'use client';

import React from 'react';
import ControlDoc, { Box, Table, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="attendance-decisions">
      <p>
        Every attendance-triggered SMS is decided in one place and explained in structured data, so an operator can answer
        &quot;why did this parent get this message?&quot; from the Control Center or the school&apos;s SMS Outbox — without reading code.
      </p>

      <h2>Where the decision is made</h2>
      <p>
        <code>src/lib/attendance/notification-decision.ts</code> — a pure function, <code>decideAttendanceNotification()</code>. Inputs: residence,
        the school&apos;s boarding mode for that date, the attendance verdict, the reporting-period fact, and the safety-gate result from
        <code> attendance-sms-eligibility.ts</code>. Output: <code>SEND | DO_NOT_SEND</code>, a notification type, a machine-readable reason code,
        plain-language explanation lines, and the facts used.
      </p>

      <Table
        head={['Situation', 'Type', 'Result']}
        rows={[
          ['Day scholar, punch on time', 'ARRIVAL_ON_TIME', 'SEND (if a policy is active)'],
          ['Day scholar, late punch', 'LATE_ARRIVAL', 'SEND'],
          ['Day scholar, no punch (day closed, on a device)', 'ABSENT', 'SEND'],
          ['Boarder, DAILY_PUNCH', 'as day scholar', 'as day scholar'],
          ['Boarder, REPORTED_ONCE, first punch of the period', 'BOARDING_REPORTED', 'SEND'],
          ['Boarder, REPORTED_ONCE, later punch', 'BOARDING_REPORTED', 'DO_NOT_SEND (already_reported_this_period)'],
          ['Boarder, REPORTED_ONCE, no punch', 'ABSENT', 'DO_NOT_SEND (boarding_reported_once_no_daily_absence)'],
          ['Policy-derived verdict', 'any', 'DO_NOT_SEND (policy_derived_verdict)'],
          ['Stale date / no evidence / not on device', 'any', 'DO_NOT_SEND (gate reason)'],
        ]}
      />

      <h2>Where it is stored</h2>
      <Table
        head={['Table', 'What it holds']}
        rows={[
          ['attendance_boarding_policy', 'One row per school: mode (DAILY_PUNCH / REPORTED_ONCE), reporting period, previous_mode + effective_from (history protection).'],
          ['boarding_reports', 'One row per (school, learner, reporting period) — the "reported to school" fact and the idempotency key for BOARDING_REPORTED.'],
          ['attendance_sms_decisions', 'Every decision, SEND or DO_NOT_SEND, with reason_code and decision_json (explanation + facts). Unique per (person, date, type, decision, reason).'],
          ['notification_outbox', 'Adds notification_type, attendance_date, subject_student_id, decision_id, delivery_confirmed_at.'],
        ]}
      />

      <Box kind="invariant" title="Idempotency is enforced by the server">
        <p>
          BOARDING_REPORTED is keyed <code>policy:person:boarding.reported:period_key</code> and backed by the UNIQUE key on
          <code> boarding_reports</code>; a repeated punch, a re-evaluation or a replayed callback cannot send it twice. Recipient #1 keeps the historical
          key; further guardians append <code>:r&lt;last 6 phone digits&gt;</code>, so every guardian is texted.
        </p>
      </Box>

      <Box kind="invariant" title="Changing the policy never rewrites history">
        <p>
          <code>modeForDate()</code> returns <code>previous_mode</code> for dates before <code>effective_from</code>. The change is audited
          (<code>BOARDING_POLICY_CHANGED</code>: who, when, from, to).
        </p>
      </Box>

      <h2>Status vocabulary (outbox)</h2>
      <p>
        <b>sent</b> = provider accepted the request (legacy rows stored this as <code>status=&apos;delivered&apos;</code>). <b>delivered</b> = a provider delivery report
        set <code>delivery_confirmed_at</code> via <code>/api/comm/webhooks/sms-delivery?token=…</code> (requires the <code>SMS_DLR_SECRET</code> env var and the callback URL configured
        with the provider). Without it, nothing is ever labelled delivered.
      </p>

      <h2>Which SMS account sends it (School SMS routing)</h2>
      <p>
        Control Center → <b>School SMS Routing</b> decides, per school, which provider or account sends that school&apos;s messages — for one school, a selection, or all.
        Modes: <b>Default</b> (no explicit route: unchanged behaviour), <b>A provider</b> (a central provider such as Yoola or UgaText),
        <b> The school&apos;s own account</b>, and <b>Same as another school</b> (&quot;school A uses whatever school B uses&quot;). Table: <code>school_sms_routes</code>.
      </p>
      <Box kind="invariant" title="No secret is ever copied">
        <p>
          <code>same_as</code> is resolved live in <code>lib/sms/school-routing.ts</code>: Nakifuma pointing at Albayan reads Albayan&apos;s stored credentials at send time.
          Rotating Albayan&apos;s key updates every school that follows it; removing the route restores the school&apos;s own account. Loops
          (A→B→A) are rejected on save and detected at send time. A broken route fails the message with a stated reason — it never silently switches accounts.
        </p>
      </Box>
      <p>
        Honoured by every send path: the attendance outbox drain, bulk broadcast, the message composer and event dispatches. (OTP codes, reminders and Sentinel alerts still use the platform account.)
        &quot;Check account&quot; asks the provider whether the credentials are accepted and sends nothing. Changes need the <code>sms.route.manage</code> control permission and are audited.
      </p>

      <h2>Operating it</h2>
      <ul>
        <li>Message → <code>/admin/notifications/outbox</code>, click the row: lifecycle, provider reference, decision and explanation.</li>
        <li>Learner history: search by learner name in the outbox; suppressed decisions are in <code>attendance_sms_decisions</code>.</li>
        <li>Policy: Attendance Settings → Day &amp; boarding (admin). Residence per learner is <code>students.residency_status</code> — the single source of truth.</li>
      </ul>

      <SeeAlso slugs={['module-attendance']} />
    </ControlDoc>
  );
}
