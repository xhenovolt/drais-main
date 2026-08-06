'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="components">
      <p>
        300 components across 35 domain folders. Before cataloguing them, the number that actually governs how
        you should work:
      </p>

      <Box kind="warning" title="DRAIS does not have an adopted design system">
        <Table
          head={['Measure', 'Count']}
          rows={[
            [<>Files importing <em>any</em> <code>@/components/ui/</code> primitive</>, <strong>39</strong>],
            [<>Files containing an inline <code>&lt;button&gt;</code></>, <strong>362</strong>],
            [<>Total <code>.tsx</code> files</>, <strong>596</strong>],
          ]}
        />
        <p>
          <code>components/ui/</code> exists, is reasonable, and is used by roughly{' '}
          <strong>6% of the codebase</strong>. Styling is overwhelmingly inline Tailwind, written per screen.
        </p>
      </Box>

      <p>
        This matters because the usual advice — &quot;use the design system&quot; — would be misleading here.
        There is no consistent system to conform to, and a change that assumes one will look out of place next
        to everything around it.
      </p>

      <h2>What is genuinely shared</h2>

      <p>Adoption counts, measured. These are the primitives that have actually earned their place:</p>

      <Table
        head={['Component', 'Files', 'Use it?']}
        rows={[
          [<code>Pagination</code>, '10', <><strong>Yes.</strong> The most-adopted primitive. Do not hand-roll pager controls.</>],
          [<code>Toast</code>, '9', <><strong>Yes</strong> — though most feedback should come through <code>apiFetch</code>, which toasts automatically.</>],
          [<code>NewBadge</code>, '9', <>Yes. Marks newly added features.</>],
          [<code>Modal</code> / <code>EnhancedModal</code>, '6', <>Yes. Two exist; check which the surrounding screen uses.</>],
          [<code>Button</code>, '4', <>Optional. Inline Tailwind is the de facto norm, and matching neighbours matters more than the abstraction.</>],
          [<code>Select</code>, '3', <>Optional.</>],
          [<code>Card</code>, '2', <>Optional.</>],
          [<code>Input</code>, <code>Badge</code>, <code>SearchBar</code>, <code>SkeletonLoader</code>, '1 each', <>Effectively unused.</>],
          [<code>Textarea</code>, <code>Table</code>, '0', <><strong>Unused.</strong> <code>Table.jsx</code> is imported by nothing.</>],
        ]}
      />

      <Box kind="note" title="Duplicate implementations">
        <p>
          <code>Button.jsx</code> + <code>Button.tsx</code>, <code>Select.jsx</code> + <code>Select.tsx</code>,
          and a <code>Table.jsx</code> with no importers. Check which file you are actually editing — the
          extension is easy to miss and the wrong one has no effect.
        </p>
      </Box>

      <h2>Where the real components live</h2>

      <p>
        Organised <strong>by domain, not by type</strong>. There is no <code>containers/</code> or{' '}
        <code>views/</code>. This is the convention that actually holds:
      </p>

      <Table
        head={['Folder', 'Components', 'Note']}
        rows={[
          [<code>drce</code>, '43', <>The report designer — editor, canvas, sections, hooks. The most cohesive component subsystem in DRAIS.</>],
          [<code>students</code>, '36', <>Modals extracted from the learner list: QuickEdit, Import, BulkSms, photo upload.</>],
          [<code>academics</code>, '25', '—'],
          [<code>ui</code>, '24', <>The primitives above.</>],
          [<code>dashboard</code>, '23', '—'],
          [<code>attendance</code>, '18', '—'],
          [<code>tahfiz</code>, '15', '—'],
          [<code>layout</code>, '14', <>The shell: sidebar, navbar, MainLayout.</>],
          [<code>finance</code>, '13', '—'],
        ]}
      />

      <h2>The practical rule</h2>

      <Box kind="invariant" title="Match your neighbours first">
        <p>
          A component&apos;s job is to look and behave like the screen it sits in. In a codebase with 6%
          design-system adoption, importing <code>Button</code> into a screen where every other control is
          inline Tailwind produces a control that looks subtly wrong — which is worse than the inconsistency
          you were trying to fix.
        </p>
      </Box>

      <p>So, in order:</p>

      <ol>
        <li><strong>Is there a primitive with real adoption?</strong> <code>Pagination</code>, <code>Modal</code>, <code>Toast</code> — use it.</li>
        <li><strong>Does the surrounding screen already use a pattern?</strong> Follow it exactly.</li>
        <li><strong>Otherwise</strong> write it inline in the domain folder, matching neighbouring styling.</li>
      </ol>

      <h2>When to extract a component</h2>

      <Table
        head={['Signal', 'Action']}
        rows={[
          [<>Used in <strong>3+</strong> unrelated places</>, <>Extract to the domain folder. Below three, a local function is clearer.</>],
          [<>A modal of any size</>, <><strong>Extract immediately.</strong> This is the single biggest factor in whether a page stays readable — it is why the learner list is 3,155 lines and not 8,000.</>],
          [<>Genuinely generic and used by 3+ <em>domains</em></>, <>Promote to <code>ui/</code>. Rare, and it should be.</>],
          [<>Used once, however long</>, <>Leave it in the page. Premature extraction spreads one screen across four files.</>],
        ]}
      />

      <h2>Non-negotiables for any component</h2>

      <Box kind="invariant">
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>
            <strong>Both themes.</strong> Every surface, border and text colour needs its <code>dark:</code>{' '}
            variant. A component with no <code>dark:</code> classes is broken, not neutral — it is invisible or
            unreadable for half the users.
          </li>
          <li>
            <strong>Both languages.</strong> <code>t(&apos;key&apos;, &apos;English fallback&apos;)</code>, with
            the key added to <strong>both</strong> <code>en.json</code> and <code>ar.json</code>. Never hardcode
            Arabic; never ship Arabic-only.
          </li>
          <li>
            <strong>RTL-safe.</strong> Arabic means right-to-left. Avoid hardcoded <code>left</code>/
            <code>right</code> where a logical property will do.
          </li>
          <li>
            <strong>Narrow viewports.</strong> Staff use phones at the gate.
          </li>
        </ol>
      </Box>

      <h2>Components with real architectural weight</h2>

      <Table
        head={['Component', 'Why it is special']}
        rows={[
          [
            <>DRCE renderer + editor (<code>components/drce/</code>)</>,
            <>Bound by <code>RENDER_LAYERS.md</code>. The render path must stay pure — no I/O, no <code>Date.now()</code>. Section types register a descriptor rather than adding a renderer branch.</>,
          ],
          [
            <>Shell (<code>components/layout/</code>)</>,
            <>Wraps every staff route. Anything mounted here appears everywhere — including, if you get the branch wrong, inside printed report cards.</>,
          ],
          [
            <><code>LiveIdentityPopup</code></>,
            <>Mounted globally at the shell. Poll-bound, not push-bound — the event bus does not cross serverless instances.</>,
          ],
          [
            <><code>ImpersonationBanner</code></>,
            <>Must remain visible during an impersonated session. It is part of the accountability story, not decoration.</>,
          ],
          [
            <><code>ProgressOverlay</code></>,
            <>Backed by <code>ProgressContext</code>. Long operations must emit through it — silent long operations are treated as a defect.</>,
          ],
        ]}
      />

      <h2>If you want to improve this</h2>

      <p>
        Raising design-system adoption from 6% is a legitimate project, but it is a <strong>project</strong>,
        not something to do incidentally in a feature branch. Half-migrating makes the codebase less consistent
        than either end state.
      </p>

      <p>The cheap, safe wins, in order:</p>

      <ol>
        <li>Delete <code>Table.jsx</code> — nothing imports it.</li>
        <li>Resolve the <code>.jsx</code>/<code>.tsx</code> duplicates for <code>Button</code> and <code>Select</code>.</li>
        <li>Pick <em>one</em> of <code>Modal</code> / <code>EnhancedModal</code> and note which in this page.</li>
        <li>Then, if there is appetite, migrate one domain folder at a time — never partially.</li>
      </ol>

      <Source path="src/components/ui/">The primitives and their index barrel.</Source>
      <Source path="src/lib/drce/RENDER_LAYERS.md">Binding for anything under components/drce.</Source>

      <SeeAlso slugs={['frontend', 'playbook-page', 'blueprint-students-list', 'module-reports']} />
    </ControlDoc>
  );
}
