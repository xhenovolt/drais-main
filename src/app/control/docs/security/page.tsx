'use client';

import React from 'react';
import Link from 'next/link';
import ControlDoc, { Box, Source, Table } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="security">
      <p>
        DRAIS has <strong>three separate authentication domains</strong> and one tenancy rule. Most of the
        security-relevant bugs this system has had came from blurring one of them.
      </p>

      <h2>The three domains</h2>

      <Table
        head={['', 'School staff', 'Parents', 'Control Center']}
        rows={[
          [<strong>Cookie</strong>, <code>drais_session</code>, <code>drais_parent_session</code>, <code>drais_control</code>],
          [<strong>Tables</strong>, <><code>users</code>, <code>sessions</code></>, <>parent tables</>, <><code>control_users</code>, <code>control_sessions</code>, <code>control_audit_logs</code></>],
          [<strong>Hashing</strong>, <>bcrypt</>, <>bcrypt (OTP hashed)</>, <>node <code>scrypt</code></>],
          [<strong>Code</strong>, <code>src/lib/auth.ts</code>, <code>src/lib/portal/session.ts</code>, <code>src/lib/control/auth.ts</code>],
          [<strong>Entry</strong>, <code>/(protected)</code>, <code>/portal</code>, <code>/parent</code>, <code>/control</code>],
        ]}
      />

      <Box kind="invariant" title="No shared code path, no shared table">
        <p>
          A parent token can never satisfy <code>getSessionSchoolId()</code>. A staff token can never satisfy{' '}
          <code>requireParent()</code>. Nothing in the Control Center reads or writes a school auth table.
        </p>
        <p>
          That is the property: a mistake in one domain cannot become a privilege escalation in another. Do not
          &quot;helpfully&quot; refactor these together — the duplication is the design.
        </p>
      </Box>

      <Source path="docs/adr/0008-two-auth-systems.md" />

      <h2>The tenancy rule</h2>

      <p>
        Every tenant-scoped query filters on <code>school_id</code>, derived from the session — never from the
        request.
      </p>

      <Box kind="warning" title="The recurring violation">
        <p>
          A route that takes <code>schoolId</code> from the request body or a query parameter and trusts it.
          It works in testing, because the client sends the right value. It is a cross-tenant read in
          production, because a client can send any value.
        </p>
        <p>
          <code>authorize()</code> already honours the caller&apos;s school. Routes that re-derive it are the
          bug this centralisation exists to prevent.
        </p>
      </Box>

      <h3>Device writes are the exception to watch</h3>

      <p>
        For anything touching a device, the trusted scope is the <strong>device&apos;s</strong>{' '}
        <code>school_id</code>, not the session&apos;s. A super-admin operating on a foreign device must still
        write into that device&apos;s school.
      </p>

      <Source path="src/lib/biometric/device-access.ts">The shared resolver. Use it rather than re-deriving.</Source>

      <h2>Parent isolation</h2>

      <p>The strictest gate in the system, because it faces families directly:</p>

      <Box kind="invariant">
        <p>
          Every parent data query intersects <strong>(requested) ∩ (authorized)</strong>. Never the requested
          set alone.
        </p>
      </Box>

      <p>
        No portal route may query <code>students</code>, <code>results</code>, <code>daily_attendance</code>,{' '}
        <code>fee_payments</code> or equivalent without going through <code>authorizedStudentIds()</code>,{' '}
        <code>assertCanViewStudent()</code>, or embedding <code>studentGateSubquery()</code> in its SQL.
      </p>

      <p>
        For <code>/api/parent/*</code>, the client only ever holds an opaque <code>access_uuid</code>. It is
        resolved to <code>(student_id, school_id)</code> only when it belongs to the calling parent and the link
        is still active — so revocation takes effect immediately, and ids cannot be enumerated.
      </p>

      <h3>Evidence is not a grant</h3>

      <p>
        A guardian&apos;s phone number appearing on a learner&apos;s contact record is <em>evidence</em> — a
        reason to request access. The grant is a row in <code>parent_student_links</code>. Keeping these
        separate is what lets real schools have messy contact data without that messiness becoming an
        access-control decision.
      </p>

      <Source path="docs/adr/0009-parent-portal-isolation-gate.md" />

      <h2>Permissions vs modules</h2>

      <Table
        head={['', 'Question', 'Super-admin bypass?']}
        rows={[
          [<strong>Permission</strong>, <>May this user do this?</>, <>Yes</>],
          [<strong>Module</strong>, <>Has this school got this at all?</>, <><strong>No</strong></>],
        ]}
      />

      <p>
        Module gates model subscription intent. A super-admin who could use unpurchased modules would make the
        boundary meaningless. This is deliberate and has been reconsidered and kept.
      </p>

      <h2>Control Center specifics</h2>

      <ul>
        <li><strong>Session tokens</strong> are 48 random bytes; only the SHA-256 is stored, so a database leak yields no usable sessions.</li>
        <li><strong>Login throttling</strong> with exponential backoff — this is the one credential governing every tenant.</li>
        <li><strong>TOTP</strong> is available per operator, opt-in.</li>
        <li><strong>Roles</strong>: <code>SUPER_ADMIN</code> / <code>OPERATOR</code> / <code>VIEWER</code>. Reads are open to any authenticated session; only mutations are gated.</li>
        <li><strong>Impersonation</strong> mints a real but short-lived (2h) school session flagged with the operator, fully audited, with a visible banner. For those two hours it is genuine access — the audit trail is the control.</li>
      </ul>

      <Box kind="warning" title="Routes go under /api/control-center">
        <p>
          <code>/api/control</code> belongs to JETON, a different product. Getting this wrong routes platform
          operations into the wrong system.
        </p>
      </Box>

      <h2>Secrets that must be set</h2>

      <Table
        head={['Variable', 'Consequence if unset']}
        rows={[
          [<code>SESSION_COOKIE_SECRET</code>, <>Also signs report verify tokens — printed QR verification breaks.</>],
          [<code>DEVICE_CLAIM_SECRET</code>, <>Gate is <strong>closed</strong>: all device transfers refused. Fails safe by design.</>],
          [<code>RECEIPT_VERIFY_SECRET</code>, <>Falls back to a default committed in the repo — receipt tokens become forgeable.</>],
          [<code>DEVICE_ENCRYPTION_KEY</code>, <>Dahua credential storage fails. No rotation path exists; changing it orphans stored credentials.</>],
        ]}
      />

      <h2>Before you ship anything touching this</h2>

      <ul>
        <li>Run <code>npm run lint:permissions</code> — catches a typo&apos;d permission string before it becomes a silent 403.</li>
        <li>Confirm the route derives <code>school_id</code> from the session.</li>
        <li>For parent routes, confirm it goes through the gate helpers.</li>
        <li>For device routes, confirm it scopes by the device&apos;s school.</li>
        <li>Confirm mutations are audited.</li>
      </ul>

      <p>
        Next: <Link href="/control/docs/data">Data &amp; migrations</Link>.
      </p>
    </ControlDoc>
  );
}
