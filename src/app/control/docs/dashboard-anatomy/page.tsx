'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="dashboard-anatomy">
      <p>
        <code>/dashboard</code> is the route every user lands on after login. 320 lines composing from 23
        components in <code>src/components/dashboard/</code>. This page explains{' '}
        <strong>why each block is there</strong>, how it gets its data, and what to copy when you add one.
      </p>

      <Source path="src/app/dashboard/page.tsx" />

      <h2>The design question the homepage answers</h2>

      <p>
        A head teacher opens DRAIS in the morning. They have perhaps ninety seconds before someone interrupts
        them. The dashboard has to answer: <em>is anything wrong today?</em>
      </p>

      <p>
        That is why it is <strong>not</strong> a summary of everything. It is a set of blocks that either say
        &quot;normal&quot; or point at a problem — and every one of them is a link to the screen where you act
        on it.
      </p>

      <h2>Composition</h2>

      <Diagram caption="Each block is independent: its own fetch, its own loading state, its own failure mode.">
{`  top bar          title · link to Intelligence
  ──────────────────────────────────────────────────────────────────
  DashboardKPIs            learners · present · absent · attendance %
                           enrolment growth · fees today · defaulters
  ──────────────────────────────────────────────────────────────────
  ClockHealthBadges        device clock drift — INLINE, not route-only
  IntelligenceStrip        cross-cutting signals
  ──────────────────────────────────────────────────────────────────
  IntelligenceSummary      up to 6 SignalCards (warning/decline/…)
  AttendanceInsights       charts — dynamic(), ssr:false
  DeviceStatusWidget       which devices are online right now
  ──────────────────────────────────────────────────────────────────
  overview data            /api/dashboard/overview, 60s refresh`}
      </Diagram>

      <h2>Why these components exist</h2>

      <Table
        head={['Component', 'Why it earns its place']}
        rows={[
          [
            <code>DashboardKPIs</code>,
            <>The seven numbers a head teacher would otherwise ask for by phone: total learners, present, absent, attendance %, enrolment growth, fees collected today, defaulters. Note the typed <code>KPIData</code> interface — and <code>AttendanceByRole</code>, which splits learners from staff, because &quot;attendance&quot; means different things for each.</>,
          ],
          [
            <code>ClockHealthBadges</code>,
            <><strong>Deliberately inline on the dashboard rather than only on a monitoring route.</strong> A drifting device clock silently files arrivals at the wrong hour. Health that lives only behind a route nobody visits is not monitoring.</>,
          ],
          [
            <code>IntelligenceSummary</code>,
            <>Turns analysis into <em>signals</em>: typed <code>warning</code> / <code>decline</code> / <code>positive</code> / <code>info</code>, each with a colour, an icon, and — critically — an <code>action</code> URL. Capped at six.</>,
          ],
          [
            <code>AttendanceInsights</code>,
            <>Charts. Loaded via <code>dynamic()</code> for a specific reason, below.</>,
          ],
          [
            <code>DeviceStatusWidget</code>,
            <>Attendance is only as good as the devices. A device offline since 6am is the single most actionable fact on the page.</>,
          ],
        ]}
      />

      <Box kind="tip" title="Every signal carries an action">
        <p>
          <code>SignalCard</code> wraps the whole card in{' '}
          <code>&lt;Link href={'{signal.action}'}&gt;</code>. A dashboard that reports a problem without
          offering the next click makes the user hunt for the screen — which is how dashboards stop being used.
        </p>
        <p>Copy this. A new block that only displays is worth less than one that displays and navigates.</p>
      </Box>

      <h2>Three patterns worth copying exactly</h2>

      <h3>1. Conditional SWR key — the null-key idiom</h3>

      <pre><code>{`const { data, isLoading } = useSWR(
  schoolId ? '/api/intelligence/overview' : null,   // ← null = do not fetch
  fetcher,
  { refreshInterval: 120_000 }
);`}</code></pre>

      <Box kind="invariant" title="Pass null, not a guarded call">
        <p>
          <strong>SWR skips the request entirely when the key is <code>null</code>.</strong> That is how you
          wait for something — a school id, a selected class, a term — without an <code>if</code> around the
          hook, which React&apos;s rules forbid.
        </p>
        <p>
          Miss it and every block fires a request before the session resolves, producing a burst of 401s on
          every page load.
        </p>
      </Box>

      <h3>2. Per-call refresh intervals</h3>

      <Table
        head={['Block', 'Interval', 'Why']}
        rows={[
          [<>Overview</>, <code>60_000</code>, <>Headline numbers; a minute is fresh enough.</>],
          [<>Intelligence signals</>, <code>120_000</code>, <>Analysis is expensive and changes slowly.</>],
        ]}
      />

      <p>
        The global <code>SWRConfig</code> disables <code>revalidateOnFocus</code>. These blocks opt into
        polling explicitly, per call, at a rate matched to how fast the underlying data actually changes.
        Choose the interval from the data, not by habit.
      </p>

      <h3>3. Dynamic import for heavy libraries</h3>

      <pre><code>{`// Pulls in recharts (PieChart) — this is the main /dashboard route every
// user hits on login, so keep the chart lib out of its server compile pass.
const AttendanceInsights = dynamic(
  () => import('@/components/dashboard/AttendanceInsights'),
  { ssr: false },
);`}</code></pre>

      <Box kind="warning" title="This is a build-ceiling decision, not a micro-optimisation">
        <p>
          DRAIS builds under a hard heap cap (2048MB; 1536 is FATAL, 4096 is SIGKILL) with a structural working
          set of 900+ routes. Pulling a charting library into the compile pass of the route{' '}
          <strong>every user hits on login</strong> is exactly the kind of addition that pushes a build over.
        </p>
        <p>
          Any heavy dependency — charts, PDF, rich text, maps — belongs behind <code>dynamic()</code> with{' '}
          <code>ssr: false</code>.
        </p>
      </Box>

      <h2>Bilingual from the start</h2>

      <pre><code>{`const { lang } = useI18n();
const isAr = lang === 'ar';
…
{isAr ? 'إشارات الذكاء' : 'Intelligence Signals'}
{isAr ? 'التحليل الكامل' : 'Full analysis'} <ArrowRight className="w-3 h-3 rtl-flip" />`}</code></pre>

      <Box kind="note" title="Two things to notice">
        <p>
          The page mixes inline <code>isAr ?</code> ternaries with <code>t()</code> calls (<code>t(&apos;nav.dashboard&apos;)</code>).
          Both are present. <strong><code>t()</code> is the preferred form</strong> — it keeps strings in the
          dictionaries where they can be reviewed. The ternary is acceptable for a one-off but does not scale.
        </p>
        <p>
          <code>rtl-flip</code> mirrors a directional icon in Arabic. An arrow that points right in an RTL
          layout points <em>backwards</em>. Apply it to any directional glyph.
        </p>
      </Box>

      <h2>Adding a block</h2>

      <pre><code>{`function FeesSnapshotBlock({ schoolId }: { schoolId: number | null }) {
  const { t } = useI18n();

  // 1. null key until the school is known
  const { data, isLoading, error } = useSWR(
    schoolId ? '/api/dashboard/fees-snapshot' : null,
    fetcher,
    { refreshInterval: 300_000 },      // 2. interval matched to the data
  );

  // 3. skeleton, not a spinner — it holds layout, so the page doesn't jump
  if (isLoading) return <BlockSkeleton />;

  // 4. one block failing must not blank the dashboard
  if (error) return <BlockError onRetry={() => mutate()} />;

  const snapshot = data?.data;                       // 5. unwrap the envelope
  if (!snapshot) return <BlockEmpty />;              // 6. empty is a real state

  return (
    <Link href="/finance/balances"                   // 7. always actionable
          className="rounded-2xl border border-slate-200 dark:border-slate-700
                     bg-white dark:bg-slate-900 p-4">
      {/* 8. dark: on EVERY colour */}
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        {t('dashboard.feesSnapshot', 'Fees snapshot')}   {/* 9. both languages */}
      </span>
      …
    </Link>
  );
}`}</code></pre>

      <Table
        head={['#', 'Rule', 'If you skip it']}
        rows={[
          ['1', 'Null key until prerequisites resolve', 'A burst of 401s on every load'],
          ['2', 'Interval matched to the data', 'Needless load, or stale numbers'],
          ['3', 'Skeleton that holds layout', 'The page jumps as each block lands'],
          ['4', 'Per-block error handling', 'One failing endpoint blanks the whole dashboard'],
          ['5', 'Unwrap the envelope', <><code>data.data</code> — see Data end to end</>],
          ['6', 'Empty state', 'A new school sees a blank box and assumes it is broken'],
          ['7', 'Link to where you act', 'The user has to go hunting'],
          ['8', <code>dark:</code>, 'Invisible for half the users'],
          ['9', 'Both languages', 'An English string in an Arabic UI'],
        ]}
      />

      <Box kind="invariant" title="Blocks must fail independently">
        <p>
          Each block owns its own fetch, loading state and error state. That is deliberate: the dashboard reads
          from several endpoints, and one slow or broken service must degrade to one empty card — never to a
          blank page.
        </p>
        <p>Do not lift the fetches into one parent request to &quot;tidy it up&quot;. You would be coupling their failure modes.</p>
      </Box>

      <h2>Common mistakes</h2>

      <Table
        head={['Mistake', 'Consequence']}
        rows={[
          [<>Fetching without the null-key guard</>, <>401 burst before the session resolves.</>],
          [<>Importing a chart library directly</>, <>Adds to the compile pass of the busiest route; risks the build ceiling.</>],
          [<>A spinner instead of a skeleton</>, <>Layout shift as blocks arrive.</>],
          [<>Forgetting <code>?.data</code></>, <><code>undefined</code> everywhere; the block silently renders empty.</>],
          [<>A block with no link</>, <>Reports a problem, offers no next step.</>],
          [<>Aggressive <code>refreshInterval</code></>, <>Every user polling on the busiest route in the product.</>],
          [<>Directional icon without <code>rtl-flip</code></>, <>Arrow points backwards in Arabic.</>],
        ]}
      />

      <SeeAlso slugs={['data-flow', 'theming', 'frontend', 'playbook-page']} />
    </ControlDoc>
  );
}
