'use client';

/**
 * Hand-written guide bodies, keyed by the same `target` as ./guide-index.ts.
 *
 * Rules for writing one (they are what makes these trustworthy):
 *   • Every claim is checked against the code at the commit in `verifiedAt`.
 *   • Paths go in <Source path="…"> so the staleness test can check them.
 *   • Analogies to plain JavaScript or PHP are labelled as analogies — DRAIS
 *     itself contains no PHP.
 *   • Known gaps are stated, with where the code itself records them.
 */
import React from 'react';
import Link from 'next/link';
import { Box, Source, Table, Diagram, FiveQuestions } from '../ControlDoc';

const R = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <Link href={`/control/docs/routes${to}`}>{children}</Link>
);
const F = ({ path, line, children }: { path: string; line?: number; children?: React.ReactNode }) => (
  <Link href={`/control/docs/files/${path.split('/').map(encodeURIComponent).join('/')}${line ? `#L${line}` : ''}`}><code>{children ?? path}</code></Link>
);

// ─── /attendance/settings — the teaching example ─────────────────────────────

function AttendanceSettingsGuide() {
  return (
    <>
      <p>
        This route is the reference for how a DRAIS settings screen is built: a client page with tabs and a form,
        section components that each load and save their own data, API routes that take the school from the
        session and validate on the server, a library module with the pure rules, and tests on those rules.
        Everything below is the real code; nothing is simplified unless it says so.
      </p>

      <h3>The layers, top to bottom</h3>
      <Diagram caption="What renders when a signed-in user opens /attendance/settings.">
{`  middleware.ts                       session cookie present?  no → /login (pages) / 401 (APIs)
  src/app/layout.tsx  RootLayout      providers: React Query · Progress · Auth · Theme · I18n
    └ LayoutContent                   picks the shell by pathname (school app vs print/auth/control)
      └ AuthenticatedShell            Toast · SWRConfig(fetcher) · ErrorBoundary · MainLayout (sidebar)
        └ src/app/attendance/layout.tsx   background gradient only — no logic
          └ src/app/attendance/settings/page.tsx   'use client' — tabs, rule form, save
              ├ <BoardingPolicySettings/>  <AttendanceSmsPolicies/>  <SmsQuietHoursSettings/>
              ├ <DeviceTimePolicySettings/> <LivePopupSettings/>  <LessonAttendanceSettings/>
              └ <LogsDisplaySettings/>      ← each: own fetch, own save, own toast

  browser ── GET/POST /api/attendance/settings ──► route.ts (server)
                                                     getSessionSchoolId → validate → SQL
                                                     lib/attendance/day-overrides  (pure merge rules, tested)
                                                     logAudit
                                                   tables: attendance_rules, attendance_rule_day_overrides`}
      </Diagram>

      <Table
        head={['Layer', 'File', 'Owns', 'Must not contain']}
        rows={[
          ['Page (client)', <F key="p" path="src/app/attendance/settings/page.tsx" />, 'Tabs, form state, calling the API, showing results', 'SQL, school id, permission decisions'],
          ['Section component', <F key="c" path="src/components/attendance/LogsDisplaySettings.tsx" />, 'One self-contained setting: load, edit, save, its own loading/error UI', 'Knowledge of the other tabs'],
          ['API route (server)', <F key="a" path="src/app/api/attendance/settings/route.ts" />, 'Who is asking (session), validation, SQL, audit', 'UI wording beyond error messages'],
          ['Library', <F key="l" path="src/lib/attendance/day-overrides.ts" />, 'Rules with no I/O — how a weekday override merges with the base rule', 'Request/response objects'],
          ['Test', <F key="t" path="src/lib/attendance/__tests__/day-overrides.test.mjs" />, 'Proves the merge rules', '—'],
        ]}
      />

      <h3>Server vs client — why the split falls where it does</h3>
      <p>
        <code>page.tsx</code> starts with <code>&apos;use client&apos;</code>: it runs in the browser, so it can hold state
        and react to clicks, but it can never see the database or trust itself about who the user is. Anything it sends
        can be edited in the browser&apos;s dev tools. <code>route.ts</code> runs only on the server: it reads the
        session cookie, decides the school, and talks to MySQL/TiDB or SQLite. That is why the page sends
        <code> applies_to</code> and times, but never a <code>school_id</code> — the route takes the school from
        <code> getSessionSchoolId(req)</code>.
      </p>
      <Box kind="invariant" title="The tenant comes from the session, never from the request">
        Every query in <code>route.ts</code> is <code>WHERE school_id = ?</code> with <code>session.schoolId</code>.
        A route that reads <code>school_id</code> from the body or query string must only do so for super-admins
        (see <F path="src/app/api/attendance/reports/aggregates/route.ts" line={39} /> for the approved shape).
      </Box>

      <h3>Data flow</h3>
      <ol>
        <li><strong>Load</strong> — one <code>useEffect</code> with an empty dependency array fetches
          <code> GET /api/attendance/settings</code> once on mount, fills <code>rulesByScope</code>/<code>rulesByKey</code>,
          and builds the form for the first configured group (page.tsx ~line 193).</li>
        <li><strong>Edit</strong> — every input calls <code>set(key, value)</code>, a one-line helper that copies the form
          object with one field changed. React re-renders because <code>setForm</code> received a new object.</li>
        <li><strong>Switch group</strong> — <code>switchScope</code> stashes the current weekday drafts, then loads the
          selected group&apos;s rule into the form. Rules for different groups are different rows, not variants.</li>
        <li><strong>Save</strong> — <code>handleSave</code> posts the form plus only the weekday overrides that actually
          override something, then updates the local maps with the returned <code>rule_id</code> instead of re-fetching.</li>
      </ol>

      <h3>Tabs</h3>
      <p>
        <code>SETTINGS_TABS</code> is a typed list; <code>tab</code> state picks the visible panel; the URL hash
        (<code>#sms</code>) makes each tab linkable and survives reload. All panels stay <em>mounted</em> and are hidden
        with the <code>hidden</code> attribute, so half-typed edits in one tab survive switching to another. The tab bar
        uses <code>role=&quot;tablist&quot;</code>/<code>aria-selected</code> so screen readers announce it. To add a tab,
        follow <Link href="/control/docs/playbook-tab">Add a custom tab</Link>, which uses this page.
      </p>

      <h3>Validation</h3>
      <Table
        head={['Where', 'What', 'Why there']}
        rows={[
          ['Browser', 'Warns when no school day is selected (weekday_mask === 0); numbers parsed with parseInt', 'Fast feedback only — it can be bypassed'],
          ['Server', 'HH:MM(:SS) regex on every time; weekday_mask clamped to 1–127; override rows filtered and re-validated', 'The authority: a request from curl gets the same checks'],
        ]}
      />

      <h3>Loading, errors, permissions</h3>
      <ul>
        <li>Loading: a centred spinner until the first GET settles (<code>loading</code> state).</li>
        <li>Save errors: the API&apos;s <code>error</code> text shown in a toast; the button is disabled while saving.</li>
        <li><strong>Gap:</strong> the initial load uses <code>.catch(() =&gt; {'{}'})</code> — if the GET fails the page silently
          shows defaults. Section components do better (LogsDisplaySettings sets an error toast). Copy theirs.</li>
        <li><strong>Gap, deliberate and recorded:</strong> <code>POST /api/attendance/settings</code> checks only that the user is
          signed in to the school, not a permission code. The reason (several schools have no role holding
          <code> attendance.manage</code> yet) is written in the route at line ~95. Do not copy this; new write routes
          call <code>requirePermission</code>.</li>
      </ul>

      <h3>Where does new code go?</h3>
      <Table
        head={['You need to…', 'Put it in', 'Not in']}
        rows={[
          ['Call a new endpoint from this screen', 'The section component that owns that setting (its own useEffect/save)', 'page.tsx, unless it is the rule form itself'],
          ['Add a business rule (e.g. "late after N minutes on Fridays")', 'src/lib/attendance/… as a pure function + a test in __tests__', 'The page or the route handler body'],
          ['Validate input', 'route.ts (authoritative); the page may repeat it for speed', 'Only the page'],
          ['Store a single school-wide setting', 'school_settings via a small route, like logs-display', 'A new table for one value'],
        ]}
      />

      <h3>Analogies for developers coming from plain JavaScript or PHP</h3>
      <Box kind="tip" title="Analogy — not DRAIS code. DRAIS has no PHP.">
        <p><strong>React state vs the DOM.</strong> In plain JavaScript you would read the input&apos;s value and write
          <code> el.textContent = …</code> yourself whenever something changes. Here <code>setForm(next)</code> stores the
          value and React rewrites whatever depends on it. The rule that replaces &quot;remember to update the DOM&quot;
          is &quot;never mutate state; pass a new object&quot; — that is why <code>set()</code> spreads <code>prev</code>.</p>
        <pre><code>{`// plain JS (analogy)
input.addEventListener('input', e => { form.closing_time = e.target.value; render(); });
// DRAIS
onChange={(e) => set('closing_time', e.target.value)}`}</code></pre>
        <p><strong>route.ts vs a PHP endpoint.</strong> <code>POST()</code> in <code>route.ts</code> plays the part of a
          <code> save_settings.php</code> that reads <code>$_SESSION[&apos;school_id&apos;]</code>, validates <code>$_POST</code>,
          and runs a PDO prepared statement. <code>query(sql, [params])</code> is the prepared statement; the
          <code> ?</code> placeholders are why there is no string concatenation of user input.</p>
        <pre><code>{`// PHP (analogy)
$school = $_SESSION['school_id'];             // never $_POST['school_id']
if (!preg_match('/^\\d{2}:\\d{2}/', $_POST['closing_time'])) { http_response_code(400); exit; }
$pdo->prepare('UPDATE attendance_rules SET … WHERE school_id = ?')->execute([$school]);`}</code></pre>
      </Box>

      <Source path="src/app/attendance/settings/page.tsx" />
      <Source path="src/app/api/attendance/settings/route.ts" />
    </>
  );
}

// ─── /attendance — data loading ──────────────────────────────────────────────

function AttendanceDashboardGuide() {
  return (
    <>
      <p>
        The dashboard has exactly two data sources, both in <F path="src/app/attendance/page.tsx" />:
      </p>
      <Table
        head={['Source', 'Code', 'Refresh', 'Server side']}
        rows={[
          ['Counts, devices, hourly chart, recent punches', <code key="a">useSWR(`/api/attendance/zk/dashboard?date=${'${date}'}`)</code>, 'Every 15 s (refreshInterval) and when the date changes', <F key="b" path="src/app/api/attendance/zk/dashboard/route.ts" />],
          ['Live punch feed', <code key="c">useLiveFeed()</code>, 'Server-sent events (EventSource), pushed as punches are saved', <F key="d" path="src/app/api/attendance/stream/route.ts" />],
        ]}
      />
      <p>
        <code>useSWR</code> is called without a fetcher: the global <code>SWRConfig</code> in
        <F path="src/components/layout/AuthenticatedShell.tsx" line={66} /> supplies <code>swrFetcher</code> and turns off
        focus revalidation and error retries. Present / late / absent numbers are not computed in the page or the route
        body but in <F path="src/lib/attendance/dashboard-counts.ts" />, which reads the already-evaluated
        <code> attendance_records</code> verdicts — its header explains why two earlier versions were wrong.
      </p>
      <Box kind="warning" title="Changing a number on this dashboard">
        Change <code>dashboard-counts.ts</code> (and its consumers&apos; tests), not the JSX. The page only formats what
        the API returns.
      </Box>
    </>
  );
}

// ─── src/app/layout.tsx ──────────────────────────────────────────────────────

function RootLayoutGuide() {
  return (
    <>
      <FiveQuestions
        what={<>The only layout every school-facing page inherits. It sets up providers and chooses which shell wraps the page.</>}
        why={<>Next.js requires one root layout; DRAIS also uses it to decide, per URL, whether a page gets the sidebar app shell or renders bare (login, print targets, parent portal, Control Center).</>}
        how={<><code>RootLayout</code> stacks QueryClient → Progress → Auth → Theme → I18n providers, then <code>LayoutContent</code> reads the pathname: a list of prefixes renders bare; everything else goes into <code>AuthenticatedShell</code> (SWR fetcher, toasts, error boundary, <code>MainLayout</code> sidebar). In offline mode, a page whose prefix is not in <code>OFFLINE_SAFE_PREFIXES</code> shows a notice instead of loading.</>}
        where={<><F path="src/app/layout.tsx" />, <F path="src/components/layout/AuthenticatedShell.tsx" />, <F path="src/components/layout/MainLayout.tsx" /></>}
        extend={<>A new bare page (no sidebar) → add its prefix to <code>hideSidebarAndNavbar</code>. A page that works without the network → add it to <code>OFFLINE_SAFE_PREFIXES</code> only after testing it in local SQLite mode. A new app-wide provider → <code>AuthenticatedShell</code>, not here, unless login screens need it too.</>}
      />
      <Box kind="invariant" title="This layout does not authenticate">
        Authentication is <code>middleware.ts</code> (redirect when the session cookie is missing) plus every API
        route&apos;s own <code>getSessionSchoolId</code>/<code>requirePermission</code>. A page that renders inside the shell
        but whose APIs skip those checks is exposed.
      </Box>
    </>
  );
}

// ─── src/app/(protected)/layout.tsx ──────────────────────────────────────────

function ProtectedLayoutGuide() {
  return (
    <>
      <p>
        The file says it &quot;wraps all protected pages and enforces authentication&quot; for <code>/dashboard</code>,
        <code> /students</code>, <code>/tahfiz</code>. <strong>It wraps none of them.</strong> A layout only applies to
        routes inside its folder, and <code>src/app/(protected)/</code> contains no page — only this file. The route
        tree on the left confirms it: no route lists it in its layout chain.
      </p>
      <p>What actually protects a school page:</p>
      <ol>
        <li><F path="middleware.ts" /> — no session cookie → redirect to <code>/login</code> (pages) or 401 (APIs).</li>
        <li>The API routes the page calls — each checks the session and, for writes, a permission code.</li>
      </ol>
      <Box kind="warning" title="Before moving pages into (protected)">
        Doing so would add a server-side cookie check to those pages (useful as defence in depth) but also log every
        render via its <code>console.log</code> lines. Decide deliberately; it is not a no-op.
      </Box>
    </>
  );
}

function StudentsListGuide() {
  return (
    <p>
      This route has a full hand-written blueprint: <Link href="/control/docs/blueprint-students-list">Blueprint:
      students list</Link>. The generated sections below are kept for the live dependency and endpoint lists.
    </p>
  );
}

export const GUIDES: Record<string, () => React.ReactElement> = {
  '/attendance/settings': AttendanceSettingsGuide,
  '/attendance': AttendanceDashboardGuide,
  'src/app/layout.tsx': RootLayoutGuide,
  'src/app/(protected)/layout.tsx': ProtectedLayoutGuide,
  '/students/list': StudentsListGuide,
};

export { R as RouteLink, F as FileLink };
