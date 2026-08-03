'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="playbook-page">
      <p>
        In the order that avoids rework. The last three steps are the ones skipped under time pressure and they
        are the ones that come back.
      </p>

      <h2>1. Route and placement</h2>

      <p>
        <code>src/app/&lt;domain&gt;/&lt;thing&gt;/page.tsx</code>, grouped by product area to match the 248
        pages already there.
      </p>

      <pre><code>{`'use client';   // nearly every DRAIS page is a client component

export default function PaymentsPage() { … }`}</code></pre>

      <Box kind="note" title="Why client components by default">
        <p>
          Almost every screen is stateful and session-scoped — mark sheets, registers, the report designer.
          Server components were not adopted, and mixing a few in creates two mental models for no gain. Follow
          the convention unless you have a specific reason and can state it.
        </p>
      </Box>

      <h2>2. Data</h2>

      <pre><code>{`const { data, error, isLoading, mutate } = useSWR('/api/finance/payments');`}</code></pre>

      <p>
        The global <code>SWRConfig</code> already supplies the fetcher and disables focus revalidation and error
        retry — you do not pass those. After a mutation, call <code>mutate()</code> or the screen shows stale
        data.
      </p>

      <Table
        head={['Need', 'Use']}
        rows={[
          [<>Data displayed and re-displayed</>, <><code>useSWR</code>. The default.</>],
          [<>A one-shot action (save, delete)</>, <>Plain <code>fetch</code>, then <code>mutate(key)</code>.</>],
          [<>School name, logo, motto</>, <><code>useSchoolConfig()</code> — never hardcode.</>],
          [<>Money formatting</>, <><code>useCurrency()</code> — never <code>toLocaleString</code> inline.</>],
          [<>Current term</>, <><code>useTerm()</code> from <code>TermContext</code>.</>],
          [<>A long operation</>, <><code>useProgress()</code>. Silent long operations are treated as a defect.</>],
        ]}
      />

      <Box kind="warning" title="Do not add useQuery">
        <p>
          TanStack Query is mounted globally but used in only four files. Adding to it means maintaining a
          second cache alongside SWR for the same data, with no benefit.
        </p>
      </Box>

      <h2>3. Handle all four states</h2>

      <p>
        Loading, error, empty, and populated. The empty state is the one that gets skipped, and a school with a
        blank screen and no explanation assumes the system is broken.
      </p>

      <pre><code>{`if (isLoading) return <Skeleton />;
if (error)     return <ErrorState onRetry={() => mutate()} />;
if (!data?.length) return <EmptyState … />;   // say WHY it is empty and what to do`}</code></pre>

      <h2>4. Permissions — and what they are not</h2>

      <Box kind="invariant" title="Hiding a button is not access control">
        <p>
          Anything the button does is reachable by calling the API directly. <strong>The route must check the
          permission.</strong> Hiding the control is a courtesy so users are not shown actions that will fail.
        </p>
        <p>
          There is deliberately no <code>usePermissions()</code> hook — it invites treating client checks as
          enforcement. Fetch the specific capability from an endpoint that already performed the real check.
        </p>
      </Box>

      <p>
        For a module-gated area, hide the entry with <code>useEnabledModules()</code> <em>and</em> gate the
        route with <code>withModule()</code>. Both, always.
      </p>

      <h2>5. Navigation</h2>

      <p>
        Add the sidebar entry, gated by the same permission and module as the page. A page nobody can navigate
        to may as well not exist; a visible entry that 403s is worse than no entry.
      </p>

      <h2>6. Translation — both languages, every time</h2>

      <Box kind="invariant">
        <p>
          Use <code>t(&apos;key&apos;, &apos;English fallback&apos;)</code> and add the key to{' '}
          <strong>both</strong> <code>en.json</code> and <code>ar.json</code>. Never hardcode Arabic, never
          ship an Arabic-only surface, and never leave a key in only one file.
        </p>
        <p>
          The dictionaries are near-complete. The real i18n defect in this codebase is components bypassing{' '}
          <code>t()</code> and writing English inline — do not add to it.
        </p>
      </Box>

      <p>Arabic means RTL. Check the layout in both directions before shipping anything with a fixed direction, and avoid hardcoded <code>left</code>/<code>right</code> where a logical property will do.</p>

      <h2>7. Dark mode</h2>

      <Box kind="warning" title="A component with no dark: classes is broken, not neutral">
        <p>
          Every surface, border and text colour needs its <code>dark:</code> variant. Tailwind v4 binds{' '}
          <code>dark:</code> to the <code>.dark</code> class via a custom variant — if a toggle ever appears to
          do nothing, check that binding first.
        </p>
        <p>Look at the page in both themes before opening the pull request. It takes five seconds.</p>
      </Box>

      <h2>8. Verify</h2>

      <pre><code>{`npm run build        # catches type and import errors across 248 pages`}</code></pre>

      <ul>
        <li>Light and dark.</li>
        <li>English and Arabic (RTL).</li>
        <li>Narrow viewport — staff use phones at the gate.</li>
        <li>As a user <em>without</em> the permission: the entry should be hidden and the API should 403.</li>
        <li>Empty state, by testing with a school that has no data.</li>
      </ul>

      <h2>The order that avoids rework</h2>

      <Table
        head={['#', 'Step']}
        rows={[
          ['1', 'API route first — the page is easier to write against something real.'],
          ['2', 'Page skeleton with all four states.'],
          ['3', 'SWR wiring and mutations.'],
          ['4', 'Permission and module gating, on both page and route.'],
          ['5', 'Sidebar entry with the same gates.'],
          ['6', 'Translations in both files.'],
          ['7', 'Dark mode pass.'],
          ['8', 'Build, then check both themes and both languages.'],
        ]}
      />

      <Box kind="tip" title="Do not put a global overlay on a print route">
        <p>
          <code>/print-snapshot</code>, <code>/print-transcript</code> and <code>/rpt</code> render without the
          shell because puppeteer captures them. A component mounted outside that branch will appear inside
          printed report cards.
        </p>
      </Box>

      <Source path="src/app/layout.tsx">The shell decision and the provider tree.</Source>

      <SeeAlso slugs={['frontend', 'hooks', 'playbook-api', 'security']} />
    </ControlDoc>
  );
}
