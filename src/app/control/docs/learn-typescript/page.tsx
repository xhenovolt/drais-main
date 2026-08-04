'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';
import { LessonIntro, Concept, Evolution, Exercise, SelfCheck } from '../Lesson';

export default function Page() {
  return (
    <ControlDoc slug="learn-typescript">
      <LessonIntro
        level="Foundation"
        teaches={['interface', 'type', 'union', 'discriminated union', 'branded type', 'type guard', 'generics', 'Record', 'Partial', 'Omit', 'unknown', 'as const']}
        outcome={<>Read any type in DRAIS, know why it was written that way, and add your own without weakening the guarantees around it.</>}
        prereqs="Any programming language. No TypeScript needed."
      />

      <p>
        Every example below is <strong>real code from this repository</strong>, cited with its path. Nothing is
        invented, because the point is not to learn TypeScript in the abstract — it is to read DRAIS.
      </p>

      <h2>1. Why types at all: a real ±3-hour bug</h2>

      <p>Start with the strongest case in the codebase. A biometric device reports a punch as a bare string:</p>

      <pre><code>{`"2026-07-17 08:19:33"`}</code></pre>

      <p>
        No timezone. Just what the clock on the wall said. Different parts of DRAIS used to wrap that in a
        JavaScript <code>Date</code> under different assumptions — server-local in one path, wall-as-UTC in
        another, real-UTC after a third — then serialise it back with mismatched formatters.
      </p>

      <Box kind="warning" title="The result: silent ±3h shifts whose direction depended on the host server's timezone">
        <p>
          Attendance filed against the wrong hour, and sometimes the wrong day. Nothing threw. Nothing logged.
          It was found by a forensic audit, not by a test — and the same deployment behaved differently
          depending on where it ran.
        </p>
      </Box>

      <p>The fix was a type:</p>

      <pre><code>{`/** "YYYY-MM-DD HH:mm:ss" — a device's local wall clock, no timezone. */
export type DeviceWallTime = string & { readonly __brand?: 'DeviceWallTime' };`}</code></pre>

      <Source path="src/lib/attendance/acquisition/wall-time.ts" />

      <Concept name="Branded type" from="wall-time.ts">
        <p>
          At runtime this is <em>just a string</em>. <code>string &amp; {'{ __brand?: ... }'}</code> adds a
          phantom property that only exists at compile time, so TypeScript treats{' '}
          <code>DeviceWallTime</code> as distinct from <code>string</code> — while the JavaScript that ships is
          unchanged, with zero runtime cost.
        </p>
        <p>
          <strong>Why here:</strong> a plain <code>string</code> parameter accepts any string, including an ISO
          timestamp that has already been converted. The brand makes &quot;this string is a device wall clock,
          not an instant&quot; a fact the compiler enforces.
        </p>
        <p>
          <strong>When not to:</strong> most strings. Reach for a brand only when two strings of the same shape
          mean genuinely different things and mixing them is costly — which is exactly the case that produced
          RC-1.
        </p>
      </Concept>

      <p>Paired with a runtime check:</p>

      <pre><code>{`export function isDeviceWallTime(s: unknown): s is DeviceWallTime {
  if (typeof s !== 'string') return false;
  const m = WALL_RE.exec(s);
  if (!m) return false;
  const [, , mo, d, h, mi, se] = m.map(Number) as unknown as number[];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h <= 23 && mi <= 59 && se <= 59;
}`}</code></pre>

      <Concept name="Type guard — the `is` return type" from="wall-time.ts">
        <p>
          <code>s is DeviceWallTime</code> is a <strong>type predicate</strong>. It tells the compiler: if this
          function returns <code>true</code>, treat the argument as that type from here on.
        </p>
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px]">{`function handle(raw: unknown) {
  if (!isDeviceWallTime(raw)) return;   // raw is still unknown
  wallToUtc(raw, offset);               // ✅ raw is DeviceWallTime here
}`}</pre>
        <p>
          <strong>This is the bridge between runtime and compile time.</strong> Data arriving from a device, a
          request body or the database is genuinely <code>unknown</code> — the compiler cannot know its shape.
          A guard is how you check once and gain type safety everywhere after.
        </p>
      </Concept>

      <Concept name="`unknown` vs `any`" from="wall-time.ts">
        <p>
          Note the parameter is <code>unknown</code>, not <code>any</code>. The difference is the whole point:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><code>any</code> — &quot;stop checking&quot;. You may call anything on it; the compiler will not object, and you find out at runtime.</li>
          <li><code>unknown</code> — &quot;we do not know yet&quot;. You must narrow it before use.</li>
        </ul>
        <p>
          <strong>Use <code>unknown</code> at every boundary</strong> where data enters the system. Using{' '}
          <code>any</code> there is how a device sends a malformed payload and a route handler throws three
          layers deeper with an unhelpful message.
        </p>
      </Concept>

      <h2>2. interface vs type</h2>

      <p>DRAIS uses both, and the choice is not arbitrary. Real examples:</p>

      <pre><code>{`// src/lib/drce/schema.ts
export interface DRCEPageBorder { … }
export interface DRCETheme { … }

// src/lib/attendance/acquisition/wall-time.ts
export type DeviceWallTime = string & { readonly __brand?: 'DeviceWallTime' };

// src/lib/drce/schema.ts
export type DRCESectionType = 'header' | 'banner' | 'results_table' | …;`}</code></pre>

      <Concept name="interface vs type">
        <Table
          head={['', 'interface', 'type']}
          rows={[
            ['Describes', 'The shape of an object', 'Any type at all'],
            ['Unions', <>Cannot</>, <><strong>Can</strong> — <code>&apos;a&apos; | &apos;b&apos;</code></>],
            ['Primitives', <>Cannot</>, <><strong>Can</strong> — including branded strings</>],
            ['Declaration merging', <><strong>Yes</strong> — two declarations combine</>, <>No — a duplicate is an error</>],
            ['Extending', <><code>extends</code></>, <>Intersection <code>&amp;</code></>],
          ]}
        />
        <p>
          <strong>The DRAIS rule, visible in the code:</strong> an object shape is an{' '}
          <code>interface</code>; anything that is a union, a primitive or a brand is a <code>type</code>.
          Since most unions here are unions of object shapes, <code>type</code> is what you see at the top of{' '}
          <code>schema.ts</code>.
        </p>
        <p>
          <strong>Where declaration merging hurts:</strong> it is a feature for augmenting library types, and a
          hazard in your own. Two <code>interface Student</code> declarations in different files silently
          merge instead of erroring — so a typo creates a partially-typed object rather than a compile failure.
          For closed domain models, <code>type</code> fails louder.
        </p>
      </Concept>

      <h2>3. The pattern that carries DRCE: discriminated unions</h2>

      <p>A DRCE document contains shapes. There are eight kinds, each with different fields:</p>

      <pre><code>{`export type DRCEShape =
  | DRCERectShape
  | DRCEEllipseShape
  | DRCELineShape
  | DRCETextShape
  | DRCEPolygonShape
  | DRCEPathShape
  | DRCEImageShape
  | DRCEQRCodeShape;`}</code></pre>

      <Source path="src/lib/drce/schema.ts" />

      <Concept name="Discriminated union" from="schema.ts">
        <p>
          Each member carries a literal <code>type</code> field — the <strong>discriminant</strong>. Switching
          on it narrows the union to exactly one member:
        </p>
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px]">{`switch (shape.type) {
  case 'rect':   shape.width;   break;  // ✅ narrowed to DRCERectShape
  case 'qrcode': shape.value;   break;  // ✅ narrowed to DRCEQRCodeShape
  case 'rect':   shape.value;           // ❌ compile error — rects have no value
}`}</pre>
        <p>
          <strong>Why DRAIS relies on it:</strong> the alternative is one big interface with every field
          optional. Then <code>shape.value</code> compiles for a rectangle, is <code>undefined</code> at
          runtime, and renders a blank box on a printed report card that nobody notices until a parent asks.
        </p>
        <p>
          <strong>The real payoff is exhaustiveness.</strong> Add a ninth shape and every <code>switch</code>{' '}
          missing a case becomes a compile error. The compiler hands you the list of places to update — which
          is why the union is called <em>closed</em> in the DRCE README, and why that closedness is treated as
          a feature rather than a limitation.
        </p>
      </Concept>

      <Box kind="tip" title="The exhaustiveness trick">
        <p>Add a <code>default</code> that assigns to <code>never</code>:</p>
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px] mt-2">{`default: {
  const _exhaustive: never = shape;   // ❌ errors if a case is unhandled
  throw new Error(\`Unhandled shape: \${(shape as { type: string }).type}\`);
}`}</pre>
        <p className="mt-2">
          <code>never</code> is the type with no values. Anything still assignable to it means the union was not
          fully covered — so the compiler reports the omission at the place you forgot.
        </p>
      </Box>

      <h2>4. Generics</h2>

      <p>Three real signatures from the codebase:</p>

      <pre><code>{`export function safeArray<T>(value: any): T[]

export function withDisplayName<T extends Record<string, unknown>>(…)

export function assertDefined<T>(
  value: any, fieldName: string, logger: ReturnType<typeof scopedLogger>
): value is T`}</code></pre>

      <Concept name="Generics — `<T>`" from="src/lib/safety.ts, src/lib/i18n/localize.ts">
        <p>
          A generic is a <strong>type parameter</strong>: the function works for many types while preserving
          which one the caller used.
        </p>
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px]">{`const rows = safeArray<Student>(json);   // rows: Student[]  — not any[]`}</pre>
        <p>
          Without it, <code>safeArray</code> returns <code>any[]</code> and every downstream access is
          unchecked. The generic keeps the caller&apos;s knowledge alive through the call.
        </p>
        <p>
          <strong><code>extends</code> constrains it.</strong> <code>T extends Record&lt;string, unknown&gt;</code>{' '}
          means &quot;any object&quot; — so <code>withDisplayName</code> can safely add a property, and a
          caller passing a number is rejected.
        </p>
      </Concept>

      <Concept name="ReturnType&lt;typeof fn&gt;" from="src/lib/safety.ts">
        <p>
          <code>logger: ReturnType&lt;typeof scopedLogger&gt;</code> says &quot;whatever{' '}
          <code>scopedLogger</code> returns&quot;.
        </p>
        <p>
          <strong>Why this rather than naming the type:</strong> it cannot drift. Change{' '}
          <code>scopedLogger</code>&apos;s return shape and every consumer updates automatically. A hand-written
          duplicate interface would silently diverge.
        </p>
        <p>
          <code>typeof</code> in a <em>type</em> position means &quot;the type of that value&quot; — unrelated
          to the JavaScript <code>typeof</code> operator, which is a common early confusion.
        </p>
      </Concept>

      <h2>5. Utility types</h2>

      <p>Measured usage in this codebase — this is what you will actually meet:</p>

      <Table
        head={['Utility', 'Uses in DRAIS', 'Means']}
        rows={[
          [<code>Record&lt;K, V&gt;</code>, <strong>397</strong>, <>An object with keys <code>K</code> and values <code>V</code>. By far the most common.</>],
          [<code>Partial&lt;T&gt;</code>, '113', <>Every property optional. Patch and update payloads.</>],
          [<code>Omit&lt;T, K&gt;</code>, '47', <>All of <code>T</code> except <code>K</code>.</>],
          [<code>ReturnType&lt;F&gt;</code>, '16', <>What a function returns.</>],
          [<code>Awaited&lt;T&gt;</code>, '6', <>The value inside a <code>Promise</code>.</>],
          [<code>Pick&lt;T, K&gt;</code>, '3', <>Only the named properties.</>],
          [<code>Readonly&lt;T&gt;</code>, '1', <>No reassignment. Rare here — DRAIS prefers not mutating in the first place.</>],
        ]}
      />

      <p>A real one from the backup subsystem:</p>

      <pre><code>{`export async function listPlatformKeys(): Promise<Array<Omit<PlatformKeyRow, 'secret_hash'>>>`}</code></pre>

      <Concept name="Omit as a security boundary" from="src/lib/platform/keys.ts">
        <p>
          That signature makes it a <strong>compile error</strong> to return the secret hash from the listing
          function. The rule &quot;never expose the hash&quot; stops being a code-review convention and becomes
          something the build enforces.
        </p>
        <p>
          This is the highest-value use of utility types: encoding a rule you would otherwise have to remember.
        </p>
      </Concept>

      <h2>6. `as const`</h2>

      <pre><code>{`export const PLATFORM_SCOPES = [
  'schools:read', 'schools:write', 'subscriptions:read', …
] as const;

export type PlatformScope = (typeof PLATFORM_SCOPES)[number];`}</code></pre>

      <Concept name="const assertion + indexed access" from="src/lib/platform/scopes.ts">
        <p>
          Without <code>as const</code>, TypeScript infers <code>string[]</code> and every scope string is
          interchangeable. With it, the array is a readonly tuple of <em>literals</em>.
        </p>
        <p>
          <code>(typeof PLATFORM_SCOPES)[number]</code> then extracts the union of those literals — so{' '}
          <code>PlatformScope</code> is exactly <code>&apos;schools:read&apos; | &apos;schools:write&apos; | …</code>,
          derived from the array rather than typed out twice.
        </p>
        <p>
          <strong>Why it matters here:</strong> one list to maintain. Add a scope to the array and the type
          updates; a typo at a call site fails to compile. Two hand-maintained lists would drift, and a drifted
          scope on a frozen public API is a contract break.
        </p>
      </Concept>

      <h2>7. Typing the same problem three ways</h2>

      <p>The editor's undo/redo actions — the real type is the third form:</p>

      <Evolution
        stages={[
          {
            verdict: 'bad',
            label: 'Untyped action object',
            code: `function reducer(state, action) {
  if (action.type === 'MUTATE') return applyMutation(state, action.mutation);
  if (action.type === 'UNDU')   return undo(state);   // typo — never runs
}`,
            why: <>No compiler help at all. The typo compiles, the branch silently never executes, and undo appears to do nothing intermittently. Nothing tells you which fields each action carries.</>,
          },
          {
            verdict: 'better',
            label: 'One interface with optional fields',
            code: `interface EditorAction {
  type: 'MUTATE' | 'UNDO' | 'REDO' | 'SAVE_MARK' | 'RESET';
  mutation?: DRCEMutation;
  document?: DRCEDocument;
  now?: number;
}`,
            why: <>The typo is now caught. But every field is optional on every action, so <code>action.mutation</code> compiles inside the <code>UNDO</code> branch and is <code>undefined</code> at runtime — and you must write <code>action.mutation!</code> to satisfy the compiler, which discards the very check you added.</>,
          },
          {
            verdict: 'best',
            label: 'Discriminated union — the real DRAIS type',
            code: `type EditorAction =
  | { type: 'MUTATE';  mutation: DRCEMutation; now: number }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SAVE_MARK' }
  | { type: 'RESET';   document: DRCEDocument };`,
            why: <>Each action carries exactly its own fields, and they are <strong>required</strong>. Inside <code>case &apos;MUTATE&apos;</code>, <code>action.mutation</code> exists and is non-optional; in <code>case &apos;UNDO&apos;</code> it does not exist at all. No <code>!</code>, no optional chaining, and adding an action forces every reducer to handle it. <span className="text-slate-500">— src/components/drce/editor/useDRCEEditor.ts</span></>,
          },
        ]}
      />

      <Exercise
        n={1}
        title="Add a shape type to DRCE"
        objective={<>Add a <code>DRCEStarShape</code> to the <code>DRCEShape</code> union in <code>src/lib/drce/schema.ts</code>, then run <code>npm run build</code> <strong>before</strong> writing any rendering code.</>}
        hints={<>Follow <code>DRCERectShape</code> as the model. Give it a literal <code>type: &apos;star&apos;</code> discriminant and at least one field the others lack.</>}
        mistakes={
          <ul className="list-disc pl-5 space-y-1">
            <li>Making the discriminant <code>string</code> instead of the literal <code>&apos;star&apos;</code> — narrowing then stops working entirely.</li>
            <li>Marking new fields optional &quot;to be safe&quot;. That reintroduces the <em>better</em> stage above.</li>
            <li>Fixing the compile errors by casting. The errors are the feature.</li>
          </ul>
        }
        solution={<><p>The build fails at every <code>switch (shape.type)</code> that does not handle <code>&apos;star&apos;</code>. <strong>That list is the answer</strong> — it is precisely the set of files a new shape must touch, and you did not have to find it by grepping. Work through it, then register the renderer per the DRCE README.</p></>}
      />

      <Exercise
        n={2}
        title="Make a rule compiler-enforced"
        objective={<>Find a function returning a row that includes a field a caller should never see, and use <code>Omit</code> to make exposing it a compile error — as <code>listPlatformKeys</code> does with <code>secret_hash</code>.</>}
        hints={<>Good candidates: anything returning a user or session row. Ask &quot;what is in here that must not reach a client?&quot;</>}
        mistakes={<>Deleting the field from the interface entirely — other code legitimately needs it. <code>Omit</code> narrows one <em>return path</em>, not the model.</>}
      />

      <SelfCheck
        questions={[
          {
            q: <>Why is <code>DeviceWallTime</code> a branded type rather than a plain <code>string</code>?</>,
            a: <p>Because a device wall clock and an ISO instant are both strings but mean different things, and mixing them caused silent ±3h shifts that varied by host timezone. The brand costs nothing at runtime and makes the distinction one the compiler enforces.</p>,
          },
          {
            q: <>A colleague suggests replacing the <code>DRCEShape</code> union with one interface where all fields are optional, to &quot;reduce duplication&quot;. What do you say?</>,
            a: <p>It removes exhaustiveness checking and lets <code>shape.value</code> compile for a rectangle, yielding <code>undefined</code> at render and a blank element on a printed report card. It also means adding a shape no longer tells you which switches to update — you find them by grepping, and miss one.</p>,
          },
          {
            q: <>When is <code>any</code> acceptable at a system boundary?</>,
            a: <p>Effectively never. Use <code>unknown</code> and a type guard. <code>any</code> disables checking exactly where the data is least trustworthy — device payloads, request bodies, database rows.</p>,
          },
          {
            q: <>Why derive <code>PlatformScope</code> from the array instead of writing the union out?</>,
            a: <p>One list to maintain. Two hand-written lists drift, and a drifted scope on a frozen public API is a contract break — the exact class of change ADR-0011 forbids.</p>,
          },
          {
            q: <>What does <code>ReturnType&lt;typeof scopedLogger&gt;</code> buy over naming the type?</>,
            a: <p>It cannot go stale. Change the function&apos;s return shape and every consumer follows automatically, rather than diverging from a hand-written duplicate.</p>,
          },
        ]}
      />

      <Source path="src/lib/attendance/acquisition/wall-time.ts">Branded type, guard, and the incident that produced them.</Source>
      <Source path="src/lib/drce/schema.ts">The largest discriminated unions in the codebase.</Source>
      <Source path="src/lib/safety.ts">Generics and assertion helpers.</Source>

      <SeeAlso slugs={['learn-tsx', 'learn-patterns', 'module-reports', 'module-attendance']} />
    </ControlDoc>
  );
}
