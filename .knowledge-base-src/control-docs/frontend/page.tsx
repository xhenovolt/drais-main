'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso, FiveQuestions } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="frontend">
      <p>
        DRAIS is a Next.js App Router application that is, in practice, a <strong>client-rendered app with
        server route handlers</strong>. Understanding that sentence — and why it is true — explains most of
        what you will find in the frontend.
      </p>

      <FiveQuestions
        what={<>The React layer: a global provider tree, a staff shell, and 248 pages that fetch from 691 route handlers.</>}
        why={<>Multi-tenant school software with heavy interactivity (mark sheets, live attendance, a report designer). Server components were not adopted because nearly every screen is stateful and session-scoped.</>}
        how={<>Root layout mounts every provider. Pages are <code>&apos;use client&apos;</code> and fetch via SWR. State ownership is split between four contexts, one Zustand store, and per-component SWR cache.</>}
        where={<><code>src/app/layout.tsx</code> (providers) · <code>src/contexts/</code> (4) · <code>src/hooks/</code> (14) · <code>src/components/</code> (300, by domain)</>}
        extend={<>Add data fetching with SWR at the call site. Do not add a context unless the value is genuinely global and changes rarely — see the rule below.</>}
      />

      <h2>The provider tree</h2>

      <p>
        Every route in the application mounts this stack, including <code>/control</code> and the parent
        portal. Order matters: an inner provider may consume an outer one.
      </p>

      <Diagram caption="src/app/layout.tsx — RootLayout. All of it is client-side.">
{`  QueryClientProvider          TanStack Query — mounted, barely used (see below)
   └ ProgressProvider          global progress bar for long operations
      └ AuthProvider           school session + CLIENT-side route protection
         └ OnboardingProvider  tour, help search (⌘⇧H)
            └ TermProvider     current term + all terms
               └ ThemeProvider light / dark / system
                  └ I18nProvider        EN / AR, RTL
                     └ ToastProvider
                        └ SWRConfig     the real data layer
                           └ ErrorBoundary
                              └ LayoutContent   ← decides shell vs bare`}
      </Diagram>

      <Box kind="warning" title="The provider tree runs everywhere — including other auth domains">
        <p>
          <code>AuthProvider</code> mounts on <code>/control</code> and <code>/portal</code> too, because it
          sits in the root layout and those areas nest inside it. It therefore performs a{' '}
          <strong>client-side redirect</strong> for any route it does not recognise as exempt.
        </p>
        <p>
          This has already caused one production defect: the Control Center login was unreachable without a
          school session, because <code>AuthContext</code> kept its own exemption list and that list was
          missing <code>/control</code>. Exemptions now live in one shared module —{' '}
          <strong>add new ones there, never inline.</strong>
        </p>
      </Box>

      <Source path="src/lib/routes/auth-scope.ts">
        The single list of routes exempt from school auth. Consumed by both middleware.ts and AuthContext.
      </Source>

      <h2>The shell, and how to bypass it</h2>

      <p>
        <code>LayoutContent</code> decides whether a route gets the staff chrome (sidebar, navbar,
        impersonation banner, live-scan popup, onboarding overlays) or renders bare.
      </p>

      <Table
        head={['Rendered bare', 'Why']}
        rows={[
          [<><code>/control</code></>, <>Its own dark operator chrome and its own auth domain.</>],
          [<><code>/portal</code>, <code>/parent</code></>, <>Parent-facing; staff navigation would be wrong and confusing.</>],
          [<><code>/print-snapshot</code>, <code>/print-transcript</code>, <code>/rpt</code></>, <><strong>Puppeteer captures these.</strong> Any overlay would be baked into the PDF.</>],
          [<><code>/login</code>, <code>/signup</code>, <code>/auth/*</code>, error pages</>, <>No session yet.</>],
          [<><code>/verify</code></>, <>Public QR landing page.</>],
        ]}
      />

      <Box kind="invariant" title="Print routes must never gain a global overlay">
        <p>
          Onboarding modals, splash screens and toasts are deliberately not rendered on the bare branch. A
          well-meaning &quot;show this everywhere&quot; component added outside that check will appear in
          printed report cards, and nobody will notice until a school prints four hundred of them.
        </p>
      </Box>

      <h2>Data fetching: three layers, one of them vestigial</h2>

      <p>Be honest about what you will actually encounter in this codebase:</p>

      <Table
        head={['Approach', 'Files', 'Verdict']}
        rows={[
          [<><strong>SWR</strong> (<code>useSWR</code>)</>, '~165', <><strong>The de facto standard.</strong> Use this for new work. A global <code>SWRConfig</code> supplies the fetcher, disables focus revalidation and disables error retry.</>],
          [<><strong><code>apiFetch</code></strong> (<code>@/lib/apiClient</code>)</>, '~34 files', <><strong>The mandated wrapper for every client-side call.</strong> Guarantees success/error toasts, consistent parsing, and throws on failure. Pass <code>{'{ silent: true }'}</code> for background reads.</>],
          [<>Raw <code>fetch</code> in a component</>, '~122 pages', <><strong>Policy says this is forbidden</strong>, and the codebase has not caught up. Use <code>apiFetch</code> in new code; converting an old file when you touch it is cheap and buys error surfacing.</>],
          [<><strong>TanStack Query</strong> (<code>useQuery</code>)</>, '4', <><strong>Effectively vestigial.</strong> The provider is mounted globally but almost nothing uses it. Do not add new usage — you would be maintaining a second cache for no benefit.</>],
        ]}
      />

      <Box kind="tip" title="Why SWR won here">
        <p>
          Nearly every DRAIS screen is &quot;fetch a school-scoped list, show it, mutate it, revalidate&quot;.
          SWR&apos;s key-based cache maps cleanly onto route URLs that already encode the tenant scope, and
          <code>mutate(key)</code> after a write is the whole invalidation story. The global config disables
          <code>revalidateOnFocus</code> deliberately: a bursar tabbing between windows should not re-query a
          large ledger every time.
        </p>
      </Box>

      <h2>Who owns which state</h2>

      <p>
        This is the question to ask before adding anything. DRAIS keeps global state deliberately small.
      </p>

      <Table
        head={['State', 'Owner', 'Why there']}
        rows={[
          [<>Signed-in user, school id, setup status</>, <code>AuthContext</code>, <>Needed by nearly every screen; changes only at login/logout.</>],
          [<>Current term, all terms</>, <code>TermContext</code>, <>Almost every record attaches to a term. Fetching it per page would be dozens of duplicate calls.</>],
          [<>Long-operation progress</>, <code>ProgressContext</code>, <>Exists to kill silent operations — any long loop must emit progress. Global because the bar is rendered at the shell.</>],
          [<>Tour, help search</>, <code>OnboardingContext</code>, <>Cross-cutting UI that any page can trigger.</>],
          [<>Theme</>, <>Zustand (<code>useThemeStore</code>), persisted</>, <>Must be readable before React hydrates — see the anti-flicker note below.</>],
          [<>Everything else</>, <>SWR cache, keyed by URL</>, <><strong>Default here.</strong> Server data is not application state.</>],
        ]}
      />

      <Box kind="invariant" title="The rule for adding a context">
        <p>
          Add one only if the value is <strong>needed by many unrelated screens</strong> AND{' '}
          <strong>changes rarely</strong>. Server data fails the second test — it belongs in SWR, keyed by the
          URL that produced it. Four contexts for a 307,000-line application is the intended ratio, not an
          accident.
        </p>
      </Box>

      <h3>Theme, and the anti-flicker script</h3>

      <p>
        The theme preference is read from <code>localStorage</code> by an inline script in{' '}
        <code>&lt;head&gt;</code> that runs <strong>before first paint</strong> and stamps{' '}
        <code>.dark</code> onto <code>&lt;html&gt;</code>. Without it, a dark-mode user sees a white flash on
        every load.
      </p>

      <Box kind="warning">
        <p>
          The inline script and <code>useThemeStore</code> must read the same persisted key
          (<code>drais-theme-store</code>) and agree on how a preference resolves. Change one and you must
          change the other, or the pre-paint state and the hydrated state will disagree.
        </p>
        <p>
          Tailwind v4 binds <code>dark:</code> to the <code>.dark</code> class via a custom variant. If a
          theme toggle ever appears to do nothing, that binding is the first thing to check.
        </p>
      </Box>

      <h2>Component organisation</h2>

      <p>
        <code>src/components/</code> is organised <strong>by domain, not by type</strong> — there is no
        <code>containers/</code> or <code>views/</code>. Roughly 35 folders mirroring the product areas
        (<code>attendance</code>, <code>finance</code>, <code>drce</code>, <code>students</code>…), plus{' '}
        <code>ui/</code> for primitives and <code>layout/</code> for the shell.
      </p>

      <p>Put a component in the domain folder it serves. Promote to <code>ui/</code> only once it is genuinely generic and used by three or more domains.</p>

      <h2>Internationalisation</h2>

      <Box kind="invariant" title="Every localisation change keeps English and Arabic">
        <p>
          Use <code>t(&apos;key&apos;, &apos;English fallback&apos;)</code> and add the key to{' '}
          <strong>both</strong> <code>en.json</code> and <code>ar.json</code>. Never hardcode Arabic strings
          and never make a surface Arabic-only.
        </p>
        <p>
          The dictionaries are near-complete; the actual i18n problem in this codebase is{' '}
          <strong>components bypassing <code>t()</code></strong> and writing English inline.
        </p>
      </Box>

      <p>Arabic implies RTL. Test layout in both directions before shipping anything with a fixed direction.</p>

      <h2>Failure modes worth recognising</h2>

      <Table
        head={['Symptom', 'Usual cause']}
        rows={[
          [<>Redirected to <code>/auth/login</code> from a page that should not require staff auth</>, <>Route missing from <code>auth-scope.ts</code>.</>],
          [<>White flash on load in dark mode</>, <>The anti-flicker script and the store have diverged.</>],
          [<>A toggle does nothing in dark mode</>, <>Missing <code>dark:</code> variants, or the Tailwind custom variant binding.</>],
          [<>Stale data after a mutation</>, <>No <code>mutate(key)</code> after the write. SWR will not know.</>],
          [<>Overlay appears in a printed PDF</>, <>Component mounted outside the bare-shell branch.</>],
          [<>Two caches disagree</>, <>Something added a <code>useQuery</code> alongside an SWR key for the same data.</>],
        ]}
      />

      <Source path="src/app/layout.tsx">Provider tree and the shell decision.</Source>
      <Source path="src/contexts/">AuthContext, TermContext, ProgressContext, OnboardingContext.</Source>

      <SeeAlso slugs={['hooks', 'request-lifecycle', 'security', 'playbook-page']} />
    </ControlDoc>
  );
}
