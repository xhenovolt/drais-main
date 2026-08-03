'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="data-flow">
      <p>
        How a route produces data, how a component receives it, and exactly what to do to add or restructure
        your own. This is the page to read before writing your first feature.
      </p>

      <h2>The whole path</h2>

      <Diagram caption="Follow this once and the other 690 routes are variations on it.">
{`  COMPONENT
    useSWR(schoolId ? '/api/dashboard/overview' : null, fetcher, { refreshInterval: 60_000 })
        │
        ▼
  fetcher(url)                       src/utils/fetcher.ts
    fetch(url) → !ok ? throw : json()
        │
        ▼
  ROUTE  app/api/dashboard/overview/route.ts
    getSessionSchoolId(req)  → 401 if absent
    requirePermission(...)   → 403
    query the DB, shape the result
    return NextResponse.json({ success: true, data: overview })
        │
        ▼
  COMPONENT receives the ENVELOPE
    const overview = overviewData?.data;     ← unwrap. This step is forgotten a lot.`}
      </Diagram>

      <h2>Response shape — and the exception you must check for</h2>

      <p>The standard envelope:</p>

      <pre><code>{`// success
{ success: true,  data: … }

// failure
{ success: false, error: { message: 'Human readable', code: 'MACHINE_READABLE' } }`}</code></pre>

      <Box kind="warning" title="575 routes return the envelope. 116 return a bare object or array.">
        <p>
          The envelope is the standard and new routes must use it — but <strong>you cannot assume it</strong>{' '}
          when consuming an existing endpoint. Open the route and look before writing the component.
        </p>
        <p>
          The symptom of getting this wrong is a component that renders empty with no error: you read{' '}
          <code>data.data</code> on a route that returned the array directly, get <code>undefined</code>, and
          render nothing.
        </p>
      </Box>

      <h2>Three transports, and when each applies</h2>

      <Table
        head={['Transport', 'Use for', 'Behaviour']}
        rows={[
          [
            <code>useSWR</code> + <code>fetcher</code>,
            <>Anything <strong>read and re-read</strong></>,
            <>Caches by URL key, dedupes, revalidates on demand. <code>fetcher</code> throws on a non-OK status, which SWR surfaces as <code>error</code>.</>,
          ],
          [
            <code>apiFetch</code>,
            <>Every <strong>mutation</strong>, and any one-shot call</>,
            <>Success toast, error toast, consistent parsing, and it <strong>throws</strong> so failures cannot be ignored. The client half of zero-silent-failures.</>,
          ],
          [
            <>Raw <code>fetch</code></>,
            <><strong>Nothing new.</strong></>,
            <>Present in ~122 pages. Policy is explicit: <em>&quot;direct fetch() is forbidden&quot;</em>. Convert opportunistically when you touch a file.</>,
          ],
        ]}
      />

      <Box kind="note" title="fetcher and apiFetch are not interchangeable">
        <p>
          <code>fetcher</code> is deliberately minimal — a bare <code>fetch</code> that throws on{' '}
          <code>!ok</code>. It does <strong>not</strong> toast, because SWR reads happen on a timer and a
          background refresh failing should not throw a toast in the user&apos;s face.
        </p>
        <p>
          <code>apiFetch</code> <em>does</em> toast, because a mutation the user initiated must visibly succeed
          or visibly fail. Pass <code>{'{ silent: true }'}</code> for background reads through it.
        </p>
      </Box>

      <h2>Adding your own endpoint</h2>

      <h3>Step 1 — the route</h3>

      <pre><code>{`// src/app/api/dashboard/fees-snapshot/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getFeesSnapshot } from '@/lib/finance/snapshot';

export const runtime = 'nodejs';          // needed: DB driver + Node APIs

export async function GET(req: NextRequest) {
  // 1. AUTHENTICATE HERE. Middleware only checked that a cookie EXISTS.
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // 2. AUTHORISE
  try {
    await requirePermission(session.userId, session.schoolId,
                            'finance.payments.view', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  try {
    // 3. schoolId comes from the SESSION. Never from the request.
    const snapshot = await getFeesSnapshot(session.schoolId);

    // 4. the envelope
    return NextResponse.json({ success: true, data: snapshot });
  } catch (e) {
    // 5. explicit failure — never swallow
    console.error('[dashboard/fees-snapshot]', e);
    return NextResponse.json(
      { success: false, error: { message: (e as Error).message, code: 'FEES_SNAPSHOT_FAILED' } },
      { status: 500 },
    );
  }
}`}</code></pre>

      <Box kind="invariant" title="Two of those five are security, not style">
        <p>
          <strong>Step 1</strong> — middleware runs on the Edge runtime and cannot reach the database, so it
          only checks cookie <em>presence</em>. A handler that trusts it is unauthenticated.
        </p>
        <p>
          <strong>Step 3</strong> — <code>schoolId</code> from the session, never the request. Reading it from
          the body works perfectly in testing, because your client sends the right value, and is a cross-tenant
          read in production, because any client can send any value.
        </p>
      </Box>

      <h3>Step 2 — the service</h3>

      <pre><code>{`// src/lib/finance/snapshot.ts
export async function getFeesSnapshot(schoolId: number): Promise<FeesSnapshot> {
  const rows = await query(
    \`SELECT … FROM student_ledger sl
       JOIN students s ON s.id = sl.student_id
      WHERE s.school_id = ?          -- tenancy
        AND s.deleted_at IS NULL     -- soft delete
     \`,
    [schoolId],
  );
  return shape(rows);
}`}</code></pre>

      <Box kind="tip" title="Take a resolved schoolId, not a session">
        <p>
          The most reusable pattern in the codebase. A service taking <code>schoolId</code> can be called by a
          school route (session-scoped) <em>and</em> a Control Center route (operator picks the school) without
          either sharing auth code.
        </p>
      </Box>

      <h3>Step 3 — consume it</h3>

      <pre><code>{`const { data, error, isLoading, mutate } = useSWR(
  schoolId ? '/api/dashboard/fees-snapshot' : null,
  fetcher,
);

const snapshot = data?.data;     // unwrap`}</code></pre>

      <h2>Restructuring a response</h2>

      <p>
        The common case: an endpoint returns rows in a shape your screen cannot use directly. There are three
        places to reshape, and choosing wrongly is a recurring source of duplicated logic.
      </p>

      <Table
        head={['Where', 'Use when', 'Cost']}
        rows={[
          [
            <><strong>In SQL</strong></>,
            <>Aggregation, grouping, counting. The database is better at this than you are.</>,
            <>Harder to read; harder to unit-test.</>,
          ],
          [
            <><strong>In the service</strong> (<code>src/lib</code>)</>,
            <><strong>The default.</strong> Any shaping more than one consumer might want, or that deserves a test.</>,
            <>None worth mentioning. Pure functions here are unit-testable without a database.</>,
          ],
          [
            <><strong>In the component</strong> (<code>useMemo</code>)</>,
            <>Purely presentational: sorting a visible list, formatting for one chart.</>,
            <>Runs on every render; invisible to other consumers; cannot be tested without React.</>,
          ],
        ]}
      />

      <Box kind="warning" title="The mistake: reshaping in the component, then again in the next one">
        <p>
          Two screens need the same figures shaped slightly differently, so the logic gets written twice and
          then drifts. In DRAIS this has real consequences — it is precisely how a second implementation of the
          contributing-subject rule produced wrong divisions on printed report cards.
        </p>
        <p>If a second consumer might ever want it, put it in the service.</p>
      </Box>

      <h3>Changing an existing shape</h3>

      <Box kind="invariant" title="Add fields. Do not remove or rename them.">
        <p>
          A route is consumed by places you have not grepped — another page, a dynamic import, the mobile
          build, or an external system. <strong>Adding</strong> a field is safe. <strong>Removing or
          renaming</strong> one breaks callers silently, because JavaScript yields <code>undefined</code>
          rather than an error.
        </p>
        <p>
          For <code>/api/platform/v1/*</code> this is not advice but a frozen contract: fields may be added,
          never removed or narrowed, and breaking changes ship as v2 alongside v1 (ADR-0011).
        </p>
      </Box>

      <p>To change a shape safely: add the new field, migrate consumers, then remove the old one in a separate commit.</p>

      <h2>Invalidation</h2>

      <pre><code>{`await apiFetch('/api/finance/payments', { method: 'POST', body: … });
mutate('/api/finance/payments');            // this screen
mutate('/api/dashboard/fees-snapshot');     // and anything derived from it`}</code></pre>

      <Box kind="warning" title="Derived data needs invalidating too">
        <p>
          Recording a payment changes the payments list <em>and</em> the dashboard snapshot <em>and</em> the
          learner&apos;s balance. Revalidating only the screen you are on produces the classic report:
          &quot;the dashboard is wrong until I refresh&quot;.
        </p>
        <p>
          The keys are URLs, so they are greppable. Search for the endpoint before assuming yours is the only
          consumer.
        </p>
      </Box>

      <h2>Long or heavy responses</h2>

      <Table
        head={['Situation', 'Do this']}
        rows={[
          [<>Large list</>, <><strong>Paginate server-side.</strong> Do not follow <code>/students/list</code>, which loads everything and slices 50 client-side.</>],
          [<>Long-running job</>, <>A client-driven step loop (<code>start</code> → <code>step</code>×N → <code>finalize</code>) with progress in the database, or a <code>platform_jobs</code> row. Never one long request.</>],
          [<>Live progress</>, <>Server-sent events, as <code>students/bulk/enroll-sse</code> does.</>],
          [<>Expensive computation</>, <>Compute on write, store the result. Grade codes resolve at write time because reads are the hot path.</>],
        ]}
      />

      <h2>Checklist for a new endpoint</h2>

      <Table
        head={['#', 'Step']}
        rows={[
          ['1', <>Resolve the session <strong>in the handler</strong>.</>],
          ['2', <>Check the permission; add a module gate if the feature is optional.</>],
          ['3', <><code>schoolId</code> from the session; validate that referenced ids belong to it.</>],
          ['4', <>Logic in <code>src/lib</code>, taking a resolved <code>schoolId</code>.</>],
          ['5', <><code>deleted_at IS NULL</code> in every query.</>],
          ['6', <>Return the <code>{'{ success, data }'}</code> envelope.</>],
          ['7', <>Explicit errors with a stable <code>code</code>; log with a route tag.</>],
          ['8', <><code>logAudit</code> on every mutation, fire-and-forget.</>],
          ['9', <><code>export const runtime = &apos;nodejs&apos;</code> if it touches the DB.</>],
          ['10', <>Consume with a null-guarded SWR key; unwrap <code>?.data</code>; <code>mutate</code> after writes.</>],
        ]}
      />

      <Source path="src/utils/fetcher.ts">Twelve lines. Read it — it is the whole read path.</Source>
      <Source path="src/lib/apiClient.ts">The mandated wrapper and its guarantees.</Source>
      <Source path="docs/guides/API_ERROR_HANDLING_GUIDE.md">Zero silent failures, with the error-code catalogue.</Source>

      <SeeAlso slugs={['playbook-api', 'dashboard-anatomy', 'request-lifecycle', 'frontend']} />
    </ControlDoc>
  );
}
