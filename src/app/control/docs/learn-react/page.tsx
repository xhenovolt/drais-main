'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';
import { LessonIntro, Concept, Evolution, Exercise, SelfCheck } from '../Lesson';

export default function Page() {
  return (
    <ControlDoc slug="learn-react">
      <LessonIntro
        level="Foundation"
        prereqs="JavaScript: functions, objects, arrays, .map, destructuring, template literals. No React."
        teaches={['component', 'props', 'default props', 'state', 'render', 'conditional rendering', 'lists', 'key', 'events', 'children']}
        outcome={<>Read any DRAIS component and say what it receives, what it decides, and what it renders — then write one.</>}
      />

      <p>
        We will read <strong>one real component, all 73 lines of it</strong>, and stop at every concept. It is{' '}
        <code>ClockHealthBadges</code> — the chips on the dashboard showing whether each device&apos;s clock can
        be trusted.
      </p>

      <Source path="src/components/attendance/ClockHealthBadges.tsx">Open it now and keep it beside this page.</Source>

      <h2>What a component is</h2>

      <pre><code>{`export default function ClockHealthBadges({ quiet = false }: { quiet?: boolean }) {
  …
  return (
    <div className="flex items-center gap-2 flex-wrap"> … </div>
  );
}`}</code></pre>

      <Concept name="Component" from="ClockHealthBadges.tsx">
        <p>
          A component is <strong>a function that returns UI</strong>. That is the whole idea. It takes an
          object of inputs and returns a description of what should appear.
        </p>
        <p>
          React calls it. You never call it yourself — you write{' '}
          <code>{'<ClockHealthBadges />'}</code> and React invokes the function.
        </p>
        <p>
          <strong>Capitalisation is load-bearing.</strong> <code>{'<div>'}</code> compiles to the string{' '}
          <code>&apos;div&apos;</code> (an HTML element); <code>{'<ClockHealthBadges>'}</code> compiles to the
          variable. A lowercase component name silently becomes an unknown HTML tag that renders nothing.
        </p>
      </Concept>

      <Concept name="Props, and a default" from="ClockHealthBadges.tsx">
        <p>
          <code>{'{ quiet = false }'}</code> is ordinary JavaScript destructuring with a default value. React
          passes <strong>one object</strong>; you pull the fields you want out of it.
        </p>
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px]">{`<ClockHealthBadges />              // quiet === false
<ClockHealthBadges quiet />        // quiet === true  (bare attribute = true)
<ClockHealthBadges quiet={isDash} /> // quiet === whatever isDash is`}</pre>
        <p>
          <strong>Props are read-only.</strong> Assigning to <code>quiet</code> inside the component is a bug:
          the parent owns that value, and React will overwrite it on the next render. Data flows down.
        </p>
      </Concept>

      <h2>Where the data comes from</h2>

      <pre><code>{`const { data } = useSWR<any>('/api/attendance/time-health?banner=1', fetcher, {
  refreshInterval: 5 * 60_000,
  revalidateOnFocus: false,
});
const devices: DeviceChip[] = data?.devices || [];`}</code></pre>

      <Concept name="Rendering happens many times">
        <p>
          This is the idea that trips up everyone arriving from plain JavaScript. The function body does{' '}
          <strong>not</strong> run once. React re-runs it whenever something it depends on changes — here,
          whenever SWR gets new data, which is every five minutes.
        </p>
        <p>So the mental model is not &quot;set up the UI, then mutate the DOM&quot;. It is:</p>
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px]">{`UI = f(data)      // describe what it should look like FOR THIS DATA
                  // React works out the DOM changes`}</pre>
        <p>
          You never write <code>document.querySelector</code> or set <code>innerHTML</code>. You describe the
          result, and React reconciles.
        </p>
        <p>
          <strong>Corollary:</strong> anything expensive in the body runs on every render. That is what{' '}
          <code>useMemo</code> is for — the next lesson.
        </p>
      </Concept>

      <h2>Conditional rendering</h2>

      <pre><code>{`if (!devices.length) return null;
if (quiet && devices.every((d) => d.status === 'trusted')) return null;`}</code></pre>

      <Concept name="Returning null" from="ClockHealthBadges.tsx">
        <p><code>null</code> means &quot;render nothing&quot;. These two lines carry the whole design intent:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>No devices → nothing.</li>
          <li>In <code>quiet</code> mode with every device trusted → nothing.</li>
        </ul>
        <p>
          The header comment calls this <em>&quot;health information, zero noise&quot;</em>. On the dashboard the
          component is invisible until something is actually wrong — which is what makes it worth having there.
          A badge that always shows gets ignored within a week.
        </p>
        <p>
          <strong>Early returns beat nesting.</strong> The alternative is wrapping the entire JSX in a
          conditional, which pushes everything a level deeper for no benefit.
        </p>
      </Concept>

      <p>Inline conditionals appear inside the JSX too:</p>

      <pre><code>{`{bad ? <AlertTriangle /> : review ? <Clock /> : <CheckCircle />}

{bad && offsetLabel && <span>{offsetLabel}</span>}`}</code></pre>

      <Concept name="&& and ?: inside JSX">
        <p>
          <code>{'{}'}</code> means &quot;evaluate this expression&quot;. Since <code>if</code> is a statement,
          not an expression, JSX uses the ternary <code>? :</code> and the logical <code>&amp;&amp;</code>.
        </p>
        <p>
          <code>{'{cond && <X/>}'}</code> renders <code>{'<X/>'}</code> when <code>cond</code> is truthy, and
          otherwise renders the value of <code>cond</code> — which React ignores for{' '}
          <code>false</code>, <code>null</code> and <code>undefined</code>.
        </p>
      </Concept>

      <Box kind="warning" title="The && trap: numbers">
        <p>
          <code>{'{devices.length && <List/>}'}</code> renders a literal <strong>0</strong> on the page when the
          array is empty, because <code>0</code> is falsy but is still a renderable value.
        </p>
        <p>
          Write <code>{'{devices.length > 0 && <List/>}'}</code>, or use an early return as this component
          does.
        </p>
      </Box>

      <h2>Rendering a list</h2>

      <pre><code>{`{devices.map((d) => {
  const bad = d.status === 'anomaly';
  …
  return (
    <a key={d.device_sn} href="/attendance/time-health" …>
      …
    </a>
  );
})}`}</code></pre>

      <Concept name="key — and why it is not optional" from="ClockHealthBadges.tsx">
        <p>
          <code>key</code> tells React which item is which <em>between renders</em>. Without a stable key,
          React matches by position — so when the list reorders, it reuses the wrong DOM nodes.
        </p>
        <Evolution
          stages={[
            {
              verdict: 'bad',
              label: 'Array index as key',
              code: `{devices.map((d, i) => <Chip key={i} … />)}`,
              why: <>Position-based. Sort the list, or remove the first device, and React reuses the wrong nodes — state, focus and animations attach to the wrong row. In a table with inputs, the user&apos;s typing jumps to a different row.</>,
            },
            {
              verdict: 'best',
              label: 'A stable identifier — what DRAIS does',
              code: `{devices.map((d) => <a key={d.device_sn} … />)}`,
              why: <>The serial identifies that device across any reorder or refresh. Elsewhere in DRAIS you will see <code>key={'{'}student.id{'}'}</code> for the same reason.</>,
            },
          ]}
        />
        <p>
          <strong>Rule:</strong> the key must be stable and unique <em>among siblings</em>. Never the index,
          never <code>Math.random()</code>, which produces a brand-new key every render and forces React to
          discard and rebuild every node.
        </p>
      </Concept>

      <Concept name="Computing inside map">
        <p>
          Note that <code>bad</code>, <code>review</code> and <code>offsetLabel</code> are computed{' '}
          <em>inside</em> the callback, per item, then used in both the class names and the content.
        </p>
        <p>
          This is ordinary JavaScript — no React feature involved. Prefer it over cramming logic into JSX; a
          named boolean like <code>bad</code> reads far better than repeating{' '}
          <code>d.status === &apos;anomaly&apos;</code> five times.
        </p>
      </Concept>

      <h2>Events</h2>

      <p>This component uses an <code>&lt;a&gt;</code>, but most DRAIS components handle clicks directly:</p>

      <pre><code>{`<button onClick={() => setSidebarOpen(!sidebarOpen)}>Toggle</button>`}</code></pre>

      <Concept name="onClick takes a function, not a call">
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px]">{`onClick={handleSave}        // ✅ passes the function
onClick={handleSave()}      // ❌ CALLS it during render, passes the result
onClick={() => save(id)}    // ✅ needs an argument → wrap in an arrow`}</pre>
        <p>
          The second line is the classic beginner bug: it runs on every render, often firing a save the moment
          the page loads.
        </p>
      </Concept>

      <h2>children</h2>

      <pre><code>{`export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen"><Sidebar />{children}</div>;
}`}</code></pre>

      <Concept name="children" from="src/components/layout/MainLayout.tsx">
        <p>
          Whatever is nested between a component&apos;s tags arrives as the <code>children</code> prop. It is
          how layouts wrap pages without knowing what they contain — the basis of the whole shell in{' '}
          <code>src/app/layout.tsx</code>.
        </p>
        <p><code>React.ReactNode</code> is the type meaning &quot;anything renderable&quot;: elements, strings, numbers, arrays, <code>null</code>.</p>
      </Concept>

      <h2>Reading it as a whole</h2>

      <Table
        head={['Line region', 'Doing']}
        rows={[
          ['Header comment', <>States the design intent — why it is inline rather than route-only.</>],
          [<code>interface DeviceChip</code>, <>Declares the shape of one item from the API.</>],
          [<>Props</>, <>One optional flag with a default.</>],
          [<code>useSWR</code>, <>Fetches, caches, refreshes every 5 minutes.</>],
          [<>Two early returns</>, <>Decides whether to render at all.</>],
          [<><code>.map</code> with <code>key</code></>, <>One chip per device, identified by serial.</>],
          [<>Ternaries in <code>className</code></>, <>Colour by status, with <code>dark:</code> on every branch.</>],
        ]}
      />

      <Box kind="tip" title="That structure is the template">
        <p>
          Intent comment → data shape → props → fetch → early returns → list → styling. Nearly every DRAIS
          display component follows it. Once you can see it, the 300 components stop looking like 300 different
          things.
        </p>
      </Box>

      <Exercise
        n={1}
        title="Read three more components"
        objective={<>Open <code>DeviceStatusWidget</code>, <code>DashboardKPIs</code> and one from <code>src/components/students/</code>. For each, write down: its props, where its data comes from, its early returns, and what it keys its list on.</>}
        hints={<>If a component has no early return for the empty case, that is worth noticing — it may render an empty box for a new school.</>}
        mistakes={<>Reading top to bottom. Find the <code>return</code> first to see what it produces, then work backwards to how it got the data.</>}
      />

      <Exercise
        n={2}
        title="Write a status chip"
        objective={<>Write <code>TermStatusChip</code>: takes <code>{'{ status: \'active\' | \'upcoming\' | \'ended\' }'}</code> and renders a coloured chip. Render <code>null</code> for an unknown status.</>}
        hints={<>Model it on the chip inside <code>ClockHealthBadges</code>. Use a named boolean per state rather than repeating the comparison.</>}
        mistakes={
          <ul className="list-disc pl-5 space-y-1">
            <li>Typing <code>status</code> as <code>string</code> — you lose the compiler&apos;s check on the values.</li>
            <li>Forgetting <code>dark:</code> variants. Look at it in both themes.</li>
            <li>Hardcoding a brand colour instead of a status colour; see the theming page.</li>
          </ul>
        }
      />

      <SelfCheck
        questions={[
          {
            q: <>Why is <code>key={'{'}i{'}'}</code> dangerous in a list that can reorder?</>,
            a: <p>Keys identify items between renders. An index is positional, so after a reorder React reuses the wrong DOM nodes — state, focus and typing attach to the wrong row.</p>,
          },
          {
            q: <><code>{'{devices.length && <List/>}'}</code> — what appears when the array is empty?</>,
            a: <p>A literal <strong>0</strong>. Zero is falsy but renderable. Use <code>&gt; 0</code> or an early return.</p>,
          },
          {
            q: <>How many times does a component function body run?</>,
            a: <p>Once per render, which is as often as React decides. Never assume once — anything expensive there runs every time.</p>,
          },
          {
            q: <>Why does <code>ClockHealthBadges</code> return <code>null</code> when all devices are trusted?</>,
            a: <p>Health information with zero noise. A badge that is always visible gets ignored, so it appears only when something is actually wrong.</p>,
          },
          {
            q: <>What is wrong with <code>onClick={'{'}handleSave(){'}'}</code>?</>,
            a: <p>It calls the function during render and passes its return value as the handler. Pass <code>handleSave</code>, or wrap in an arrow if you need arguments.</p>,
          },
        ]}
      />

      <SeeAlso slugs={['learn-hooks-deep', 'learn-tsx', 'components', 'theming']} />
    </ControlDoc>
  );
}
