'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso } from '../ControlDoc';
import { LessonIntro, Concept, Evolution, Exercise, SelfCheck } from '../Lesson';

export default function Page() {
  return (
    <ControlDoc slug="learn-tsx">
      <LessonIntro
        level="Foundation"
        prereqs="TypeScript, taught from DRAIS — at least the interface and generics sections."
        teaches={['JSX', 'TSX', 'props typing', 'forwardRef', 'VariantProps', 'compile vs runtime', 'React.ButtonHTMLAttributes']}
        outcome={<>Explain what each of the four layers adds, read a typed component, and say precisely which production bugs the compiler is preventing.</>}
      />

      <p>
        DRAIS contains the perfect worked example for this lesson: <strong>two implementations of the same
        Button, side by side in the same folder</strong> — one plain JavaScript, one TypeScript. Everything
        below compares real files.
      </p>

      <Source path="src/components/ui/Button.jsx">31 lines. Plain JavaScript.</Source>
      <Source path="src/components/ui/Button.tsx">57 lines. TypeScript.</Source>

      <h2>The four layers</h2>

      <Diagram caption="Each layer adds one thing. None replaces the one below it.">
{`  JS      the language the browser runs
   │
   +  JSX  ── syntax for describing UI. Compiles AWAY to function calls.
   │
   +  TS   ── static types. Erased entirely at build. Zero runtime cost.
   │
   =  TSX  ── JSX with types checked

  What ships to the browser is still JavaScript. Always.`}
      </Diagram>

      <Concept name="JSX is not HTML">
        <p>It is syntax sugar. This:</p>
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px]">{`<button onClick={onClick} className="px-4">{children}</button>`}</pre>
        <p>compiles to roughly:</p>
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px]">{`jsx('button', { onClick, className: 'px-4', children })`}</pre>
        <p>
          Three consequences that explain most beginner confusion: it is <code>className</code> not{' '}
          <code>class</code> (<code>class</code> is a reserved word in JavaScript); <code>{'{}'}</code> means
          &quot;evaluate this expression&quot;; and a component must be capitalised, because a lowercase name
          compiles to the string <code>&apos;button&apos;</code> while a capitalised one compiles to the
          variable.
        </p>
      </Concept>

      <Concept name="Types are erased">
        <p>
          TypeScript is not a runtime. Every annotation is deleted at build time — <code>Button.tsx</code> and
          a JavaScript version emit essentially the same code.
        </p>
        <p>
          <strong>So types never validate data at runtime.</strong> An API response typed as{' '}
          <code>Student[]</code> is a <em>claim</em>, not a check. If the route returns something else, the
          type is simply wrong and nothing notices — which is exactly why boundaries take{' '}
          <code>unknown</code> and use a type guard.
        </p>
      </Concept>

      <h2>The same component, both ways</h2>

      <p><strong>The JavaScript version</strong> — the whole signature:</p>

      <pre><code>{`const Button = ({ children, onClick, variant = 'primary', icon, loading, ...props }) => {
  const variants = {
    primary:   'bg-indigo-600 text-white hover:bg-indigo-700 …',
    secondary: 'bg-gray-100 text-gray-700 …',
    danger:    'bg-red-600 text-white …',
  };
  return (
    <button className={clsx(baseStyles, variants[variant], …)} {...props}>
      …
    </button>
  );
};`}</code></pre>

      <p><strong>The TypeScript version</strong> — the part that differs:</p>

      <pre><code>{`export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    …
  }
);`}</code></pre>

      <h2>What the compiler catches here</h2>

      <p>Four bugs the JavaScript version accepts silently:</p>

      <Table
        head={['Written', 'JavaScript', 'TypeScript']}
        rows={[
          [
            <code>{'<Button variant="primaryy">'}</code>,
            <><code>variants[&apos;primaryy&apos;]</code> is <code>undefined</code>. <code>clsx</code> skips it. <strong>An unstyled button ships.</strong></>,
            <>Compile error — <code>variant</code> is a union of the defined keys.</>,
          ],
          [
            <code>{'<Button onClick="save">'}</code>,
            <>Accepted. Fails when clicked.</>,
            <>Compile error — <code>onClick</code> must be a handler.</>,
          ],
          [
            <code>{'<Button disabled>'}</code>,
            <>Works by accident via <code>{'{...props}'}</code>, with nothing documenting it.</>,
            <>Known and checked — <code>ButtonHTMLAttributes</code> declares it.</>,
          ],
          [
            <code>{'<Button href="/x">'}</code>,
            <>Spread onto a <code>&lt;button&gt;</code>. React warns at runtime; the attribute does nothing.</>,
            <>Compile error — buttons have no <code>href</code>.</>,
          ],
        ]}
      />

      <Box kind="invariant" title="The first row is the one that matters">
        <p>
          A typo in a variant name produces a button with <strong>no styling at all</strong> and no error
          anywhere — not in the console, not in a test that only checks the button renders. It reaches a
          school, and someone reports &quot;the save button looks broken on one page&quot;.
        </p>
        <p>
          That is the class of bug TypeScript exists to remove: not crashes, which you find, but{' '}
          <strong>silent wrongness</strong>, which you do not.
        </p>
      </Box>

      <Concept name="React.ButtonHTMLAttributes<HTMLButtonElement>" from="Button.tsx">
        <p>
          Inherits <em>every</em> valid button attribute — <code>disabled</code>, <code>type</code>,{' '}
          <code>form</code>, <code>aria-*</code>, all handlers — without listing them.
        </p>
        <p>
          The JS version achieves the same reach with <code>{'{...props}'}</code>, but with no idea what is
          legal. The typed version gets the same flexibility <em>and</em> rejects <code>href</code>.
        </p>
      </Concept>

      <Concept name="VariantProps<typeof buttonVariants>" from="Button.tsx">
        <p>
          <code>cva</code> defines the variants; <code>VariantProps</code> <strong>derives the prop type from
          that definition</strong>. Add a <code>size</code> and the prop type updates itself.
        </p>
        <p>
          Same principle as <code>PlatformScope</code> being derived from <code>PLATFORM_SCOPES</code>: one
          source, no hand-maintained duplicate to drift.
        </p>
      </Concept>

      <Concept name="forwardRef<HTMLButtonElement, ButtonProps>" from="Button.tsx">
        <p>
          Lets a parent hold a ref to the underlying DOM node — needed for focus management, tooltips and
          popover anchoring. Without it a parent cannot focus the button programmatically, which matters for
          accessibility.
        </p>
        <p>The two parameters are <em>what the ref points at</em> and <em>what the props are</em>, in that order.</p>
      </Concept>

      <h2>The other difference: colour</h2>

      <p>Look again at the two variant tables.</p>

      <Evolution
        stages={[
          {
            verdict: 'bad',
            label: 'Button.jsx — hardcoded palette',
            code: `primary: 'bg-indigo-600 text-white hover:bg-indigo-700 …'`,
            why: <>Ignores dark mode, ignores school branding, ignores the user&apos;s personal colour. Three features broken by one literal. A school whose brand is green gets an indigo primary button.</>,
          },
          {
            verdict: 'best',
            label: 'Button.tsx — semantic tokens',
            code: `default: 'bg-primary text-primary-foreground hover:bg-primary/90'`,
            why: <>Follows the token cascade, so it is correct in light and dark, and under both school and personal branding, with no extra work. Note the <code>-foreground</code> pairing — that is what keeps contrast when a school picks a dark brand colour.</>,
          },
        ]}
      />

      <Box kind="warning" title="A real bug this lesson surfaced">
        <p>
          <code>Button.tsx</code> also uses <code>bg-destructive</code>,{' '}
          <code>text-destructive-foreground</code> and <code>ring-offset-background</code>. DRAIS defines{' '}
          <code>--danger</code>, <code>--warning</code>, <code>--success</code> and <code>--info</code> —
          there is <strong>no <code>--destructive</code> token</strong>, and no{' '}
          <code>--color-destructive</code> in the <code>@theme</code> block.
        </p>
        <p>
          So the destructive variant resolves to <strong>no background colour at all</strong>. The same
          shadcn-default names appear in <code>Input.tsx</code>, <code>Badge.tsx</code>,{' '}
          <code>Select.tsx</code> and <code>students/list/page.tsx</code>.
        </p>
        <p>
          <strong>TypeScript cannot catch this.</strong> Class names are strings; the compiler has no view into
          CSS. It is a good illustration of where type safety ends — and why the theming lesson insists on
          tokens that actually exist.
        </p>
      </Box>

      <h2>What TypeScript does not do</h2>

      <ul>
        <li><strong>Validate runtime data.</strong> Types are erased. Guard at boundaries.</li>
        <li><strong>Check CSS class names.</strong> As above.</li>
        <li><strong>Check SQL.</strong> A query string is a string; a wrong column name fails at runtime.</li>
        <li><strong>Prevent logic errors.</strong> A correctly typed wrong calculation still compiles.</li>
        <li><strong>Survive <code>any</code> or <code>as</code>.</strong> Both switch checking off exactly where you asserted you knew better.</li>
      </ul>

      <Exercise
        n={1}
        title="Fix the destructive token gap"
        objective={<>Decide whether to add <code>--destructive</code> tokens to <code>globals.css</code> or to change the five files to use the existing <code>--danger</code>. Implement one, and justify it.</>}
        hints={<>Check which is used more widely across the app, and remember the <code>@theme</code> block must map any new token to a <code>--color-*</code> for the utility to exist. Both light and dark need values.</>}
        mistakes={
          <ul className="list-disc pl-5 space-y-1">
            <li>Adding <code>--destructive</code> to <code>:root</code> only. Dark mode then has no value.</li>
            <li>Adding the raw token but forgetting the <code>@theme</code> mapping — <code>bg-destructive</code> still will not exist.</li>
            <li>Changing the class names but not checking the <code>-foreground</code> pair.</li>
          </ul>
        }
        solution={<p>Prefer aliasing to <code>danger</code>: DRAIS already has a named status set, and a second name for the same concept guarantees future drift. Whichever you choose, verify in both themes — a token that resolves to nothing looks fine on a page whose background happens to match.</p>}
      />

      <Exercise
        n={2}
        title="Convert a .jsx file to .tsx"
        objective={<>Take <code>src/components/ui/Select.jsx</code> (or <code>Table.jsx</code>, which has zero importers) and convert it. Type the props properly rather than reaching for <code>any</code>.</>}
        hints={<>Extend the matching <code>React.*HTMLAttributes</code> for the underlying element. Derive variant props rather than hand-listing them.</>}
        mistakes={<>Typing props as <code>any</code> to make the build pass. That produces a file with the cost of TypeScript and none of the benefit.</>}
      />

      <SelfCheck
        questions={[
          {
            q: <>If types are erased at build time, what exactly are they buying?</>,
            a: <p>Compile-time prevention of a class of bug that does not crash — a mistyped variant, a prop that silently does nothing, a field that is <code>undefined</code> on one branch of a union. Crashes get found; silent wrongness reaches production.</p>,
          },
          {
            q: <><code>&lt;Button variant=&quot;primaryy&quot;&gt;</code> — trace both versions.</>,
            a: <p>JS: <code>variants[&apos;primaryy&apos;]</code> is <code>undefined</code>, <code>clsx</code> skips it, an unstyled button ships with no error. TS: compile error, because <code>variant</code> is a union of defined keys.</p>,
          },
          {
            q: <>Why derive props with <code>VariantProps</code> instead of writing the interface out?</>,
            a: <p>One source of truth. A hand-written duplicate drifts from the <code>cva</code> definition, and the drift shows up as a variant that type-checks but has no styles.</p>,
          },
          {
            q: <>Name three things TypeScript will not catch in a DRAIS component.</>,
            a: <p>A non-existent CSS class (<code>bg-destructive</code>), a wrong SQL column name, and any logic error. Also anything downstream of an <code>any</code> or an <code>as</code>.</p>,
          },
          {
            q: <>Which Button should you copy for a new component?</>,
            a: <p>Neither wholesale. Take the typing approach from <code>Button.tsx</code> and its semantic tokens — but match the styling conventions of the screen you are working in, since design-system adoption across the codebase is only about 6%.</p>,
          },
        ]}
      />

      <SeeAlso slugs={['learn-typescript', 'theming', 'components', 'learn-patterns']} />
    </ControlDoc>
  );
}
