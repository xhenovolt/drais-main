'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso, FiveQuestions } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="module-control">
      <p>
        28 API routes and 20 pages. Not a school feature — this is how Xhenvolt runs DRAIS as a business, and
        the reason a school can be supported without its founder.
      </p>

      <FiveQuestions
        what={<>The operator console: tenant provisioning, subscriptions and billing, plan limits, cross-school health, device ownership, SMS economics, impersonation and operator accounts.</>}
        why={<>Everything true <em>across</em> schools rather than inside one. Before it existed, onboarding, suspension and diagnosis were founder-run scripts — the definition of founder dependence (ADR-0012).</>}
        how={<>A completely separate auth domain, a pure-core/audited-shell pattern per module, and periodic work expressed as job rows because no second cron is available.</>}
        where={<><code>src/lib/control/*</code> (23 modules) · <code>/control</code> (UI) · <code>/api/control-center/*</code></>}
        extend={<>Pure function + audited wrapper + a test file. Register a job; never add a cron. Default to allow when gating live tenants.</>}
      />

      <Box kind="warning" title="/api/control belongs to JETON">
        <p>
          Control Center routes are always under <code>/api/control-center</code>. Getting this wrong routes
          platform operations into a different product entirely.
        </p>
      </Box>

      <h2>The isolation boundary</h2>

      <Table
        head={['', 'School auth', 'Control auth']}
        rows={[
          ['Tables', <><code>users</code>, <code>sessions</code></>, <><code>control_users</code>, <code>control_sessions</code>, <code>control_audit_logs</code></>],
          ['Cookie', <code>drais_session</code>, <code>drais_control</code>],
          ['Hashing', 'bcrypt', <>node <code>scrypt</code></>],
          ['Code', <code>src/lib/auth.ts</code>, <code>src/lib/control/auth.ts</code>],
        ]}
      />

      <Box kind="invariant">
        <p>
          <strong>No shared code path, no shared table.</strong> A mistake in the Control Center cannot break
          school login, and compromising one domain is not automatically compromising the other.
        </p>
        <p>
          Session tokens are 48 random bytes; only the SHA-256 is stored, so a database leak yields no usable
          sessions. Do not refactor these two together — the duplication is the security property.
        </p>
      </Box>

      <h2>Three patterns that repeat in every module here</h2>

      <h3>1. Pure core, audited shell</h3>

      <p>
        Each module factors its decision logic into a pure, unit-tested function with I/O and{' '}
        <code>controlAudit</code> wrapped around it: <code>dunningStage</code>, <code>healthScore</code>,{' '}
        <code>throttleDecision</code>, <code>controlCan</code>, <code>resolveEnforcement</code>,{' '}
        <code>monthlyEquivalent</code>, <code>computeBackoffSeconds</code>, <code>validateDeviceAction</code>,{' '}
        <code>usageAgainst</code>.
      </p>

      <p>That is why <code>__tests__/</code> has a file per module and needs no database. Follow it.</p>

      <h3>2. One cron, many jobs</h3>

      <Box kind="invariant" title="Never add a cron">
        <p>
          The hosting plan permits one and DRAIS already spends it. Periodic work becomes a{' '}
          <code>platform_jobs</code> row: register a handler, enqueue, and the existing tick claims and executes
          it with retry and backoff.
        </p>
      </Box>

      <h3>3. Safe by default when touching live tenants</h3>

      <Table
        head={['Operation', 'Default posture']}
        rows={[
          [<>Plan-limit enforcement</>, <><strong>Off</strong> unless <code>ENFORCE_PLAN_LIMITS=true</code>, overridable per school, and <strong>any error allows</strong>.</>],
          [<>Maintenance read-only</>, <>Blocks tenant writes; <strong>never blocks the Control Center</strong>, so an operator can always lift it.</>],
          [<>Hard delete</>, <>Four independent guardrails (below).</>],
          [<>Device transfer</>, <>Secret gate <strong>closed by default</strong> — unset means all transfers refused.</>],
        ]}
      />

      <Box kind="tip" title="Why allow-on-error is correct here">
        <p>
          A bug that blocks a paying school mid-term is worse than one that lets a limit slip for a day. These
          gates protect revenue, not safety — and a revenue gate that takes a school offline has failed at its
          own job.
        </p>
      </Box>

      <h2>Money</h2>

      <Diagram caption="Access is driven by payment, not by a manually-picked date.">
{`  plan catalog          named tiers + limits (learners, staff, devices, SMS, storage)
        │                referenced by schools.subscription_plan — no schema change
        ▼
  invoice per cycle
        │
  payment ──────────────▶ reconcile ──▶ extends subscription_end_date
        │                                        │
  gateway webhook                                ▼
  HMAC-verified, deduped                 session gate auto-suspends
  on gateway txn id                      a school past its paid-through date
        │
        └──▶ auto-reactivation on full payment — no human in the loop`}
      </Diagram>

      <p>
        Dunning warns schools <em>before</em> expiry and tells them at expiry, in-app, to each school&apos;s
        admins — previously suspension was silent. One notice per stage per school per day.
      </p>

      <h2>Impersonation</h2>

      <p>
        An operator can enter a school and use its entire app without its password. DRAIS mints a{' '}
        <strong>real</strong> school session bound to that school&apos;s highest-privilege user, flagged with
        the operator and fully audited, with a visible banner. School login and existing sessions are untouched.
      </p>

      <Box kind="warning" title="For those two hours it is genuine access">
        <p>
          The 2-hour expiry, the flag and the audit trail are the control — not a technical restriction on what
          can be done. Treat starting an impersonation as a recorded act, because it is one.
        </p>
      </Box>

      <h2>Destructive operations</h2>

      <p><strong>Hard-deleting a school</strong> requires all four, server-side:</p>
      <ol>
        <li>Super-admin only.</li>
        <li>The school must <em>already</em> be soft-deleted.</li>
        <li>The caller retypes the exact school name.</li>
        <li>A data-heavy school is refused without <code>force: true</code>.</li>
      </ol>

      <Box kind="warning" title="Export first — that is what data-export exists for">
        <p>
          <code>data-export.ts</code> produces a per-school JSON extract of every scoped table. TiDB Cloud backs
          up the cluster, but an operator cannot hold that or hand it over. Hard delete is irreversible and not
          transactional across every table.
        </p>
      </Box>

      <h2>Health monitoring</h2>

      <p>
        Cross-school scans for expired licences, stalled attendance, all-offline devices, clock drift, failed
        SMS and sync failures. Each monitor is a single <code>GROUP BY</code> — no N+1 — and results merge into
        a per-school issue register with a 0–100 score.
      </p>

      <p>
        Daily snapshots build a trend, and a founder alert fires when a school <em>newly</em> turns critical.
        The design goal is that problems find you rather than being discovered by accident.
      </p>

      <h2>Operator access</h2>

      <Table
        head={['Role', 'Can']}
        rows={[
          [<code>SUPER_ADMIN</code>, <>Everything, including the catalog, operators and destructive deletes.</>],
          [<code>OPERATOR</code>, <>Day-to-day ops: schools, devices, plan assignment, impersonation. <strong>Not</strong> the catalog, operators, or permanent deletes.</>],
          [<code>VIEWER</code>, <>Read-only.</>],
        ]}
      />

      <p>
        Reads are open to any authenticated control session; only mutations are permission-gated. Login is
        throttled with exponential backoff — this is the one credential governing every tenant — and TOTP is
        available per operator, opt-in.
      </p>

      <h2>Common mistakes</h2>

      <Table
        head={['Mistake', 'Consequence']}
        rows={[
          [<>Importing school auth here, or control auth into school code</>, <>Destroys the isolation property.</>],
          [<>Adding a cron</>, <>It will not run. There is one and it is spent.</>],
          [<>An unaudited mutation</>, <>This console can suspend a school and delete its data.</>],
          [<>A new gate that blocks on error</>, <>Takes paying schools offline on a bug.</>],
          [<>Routing under <code>/api/control</code></>, <>Lands in JETON.</>],
          [<>Putting logic in the route instead of a pure function</>, <>Untestable without a database; breaks the pattern every other module follows.</>],
          [<>Assuming SMS usage history is durable</>, <>It is derived from <code>SMS_SENT</code> audit events. Prune those and it is gone.</>],
        ]}
      />

      <h2>Extension points</h2>

      <ul>
        <li><strong>New periodic work</strong> → job handler + enqueued row.</li>
        <li><strong>New monitor</strong> → one <code>GROUP BY</code> feeding the issue register.</li>
        <li><strong>New operator capability</strong> → a permission in <code>controlCan</code>, defaulting to super-admin.</li>
        <li><strong>New tenant operation</strong> → a service taking a resolved <code>schoolId</code>, reusable by both domains.</li>
      </ul>

      <Source path="src/lib/control/README.md" />
      <Source path="docs/adr/0012-founder-independence.md">Why this console exists at all.</Source>

      <SeeAlso slugs={['security', 'operations', 'playbook-api', 'architecture']} />
    </ControlDoc>
  );
}
