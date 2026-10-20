'use client';

import React from 'react';
import Link from 'next/link';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';

const F = ({ path, line }: { path: string; line?: number }) => (
  <Link href={`/control/docs/files/${path.split('/').map(encodeURIComponent).join('/')}${line ? `#L${line}` : ''}`}><code>{path}{line ? `:${line}` : ''}</code></Link>
);

export default function Page() {
  return (
    <ControlDoc slug="anti-patterns">
      <p>
        Every entry below has at least one <strong>real instance</strong> in this repository, found by reading the code
        (most surfaced by the route documentation generator). Counts are from the tree at the time of writing; the
        <Link href="/control/docs/routes"> route &amp; file reference</Link> shows the live state, and its search has a
        <em> Problems</em> category for the ones it can detect automatically.
      </p>

      <h2>1. Calling an endpoint that does not exist</h2>
      <p>
        19 request sites call API URLs that no <code>route.ts</code> serves — for example
        <code> /api/reports/students</code>, <code>/api/reports/attendance</code> and <code>/api/reports/grades</code>
        from <F path="src/app/reports/page.tsx" line={130} />, <code>/api/school/info</code> from
        <F path="src/components/finance/EnhancedPaymentModal.tsx" line={91} />, and <code>PUT /api/finance/fees/:id</code>
        from <F path="src/components/finance/FeeModal.tsx" line={120} /> (only <code>/api/finance/fees</code> and
        <code> /api/finance/fees/student</code> exist). Each fails with a 404 that the UI usually swallows.
      </p>
      <Box kind="tip" title="Instead">
        Find the endpoint in the reference (search the URL, category <em>API</em>) before calling it, and read its
        methods. If it is missing, write it — do not ship the call and hope.
      </Box>

      <h2>2. An import that only resolves on Windows</h2>
      <p>
        <F path="src/components/academics/ClassInitialsManager.tsx" line={12} /> imports <code>@/components/ui/card</code>;
        the file is <code>Card.tsx</code>. Windows and macOS disks ignore letter case, the Linux build server does not.
        It only builds today because nothing imports <code>ClassInitialsManager</code>.
      </p>
      <Box kind="tip" title="Instead">Copy import paths from the file tree, case included. The reference flags these under Problems.</Box>

      <h2>3. Swallowing a failed load</h2>
      <p>
        30 places in <code>.tsx</code> files end a fetch with <code>.catch(() =&gt; {'{}'})</code>. Example:
        <F path="src/app/attendance/settings/page.tsx" line={216} /> — if the settings GET fails, the form silently shows
        defaults and a save would overwrite the real rule with them.
      </p>
      <Box kind="tip" title="Instead">
        Show the failure, as <F path="src/components/attendance/LogsDisplaySettings.tsx" /> does: set an error state,
        render it, and keep Save disabled until a load has succeeded.
      </Box>

      <h2>4. Trusting an identity the browser sends</h2>
      <Table
        head={['Where', 'What it trusted', 'Status']}
        rows={[
          [<F key="a" path="src/app/api/sync/manual-upload/route.ts" />, <><code>school_id</code> from the body, for signed-in callers — a user could merge device users into another school</>, 'Fixed in 7bd4311a'],
          [<F key="b" path="src/app/api/feature-flags/interact/route.ts" />, <><code>user_id</code> from the body, defaulting to <code>1</code> — interactions are recorded against whoever the caller names</>, 'Open (low impact: analytics rows only)'],
        ]}
      />
      <Box kind="invariant" title="The approved shape">
        The school and user come from <code>getSessionSchoolId(req)</code>. Only a super-admin may name another school,
        and the code says so explicitly — see <F path="src/app/api/attendance/reports/aggregates/route.ts" line={39} />.
      </Box>

      <h2>5. &ldquo;Fixing&rdquo; a broken query that was the only thing stopping a hole</h2>
      <p>
        <F path="src/app/api/schools/select/route.ts" /> looks up the session with <code>WHERE token = ?</code>; the
        <code> sessions</code> table has no <code>token</code> column (it is <code>session_token</code>, checked against
        the live schema), so the route always fails. If someone corrects the column name, the route will let any signed-in
        user set their <code>users.school_id</code> to <em>any</em> active school and grant themselves a Staff role there.
        <code> /api/schools/create</code> has the same broken lookup, and <code>/api/schools/available</code> lists every school.
      </p>
      <Box kind="warning" title="Instead">
        When a dead route starts &ldquo;working&rdquo; after a one-word fix, read what it does before shipping. These need a
        membership check (the user must already hold a role in the target school) before they are repaired.
      </Box>

      <h2>6. Business totals computed in the browser over a partial list</h2>
      <p>
        <F path="src/app/finance/payments/page.tsx" line={81} /> sums <code>amount</code> over the payments it received
        and calls the result the total; &ldquo;today&rdquo; uses the browser&apos;s clock. The API returns at most 50 rows unless
        asked for more (<F path="src/app/api/finance/payments/route.ts" line={24} />), and the page does not ask — so the
        figure is the total of the latest 50, not of all payments.
      </p>
      <Box kind="tip" title="Instead">
        Totals are a query: compute them in the API (SQL <code>SUM</code> with the same filters) or in a
        <code> src/lib/finance</code> function with a test, and date boundaries with the school&apos;s timezone
        (<code>schoolLocalToday</code> in <code>src/lib/datetime/local-date.ts</code>).
      </Box>

      <h2>7. Hard-coding a storage provider</h2>
      <p>
        Until the media work of October 2026 every photo upload called Cloudinary directly, so uploads failed offline.
        Image uploads now go through <code>storeImage()</code>, which follows the school&apos;s media policy. Two routes still
        call Cloudinary directly for non-photo files: <F path="src/app/api/id-cards/assets/route.ts" /> and
        <F path="src/app/api/students/documents/route.ts" />.
      </p>
      <Source path="src/lib/media/upload.ts">The one place an image is stored.</Source>

      <h2>8. Server-only code reaching a client or edge bundle</h2>
      <p>
        Checked: no <code>&apos;use client&apos;</code> file imports the database module, <code>mysql2</code>,
        <code> better-sqlite3</code> or <code>fs</code>. The one recent case was indirect:
        <code> src/instrumentation.ts</code> statically imported a module chain that reached <code>node:crypto</code>, which
        broke the edge bundle; the Node-only body now lives in <code>src/instrumentation-node.ts</code> behind
        <code> NEXT_RUNTIME === &apos;nodejs&apos;</code>.
      </p>

      <h2>9. A fourth way to do tabs</h2>
      <p>
        31 files keep their own tab state, 2 use Headless UI <code>Tab</code>, 1 uses the shared <code>Tabs</code>. Each new
        variant is one more thing a reader has to learn. Follow <Link href="/control/docs/playbook-tab">Add a custom tab</Link>.
      </p>

      <h2>10. Changing a shared component without reading its dependants</h2>
      <p>
        <code>MediaImg</code> is imported by 53 files; <code>ControlDoc</code> by every documentation page. Open the file in
        the reference — the <em>Used by</em> section lists every importer, with a warning when there are more than ten.
      </p>

      <h2>11. Writes whose authorisation is not visible</h2>
      <p>
        Of 512 API handlers that write, the generator finds a session or permission check, a delegated auth helper, or a
        retired 410 stub in all but 17 — mostly webhooks, OTP and sign-up flows and device endpoints that are public on
        purpose or authenticate by signature, secret or API key in ways it cannot read. Those 17 are marked
        <em> needs manual review</em> in the reference; items 4 and 5 above came from reading them.
        Separately, <code>POST /api/attendance/settings</code> deliberately checks sign-in but no permission; the reason is
        recorded in the route.
      </p>

      <SeeAlso slugs={['security', 'playbook-api', 'playbook-tab']} />
    </ControlDoc>
  );
}
