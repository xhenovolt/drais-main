'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="hooks">
      <p>
        Fourteen custom hooks for a 307,000-line application. That is deliberate: most data fetching is SWR at
        the call site, and a hook is only justified when it encodes a <strong>business rule</strong> that would
        otherwise be re-implemented inconsistently.
      </p>

      <Box kind="note" title="A note on names you may have been told about">
        <p>
          There is no <code>useProvider()</code>, <code>useSchool()</code>, <code>useAttendance()</code> or{' '}
          <code>usePermissions()</code> in this codebase. If you were pointed at those, the nearest real
          equivalents are <code>useSchoolConfig()</code>, plain SWR against the attendance routes, and
          server-side <code>authorize()</code> respectively. Permissions are deliberately{' '}
          <strong>not</strong> a client hook — see the warning at the end.
        </p>
      </Box>

      <h2>The hooks that encode business rules</h2>

      <p>These three exist to stop the same decision being made differently in twenty places.</p>

      <h3><code>useSchoolConfig()</code></h3>

      <Table
        head={['', '']}
        rows={[
          ['Business purpose', <>School identity — name, address, logo, motto, contact. The things that appear on every printed document and page header.</>],
          ['Architectural purpose', <><strong>The single client-side entry point for school identity.</strong> It exists so that no component hardcodes a school name or reaches for the session object directly.</>],
          ['State ownership', <>Server data, cached by SWR. Not context — it changes rarely and not every screen needs it.</>],
          ['Incorrect usage', <>Hardcoding any school value; reading school fields off the auth user; using it in a print path where the value must be <em>frozen</em> rather than live.</>],
        ]}
      />

      <Box kind="invariant" title="Report cards do not use this hook">
        <p>
          Printed reports read branding from <code>snapshot.meta.branding</code>, frozen at generation time —
          never a live lookup. A school that changes its logo must not retroactively change last term&apos;s
          report cards. Using <code>useSchoolConfig()</code> in a render path would silently break that.
        </p>
      </Box>

      <h3><code>useEnabledModules()</code></h3>

      <Table
        head={['', '']}
        rows={[
          ['Business purpose', <>Which optional modules this school has — Tahfiz, Payroll, Examinations, Pass-outs.</>],
          ['Architectural purpose', <>Lets UI avoid rendering entries for things the school has not bought. SWR-cached so navigating does not refetch.</>],
          ['Side effects', <>None. Read-only.</>],
          ['Incorrect usage', <><strong>Treating it as a security control.</strong> It is presentational only.</>],
        ]}
      />

      <Box kind="warning" title="Hiding a menu item is not gating a module">
        <p>
          A module hidden by this hook is still reachable by typing the URL and its API is still callable. The
          real gate is server-side: <code>withModule(&apos;tahfiz&apos;, handler)</code> on the route. Use both
          — the hook for the menu, the wrapper for the enforcement.
        </p>
        <p>Note that super-admin does <strong>not</strong> bypass module gates: modules model subscription, not seniority.</p>
      </Box>

      <h3><code>useCurrency()</code></h3>

      <p>
        Binds the school&apos;s display currency (default UGX) to the canonical formatter in{' '}
        <code>@/lib/currency</code>. <strong>Every finance surface must format through this.</strong>
        Inconsistent money formatting across screens is the kind of defect a bursar notices immediately and
        loses confidence over.
      </p>

      <h2>Data hooks</h2>

      <Table
        head={['Hook', 'Purpose', 'Notes']}
        rows={[
          [<code>useStudents()</code>, <>Learner list with local state.</>, <>Predates the SWR convention and manages its own <code>useState</code>/<code>useEffect</code>. Works, but for new list screens prefer SWR directly — you get caching and revalidation for free.</>],
          [<code>useNotifications()</code>, <>In-app notifications.</>, <>SWR plus <code>useSocket</code> for live updates. Falls back to polling when the socket is unavailable, which is the normal case on serverless.</>],
          [<code>useFeatureFlags()</code>, <>Per-route feature flags.</>, <>SWR-cached. Presentational, like modules — not a security boundary.</>],
        ]}
      />

      <h2>Device and capability hooks</h2>

      <Table
        head={['Hook', 'Purpose', 'Notes']}
        rows={[
          [<code>useFingerprint()</code>, <>Fingerprint capture (332 lines — the largest hook).</>, <>Wraps <code>utils/fingerprintCapture</code>. Hardware-dependent, so it must degrade gracefully: a device that is absent or refuses is normal, not exceptional.</>],
          [<code>useWebAuthn()</code>, <>Browser biometric / FIDO2.</>, <>Separate concern from device fingerprints. Used for sign-in convenience, not attendance.</>],
          [<code>useSocket()</code>, <>Socket.io client.</>, <><strong>Browser-only and frequently unavailable.</strong> On serverless there is no persistent socket server, so anything depending on it must have a polling fallback. Never make a feature socket-dependent.</>],
        ]}
      />

      <Box kind="warning" title="The event bus does not cross serverless instances">
        <p>
          This is the single most common source of &quot;it works locally, not in production&quot; in DRAIS.
          In the Electron desktop build the process is shared, so in-memory events work. On Vercel each request
          may be a different lambda, so an in-memory bus reaches nobody. Live features are{' '}
          <strong>ingest-and-poll bound</strong>, not push bound.
        </p>
      </Box>

      <h2>Utility hooks</h2>

      <Table
        head={['Hook', 'Purpose']}
        rows={[
          [<code>useThemeStore()</code>, <>Zustand store, persisted. Must stay in sync with the pre-paint anti-flicker script — see Frontend architecture.</>],
          [<code>usePagination()</code>, <><strong>Client-side</strong> pagination over an in-memory array. Fine for a few hundred rows; wrong for a large list, which needs server pagination.</>],
          [<code>useExport()</code>, <>React wrapper over the export service, with error handling.</>],
          [<code>usePageTitle()</code>, <>Document title from the route. Overlaps with the root layout&apos;s <code>DynamicTitle</code> — check which is active before adding a third.</>],
          [<code>useRouteValidator()</code>, <>Development-only route verification at startup.</>],
        ]}
      />

      <h2>Writing a new hook</h2>

      <p>Ask, in order:</p>

      <ol>
        <li><strong>Is it just a fetch?</strong> Then it is <code>useSWR(url)</code> at the call site, not a hook.</li>
        <li><strong>Does it encode a business rule?</strong> Currency formatting, school identity, module availability. That justifies a hook.</li>
        <li><strong>Is it used in three or more unrelated places?</strong> Below that, a local function is clearer.</li>
        <li><strong>Does it touch hardware or the network directly?</strong> Then it must degrade gracefully — absence is the normal case, not an error.</li>
      </ol>

      <Box kind="invariant" title="Never write usePermissions()">
        <p>
          It has been considered and rejected. A client-side permission hook invites the pattern{' '}
          <code>{'{can(\'x\') && <Button/>}'}</code> as though it were enforcement — it is not. Anything the
          button does is reachable by calling the API directly.
        </p>
        <p>
          Permissions are checked <strong>server-side, per route</strong>, via <code>authorize()</code>. If a
          screen needs to hide an action, fetch that specific capability from an endpoint that has already
          performed the real check — do not ship the permission set to the client and evaluate it there.
        </p>
      </Box>

      <Source path="src/hooks/">All 14 hooks. Most carry a header comment stating their contract.</Source>
      <Source path="src/lib/rbac/README.md">Why authorization is server-side.</Source>

      <SeeAlso slugs={['frontend', 'security', 'playbook-page']} />
    </ControlDoc>
  );
}
