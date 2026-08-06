'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="theming">
      <p>
        The question people ask is &quot;why is the colouring in the theme file?&quot; The honest answer is
        that it is <strong>not in one file</strong> — it is a deliberate three-layer cascade, and knowing which
        layer to touch is the difference between a change that works everywhere and one that breaks dark mode,
        school branding, or both.
      </p>

      <h2>Where colour actually lives</h2>

      <Table
        head={['Layer', 'File', 'Owns']}
        rows={[
          ['1. Tokens', <code>src/app/globals.css</code>, <>The default palette. <code>:root</code> for light, <code>html.dark</code> for dark. <strong>The source of truth.</strong></>],
          ['2. School brand', <code>src/components/theme/SchoolThemeApplier.tsx</code>, <>Injects a <code>&lt;style&gt;</code> overriding tokens with the school&apos;s brand colours.</>],
          ['3. Personal', <code>src/components/theme/ThemeProvider.tsx</code>, <>Writes inline styles on <code>&lt;html&gt;</code> for the individual user&apos;s choices.</>],
          ['State', <code>src/hooks/useThemeStore.ts</code>, <>Zustand, persisted. Holds the user&apos;s preference; does not itself contain the palette.</>],
        ]}
      />

      <Diagram caption="Precedence, low to high. Each layer overrides the same CSS custom properties.">
{`  1  globals.css  :root / html.dark      ← DRAIS defaults
            │
  2  SchoolThemeApplier <style>          ← school brand, light AND dark
            │                               (so branding is consistent in both)
  3  ThemeProvider inline on <html>      ← this user's personal choice
            │
            ▼
     what the browser paints`}
      </Diagram>

      <Box kind="tip" title="Why that order">
        <p>
          A school brand shows for <strong>everyone who has not personally customised</strong>, and a personal
          choice still wins for that individual. Inverting it would either erase branding or trap a user in a
          colour they cannot change.
        </p>
      </Box>

      <h2>The token set</h2>

      <p>
        Semantic names, not palette names — <code>--primary</code>, not <code>--blue-600</code>. That is what
        lets a school swap the brand colour without renaming anything.
      </p>

      <Table
        head={['Group', 'Tokens']}
        rows={[
          ['Surfaces', <><code>--background</code> <code>--foreground</code> <code>--card</code> <code>--popover</code> <code>--muted</code> <code>--border</code> <code>--input</code> <code>--ring</code></>],
          ['Brand', <><code>--primary</code> <code>--secondary</code> <code>--accent</code> (+ each <code>-foreground</code>)</>],
          ['Status', <><code>--danger</code> <code>--warning</code> <code>--success</code> <code>--info</code> (+ <code>-foreground</code>)</>],
          ['Shape', <><code>--radius</code> <code>--shadow-sm/md/lg</code> <code>--gradient-from/to</code> <code>--font-scale</code></>],
          ['Glass', <><code>--glass-blur</code> <code>--glass-opacity</code> <code>--glass-bg</code> <code>--glass-border</code></>],
        ]}
      />

      <p>Every token has a <code>-foreground</code> pair. Use them together — that pairing is what guarantees contrast survives a brand override.</p>

      <h2>From token to utility</h2>

      <p>
        A non-inline <code>@theme</code> block maps each raw token to a Tailwind colour, which does two things
        at once:
      </p>

      <pre><code>{`@theme {
  --color-primary: var(--primary);
  --color-card:    var(--card);
  --color-danger:  var(--danger);
  …
}`}</code></pre>

      <ol>
        <li>Generates the semantic utilities: <code>bg-primary</code>, <code>text-muted-foreground</code>, <code>border-border</code>, <code>bg-card</code>, <code>bg-danger</code>.</li>
        <li>Emits <code>--color-*</code> into <code>:root</code>, which keeps the ~26 files reading <code>var(--color-primary)</code> working.</li>
      </ol>

      <Box kind="invariant" title="Each --color-* references a raw token, and that is the whole trick">
        <p>
          Because <code>--color-primary</code> points at <code>var(--primary)</code> rather than a literal,
          a runtime override of <code>--primary</code> — by dark mode, school branding or personal choice —
          flows through to every utility and every <code>var(--color-primary)</code> call site automatically.
        </p>
        <p>Resolve it to a literal and you sever all three override paths at once.</p>
      </Box>

      <h2>The dark-mode binding</h2>

      <pre><code>{`@custom-variant dark (&:where(.dark, .dark *));`}</code></pre>

      <Box kind="warning" title="One line, and the historical &quot;dark mode button does nothing&quot; bug">
        <p>
          Tailwind v4&apos;s <code>dark:</code> variant defaults to <code>prefers-color-scheme</code> — the OS
          setting. DRAIS drives theme from an in-app toggle that adds <code>.dark</code> to{' '}
          <code>&lt;html&gt;</code>.
        </p>
        <p>
          Without that rebinding the toggle flips the class and <strong>no <code>dark:</code> utility
          responds</strong>. It must come before utilities. If a theme toggle ever appears to do nothing, this
          is the first thing to check.
        </p>
      </Box>

      <p>
        The same reasoning drives the dark token overrides being on <code>html.dark</code> rather than a media
        query: a user on a dark-themed OS can still choose Light in DRAIS and get a light UI.
      </p>

      <h2>The anti-flicker script</h2>

      <p>
        An inline script in <code>&lt;head&gt;</code> reads the persisted preference from{' '}
        <code>localStorage</code> and stamps <code>.dark</code> onto <code>&lt;html&gt;</code>{' '}
        <strong>before first paint</strong>. Without it, a dark-mode user sees a white flash on every load.
      </p>

      <Box kind="invariant" title="The script and the store must agree">
        <p>
          Both read <code>drais-theme-store</code> and must resolve a preference identically (including{' '}
          <code>system</code> → OS query). Change one without the other and the pre-paint state disagrees with
          the hydrated state — producing a flash, or a theme that flips a moment after load.
        </p>
      </Box>

      <h2>Glass</h2>

      <p>The policy is explicit in the token comments, and worth restating because it is easy to get wrong:</p>

      <ul>
        <li>A translucent tint over the <strong>solid card colour</strong>, so text stays readable.</li>
        <li>A <strong>visible themed border</strong>.</li>
        <li>A solid fallback when the browser cannot blur, or glass is disabled.</li>
        <li><strong>Never a bare low-alpha white.</strong></li>
      </ul>

      <p>
        <code>html[data-glass=&apos;off&apos;]</code> collapses <code>--glass-bg</code> to <code>var(--card)</code>{' '}
        — a fully readable solid surface. Set by ThemeProvider (personal) or SchoolThemeApplier (school).
      </p>

      <h2>Rules for writing components</h2>

      <Box kind="invariant" title="Never hardcode a raw palette value">
        <p>
          Not <code>#2563eb</code>, not <code>bg-blue-600</code> for something that means &quot;primary&quot;.
          Use the semantic utility (<code>bg-primary</code>) or <code>var(--primary)</code>.
        </p>
        <p>
          A hardcoded hex ignores dark mode, ignores school branding, and ignores the user&apos;s personal
          colour — three features broken by one literal.
        </p>
      </Box>

      <Table
        head={['Instead of', 'Write']}
        rows={[
          [<code>bg-blue-600</code>, <code>bg-primary</code>],
          [<code>text-gray-500</code>, <code>text-muted-foreground</code>],
          [<code>border-gray-200 dark:border-gray-800</code>, <code>border-border</code>],
          [<code>bg-white dark:bg-slate-900</code>, <code>bg-card</code>],
          [<code>text-red-600</code>, <code>text-danger</code>],
          [<code>#2563eb</code>, <code>var(--primary)</code>],
        ]}
      />

      <Box kind="note" title="Where literal palette colours are still legitimate">
        <p>
          Much of the codebase uses explicit Tailwind palette classes with paired <code>dark:</code> variants —
          the dashboard signal cards are a good example (<code>bg-amber-50 dark:bg-amber-900/20</code>). That is
          acceptable when the colour is <strong>categorical</strong> (this is a warning, this is a decline) rather
          than <strong>brand</strong>.
        </p>
        <p>
          The rule is: anything that should follow the school&apos;s brand must be a token. Category colours may
          be literal — but they still need their <code>dark:</code> variant.
        </p>
      </Box>

      <h2>Also carried by the theme layer</h2>

      <Table
        head={['Concern', 'Note']}
        rows={[
          [<>Font scale</>, <><code>--font-scale</code>, for accessibility.</>],
          [<>Sidebar position and collapse</>, <>Personal preference; <code>sidebarPosition</code> supports RTL layouts.</>],
          [<>Icon scale</>, <>Personal preference.</>],
          [<>Radius</>, <>School branding maps named sizes (<code>none/sm/md/lg/full</code>) to pixel values.</>],
          [<>Overflow guard</>, <><code>html, body {'{ overflow-x: hidden }'}</code> plus <code>.table-responsive</code> — tables scroll inside their own container rather than the page.</>],
        ]}
      />

      <h2>Common mistakes</h2>

      <Table
        head={['Mistake', 'Consequence']}
        rows={[
          [<>Hardcoding a hex or brand palette class</>, <>Breaks dark mode, school branding and personal colour together.</>],
          [<>Using a colour without its <code>-foreground</code> pair</>, <>Contrast fails once a school picks a dark brand colour.</>],
          [<>Resolving <code>--color-*</code> to a literal</>, <>Severs every runtime override path.</>],
          [<>Changing the anti-flicker script alone</>, <>White flash, or a theme that flips after hydration.</>],
          [<>Removing or reordering the <code>@custom-variant</code> line</>, <>Every <code>dark:</code> utility stops responding to the toggle.</>],
          [<>Adding a colour with no <code>dark:</code> variant</>, <>Invisible or unreadable for half the users.</>],
          [<>Styling glass as low-alpha white</>, <>Unreadable text; violates the stated policy.</>],
        ]}
      />

      <Source path="src/app/globals.css">Tokens, the @theme mapping, and the dark binding. Read the comments — they explain the reasoning inline.</Source>
      <Source path="src/components/theme/ThemeProvider.tsx">Personal preferences applied to &lt;html&gt;.</Source>
      <Source path="src/components/theme/SchoolThemeApplier.tsx">School branding, with the precedence rules stated in its header.</Source>

      <SeeAlso slugs={['frontend', 'components', 'dashboard-anatomy', 'playbook-page']} />
    </ControlDoc>
  );
}
