'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso, FiveQuestions } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="module-portal">
      <p>
        30 API routes across two parent-facing surfaces. The only part of DRAIS that families touch directly,
        and therefore the part where a mistake is visible outside the school.
      </p>

      <FiveQuestions
        what={<>Guardian authentication by phone, linking guardians to their children, and read-only access to attendance, results and fees for <em>their own</em> learners.</>}
        why={<>Guardians asking the office about attendance and balances is expensive for the school and slow for the family. It also reduces SMS volume, which is a real cost.</>}
        how={<>A third auth domain (phone + OTP, long-lived session) and a hard isolation gate that intersects every query with the guardian&apos;s authorised learner set.</>}
        where={<><code>src/lib/portal</code> (sessions, OTP, linking, gate) · <code>src/lib/parent</code> (cross-school access resolution) · <code>/portal</code>, <code>/parent</code></>}
        extend={<>Every data route goes through the gate helpers. Never accept a learner id from the client without resolving it.</>}
      />

      <h2>Two surfaces, one session</h2>

      <Table
        head={['', <code>/portal</code>, <code>/parent</code>]}
        rows={[
          ['Scope', <>School-scoped — the guardian picks an active school</>, <><strong>Cross-school</strong> — one list, learners at any number of schools</>],
          ['Client holds', <>a <code>studentId</code>, gate-checked per request</>, <>an opaque <code>access_uuid</code> (<code>learnerAccessId</code>)</>],
          ['Guard', <code>requireLinkedLearner()</code>, <code>requireLearnerAccess()</code>],
          ['Lib', <code>src/lib/portal</code>, <code>src/lib/parent</code>],
        ]}
      />

      <p>
        Both sit on the same session layer. A guardian with children at two DRAIS schools signs in once and
        sees both — each school still controls its own approvals and its own visibility settings.
      </p>

      <h2>The isolation gate</h2>

      <Box kind="invariant" title="Every query intersects requested ∩ authorized. Never the requested set alone.">
        <p>
          <strong>No portal route may query <code>students</code>, <code>results</code>,{' '}
          <code>daily_attendance</code>, <code>fee_payments</code> or anything comparable</strong> without going
          through <code>authorizedStudentIds()</code>, <code>assertCanViewStudent()</code>, or embedding{' '}
          <code>studentGateSubquery()</code> in its SQL.
        </p>
        <p>
          A route that filters on a client-supplied learner id is a cross-family data leak. The gate is a shared
          function rather than a convention precisely because a convention is eventually forgotten in one route
          — and that one route is enough.
        </p>
      </Box>

      <p>
        Verified: all 30 routes under <code>/api/portal</code> and <code>/api/parent</code> go through a guard,
        except the six auth and OTP endpoints, which must be reachable before login by definition.
      </p>

      <h3>The opaque id rule</h3>

      <p>
        On <code>/api/parent/*</code> the internal <code>student_id</code> <strong>never leaves the
        server</strong>. A <code>learnerAccessId</code> resolves back to <code>(student_id, school_id)</code>{' '}
        only when it belongs to the calling guardian and the link is still active.
      </p>

      <Box kind="tip" title="Two properties fall out of that">
        <p>
          A client cannot construct or enumerate ids for learners it was not given. And{' '}
          <strong>revocation is immediate</strong> — the check happens at resolution time, not at issue time,
          so every id a guardian already holds stops working the moment their link is revoked.
        </p>
      </Box>

      <h2>Evidence is not a grant</h2>

      <Diagram caption="The distinction that lets real schools have messy contact data safely.">
{`  EVIDENCE                                  GRANT
  the guardian's verified phone appears     a row in parent_student_links
  on a learner's contact record             with status='active'
        │                                          ▲
        │  findMatchableLearners()                 │
        ▼                                          │
  a link REQUEST  ────── school approves ──────────┘
                         (or auto-activates, if the school opted in)`}
      </Diagram>

      <Box kind="invariant">
        <p>
          A matching phone number is a <em>reason to ask</em> for access. It is never access itself. DRAIS&apos;s
          contact tables are fragmented and, in real schools, inconsistent — so a phone match becomes a queue
          item for the office rather than an access-control decision.
        </p>
      </Box>

      <Box kind="warning" title="Auto-activation converts evidence straight into a grant">
        <p>
          It is a per-school opt-in. A school with dirty contact data and auto-activation on <strong>can link
          the wrong guardian to a child</strong>. Staff approval is the safer default, and the right advice for
          a new school.
        </p>
        <p>
          Custody and separation cases are real. DRAIS does exactly what the office tells it, so a link approved
          in haste can show a parent information they should not have.
        </p>
      </Box>

      <h2>Authentication</h2>

      <Table
        head={['Element', 'Behaviour', 'Why']}
        rows={[
          ['Identity', 'Phone number', 'The one identifier a school reliably holds for a guardian.'],
          ['Verification', <>6-digit OTP by SMS, <strong>stored hashed</strong>, 10-minute TTL, 5 attempts</>, <>The raw code exists only in the SMS. Never log it, in any branch.</>],
          ['Session', <>Own cookie <code>drais_parent_session</code>, own table, <strong>~3 months</strong></>, <>A guardian bounced to a login screen repeatedly stops using the portal. Adoption was chosen over session brevity, deliberately.</>],
          ['Isolation', <>Cannot satisfy <code>getSessionSchoolId()</code>; a staff token cannot satisfy <code>requireParent()</code></>, <>No shared path, so no privilege confusion to reason about.</>],
        ]}
      />

      <Box kind="warning" title="The long session is a deliberate trade">
        <p>
          A stolen or shared device retains access until the link is revoked. Given that the alternative is a
          portal nobody uses, this was decided knowingly — but it means revocation must be instant, which is why
          the gate resolves per request.
        </p>
      </Box>

      <h2>Per-school visibility</h2>

      <p>Schools control what the portal exposes, from <code>school_settings</code>:</p>

      <Table
        head={['Area', 'Default', 'Note']}
        rows={[
          ['Attendance', 'On', 'By far the most-used part.'],
          ['Results', 'School choice', 'Many schools enable it only after results are officially released.'],
          ['Fees', <strong>On</strong>, <>Reduces queue at the bursar&apos;s window. A school preferring to handle money in person can switch it off (<code>parent_finance_visibility</code>).</>],
          ['Announcements', 'School choice', '—'],
        ]}
      />

      <p>Settings take effect immediately. New portal surfaces should ship with a toggle unless unconditionally safe.</p>

      <h2>Common mistakes</h2>

      <Table
        head={['Mistake', 'Consequence']}
        rows={[
          [<>Querying learner data without the gate</>, <><strong>Cross-family data leak.</strong> The defect this module is built to prevent.</>],
          [<>Accepting a raw <code>student_id</code> on a parent route</>, <>No gate at all.</>],
          [<>Caching the access resolution across requests</>, <>Revocation stops being immediate.</>],
          [<>Logging an OTP</>, <>Account takeover by anyone with log access.</>],
          [<>A new surface with no visibility toggle</>, <>Schools that did not want it shown cannot turn it off.</>],
          [<>Assuming a phone match implies a relationship</>, <>Wrong guardian linked to a child.</>],
          [<>Adding a portal route to the school-auth exemption list without its own guard</>, <>Unauthenticated access.</>],
        ]}
      />

      <h2>Known constraints</h2>

      <ul>
        <li><strong>OTP delivery depends on SMS.</strong> No email fallback — a guardian with an unreachable phone cannot self-serve.</li>
        <li><strong>Codes cost credits</strong>, drawn from the school&apos;s allocation like any other message.</li>
        <li><strong>Access follows the phone number.</strong> A family sharing a handset shares the view.</li>
        <li><strong>Visibility lookups are per request</strong> and uncached.</li>
        <li><strong><code>access_uuid</code> is stable per link</strong>, not rotating — the active-link check at resolution time is what limits the damage if one leaks.</li>
      </ul>

      <h2>Extension points</h2>

      <ul>
        <li><strong>New data surface</strong> → go through <code>context.ts</code> or the gate helpers, and add a visibility toggle.</li>
        <li><strong>New query shape the guard does not cover</strong> → extend the guard. Do not bypass it.</li>
        <li><strong>New verification channel</strong> → alongside OTP, keeping evidence and grant separate.</li>
      </ul>

      <Source path="src/lib/portal/README.md" />
      <Source path="src/lib/parent/README.md" />
      <Source path="docs/adr/0009-parent-portal-isolation-gate.md" />

      <SeeAlso slugs={['security', 'module-students', 'schema', 'playbook-api']} />
    </ControlDoc>
  );
}
