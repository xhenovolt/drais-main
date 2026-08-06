'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="playbook-api">
      <p>
        691 routes exist. This is how the next one should look, and the seven things that are forgotten most
        often.
      </p>

      <h2>Two ways to write a route</h2>

      <p>
        Both are current. <code>withRoute</code> is newer and does more for you; the explicit form is what most
        of the codebase uses and is required when the route needs to do something the wrapper does not cover.
      </p>

      <h3>With the wrapper</h3>

      <pre><code>{`import { withRoute } from '@/lib/api/with-route';

export const GET = withRoute(
  { permission: 'finance.payments.view' },
  async ({ session, params, req }) => {
    return await listPayments(session.schoolId);   // plain object → JSON
  },
);`}</code></pre>

      <p><code>withRoute</code> gives you, in order: session resolution → 401, permission check → 403, read-only maintenance blocking on writes, dynamic <code>params</code> already awaited, and a try/catch that turns a thrown error into JSON rather than a stack trace.</p>

      <Box kind="note" title="Control Center routes deliberately do not use it">
        <p>
          <code>withRoute</code> resolves a <strong>school</strong> session and enforces read-only maintenance.
          Control Center routes belong to a different auth domain and must stay usable during maintenance so an
          operator can lift it. They authenticate with <code>getControlSession</code> instead.
        </p>
      </Box>

      <h3>Explicit</h3>

      <pre><code>{`export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    await requirePermission(session.userId, session.schoolId,
                            'backup.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  try {
    const result = await startBackup(session.schoolId, session.userId);

    void logAudit({
      schoolId: session.schoolId, userId: session.userId,
      action: AuditAction.BACKUP_CREATED_SCHOOL,
      entityType: 'backup', entityId: result.backupId,
      details: { … },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    console.error('[backup/start]', e);
    return NextResponse.json(
      { success: false, error: { message: (e as Error).message, code: 'BACKUP_START_FAILED' } },
      { status: 500 },
    );
  }
}`}</code></pre>

      <h2>The checklist</h2>

      <Table
        head={['#', 'Step', 'Why it matters']}
        rows={[
          ['1', <><strong>Resolve the session in the handler</strong></>, <>Middleware runs on Edge and only checks that a cookie is <em>present</em>. A route that trusts it is unauthenticated.</>],
          ['2', <><strong><code>schoolId</code> from the session, never the request</strong></>, <>The entire tenancy model. Reading it from the body works in testing and is a cross-tenant read in production.</>],
          ['3', <><strong>Check the permission</strong></>, <>A real catalog code. Run <code>npm run lint:permissions</code> — it catches a typo before it becomes a silent 403.</>],
          ['4', <><strong>Module gate if applicable</strong></>, <><code>withModule(&apos;tahfiz&apos;, handler)</code>. Super-admin does <strong>not</strong> bypass it.</>],
          ['5', <><strong>Validate the input</strong></>, <>Type, range, and that referenced ids belong to this school.</>],
          ['6', <><strong>Transaction for multi-table writes</strong></>, <><code>withTransaction()</code>. Otherwise partial writes.</>],
          ['7', <><strong>Audit every mutation</strong></>, <><code>logAudit</code>, fire-and-forget with <code>void</code>. Without it &quot;who changed this?&quot; is unanswerable.</>],
          ['8', <><strong>Explicit errors — zero silent failures</strong></>, <>Never swallow. Log with a route tag, return a code the UI can act on.</>],
          ['9', <><strong>Side effects fire-and-forget</strong></>, <>SMS, search indexing, webhooks. Never awaited, never able to fail the request.</>],
          ['10', <><strong><code>mutate(key)</code> on the client</strong></>, <>Or the user sees stale data and reports a bug that is not one.</>],
        ]}
      />

      <Source path="docs/guides/API_ERROR_HANDLING_GUIDE.md">
        The &quot;zero silent failures&quot; standard, with the response format and error codes. Required
        reading before writing a route.
      </Source>

      <h2>Response shape</h2>

      <pre><code>{`// success
{ success: true, data: … }

// failure
{ success: false, error: { message: 'Human readable', code: 'MACHINE_READABLE' } }`}</code></pre>

      <p>
        A UI cannot branch on prose. Give every failure a stable <code>code</code>, and do not repurpose an
        existing one for a new meaning.
      </p>

      <h2>The seven that get forgotten</h2>

      <Box kind="warning">
        <ol className="list-decimal pl-5 space-y-1.5">
          <li><strong>Audit on the mutation.</strong> Easy to add now; impossible to reconstruct later.</li>
          <li><strong>Ownership validation on referenced ids.</strong> Permission says &quot;may edit learners&quot;. It does not say &quot;may edit <em>this</em> learner&quot; — verify the row belongs to the session&apos;s school.</li>
          <li><strong><code>deleted_at IS NULL</code>.</strong> The most common way a deleted record reappears in a list or a count.</li>
          <li><strong><code>export const runtime = &apos;nodejs&apos;</code></strong> when the route uses Node APIs or the database driver.</li>
          <li><strong><code>maxDuration</code></strong> for anything slow — and if it can exceed the limit, it should be a step loop or a job, not a long request.</li>
          <li><strong>The client-side <code>mutate</code>.</strong></li>
          <li><strong>Search reindex</strong> after creating or renaming an indexed entity, or it is silently unsearchable forever.</li>
        </ol>
      </Box>

      <h2>Long-running work</h2>

      <Box kind="invariant" title="Serverless timeouts are not negotiable">
        <p>Anything that scales with a school&apos;s data cannot run in one request. Two sanctioned patterns:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>
            <strong>Client-driven step loop</strong> — <code>start</code>, then <code>step</code> repeatedly,
            then <code>finalize</code>, with progress persisted to the database between steps. See the backup
            module.
          </li>
          <li>
            <strong>A <code>platform_jobs</code> row</strong> executed by the existing tick, with retry and
            backoff. <strong>Never add a cron</strong> — there is one and it is spent.
          </li>
        </ul>
        <p>State lives in TiDB, never in memory: instances are not shared.</p>
      </Box>

      <h2>Naming and placement</h2>

      <ul>
        <li>Group by domain: <code>/api/finance/payments/route.ts</code>.</li>
        <li>Business logic goes in <code>src/lib/&lt;subsystem&gt;/</code>, not in the handler. The handler does auth, validation and shaping.</li>
        <li>Write the service to take a <strong>resolved</strong> <code>schoolId</code> — that is what lets both a school route and a Control Center route reuse it without sharing auth.</li>
        <li>Never place a school route under <code>/api/control</code> (JETON), <code>/api/control-center</code> (operators) or <code>/api/platform</code> (external).</li>
      </ul>

      <h2>Before you open the pull request</h2>

      <pre><code>{`npm run lint:permissions     # permission literals vs the catalog
npm run build                # it will catch more than you expect
# plus the suite for whatever you touched:
npm run test:drce  /  test:snapshots  /  verify:divisions
npm run test:attendance  /  test:ingestion  /  test:biometric`}</code></pre>

      <Box kind="warning" title="If you touched marks, aggregates or divisions">
        <p>
          Run <code>test:drce</code>, <code>test:snapshots</code> <strong>and</strong>{' '}
          <code>verify:divisions</code>. It is three commands rather than one because these diverged once and a
          school found it before a test did.
        </p>
      </Box>

      <SeeAlso slugs={['request-lifecycle', 'security', 'playbook-module', 'playbook-page']} />
    </ControlDoc>
  );
}
