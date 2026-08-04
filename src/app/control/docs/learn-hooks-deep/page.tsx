'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';
import { LessonIntro, Concept, Evolution, Exercise, SelfCheck } from '../Lesson';

export default function Page() {
  return (
    <ControlDoc slug="learn-hooks-deep">
      <LessonIntro
        level="Foundation"
        prereqs="React, taught from DRAIS."
        teaches={['useState', 'useEffect', 'dependency array', 'cleanup', 'useMemo', 'useCallback', 'useRef', 'useReducer', 'rules of hooks', 'custom hooks']}
        outcome={<>Use every hook DRAIS uses, explain the dependency array, and recognise the infinite loop and stale closure before you ship them.</>}
      />

      <p>
        A hook is a function starting with <code>use</code> that lets a component <strong>remember something
        between renders</strong>. That is the whole concept — a component body re-runs constantly, and hooks are
        how anything survives that.
      </p>

      <h2>The two rules</h2>

      <Box kind="invariant" title="Rules of hooks">
        <ol className="list-decimal pl-5 space-y-1">
          <li><strong>Only at the top level.</strong> Never inside <code>if</code>, a loop, or after an early return.</li>
          <li><strong>Only in components or other hooks.</strong> Not in plain functions, not in event handlers.</li>
        </ol>
        <p>
          React tracks hooks <strong>by call order</strong>, not by name. A hook behind an <code>if</code>{' '}
          changes the order between renders, and React hands back the wrong piece of state.
        </p>
      </Box>

      <Box kind="warning" title="This is why the null-key idiom exists">
        <p>
          You cannot write <code>if (schoolId) useSWR(url)</code> — that breaks rule 1. So SWR takes a{' '}
          <code>null</code> key instead:
        </p>
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px] mt-2">{`const { data } = useSWR(schoolId ? '/api/…' : null, fetcher);`}</pre>
        <p className="mt-2">
          The hook always runs; the <em>fetch</em> is what is conditional. Once you see this, the pattern all
          over the dashboard stops looking arbitrary.
        </p>
      </Box>

      <h2>useState</h2>

      <pre><code>{`const [sidebarOpen, setSidebarOpen] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());`}</code></pre>

      <Concept name="useState" from="src/app/students/list/page.tsx">
        <p>
          Returns a pair: the current value, and a setter. Calling the setter tells React to re-render with the
          new value.
        </p>
        <p>
          <strong>State is not a variable you mutate.</strong> Assigning{' '}
          <code>sidebarOpen = true</code> does nothing — React never learns about it, so nothing re-renders.
        </p>
        <p>
          The generic (<code>useState&lt;Set&lt;number&gt;&gt;</code>) is needed when the initial value does not
          tell TypeScript enough — an empty <code>Set</code> would otherwise be inferred as{' '}
          <code>Set&lt;unknown&gt;</code>.
        </p>
      </Concept>

      <Evolution
        stages={[
          {
            verdict: 'bad',
            label: 'Mutating state directly',
            code: `selectedIds.add(id);        // the Set changes…
setSelectedIds(selectedIds); // …but it is the SAME object reference`,
            why: <>React compares by reference. Same reference means &quot;nothing changed&quot;, so it skips the re-render. The data is updated and the screen is not — one of the most confusing bugs to debug, because logging shows the correct value.</>,
          },
          {
            verdict: 'best',
            label: 'A new object every time',
            code: `setSelectedIds(prev => {
  const next = new Set(prev);
  next.add(id);
  return next;                // NEW reference → React re-renders
});`,
            why: <>Also uses the <strong>updater form</strong> (<code>prev =&gt;</code>), which is correct when the new value depends on the old one. Two updates in the same tick both see the latest value; <code>setX(x + 1)</code> twice would not.</>,
          },
        ]}
      />

      <h2>useEffect and the dependency array</h2>

      <pre><code>{`useEffect(() => {
  if (!hydrated || store.themePreference !== 'system') return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  syncSystemMode();
  const onChange = () => syncSystemMode();
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);   // cleanup
}, [hydrated, store.themePreference, syncSystemMode]);`}</code></pre>

      <Source path="src/components/theme/ThemeProvider.tsx">A textbook effect: subscribe, and unsubscribe.</Source>

      <Concept name="useEffect" from="ThemeProvider.tsx">
        <p>
          Runs <strong>after</strong> render, for things that reach outside React: subscriptions, timers,
          browser APIs, imperative DOM work.
        </p>
        <p>The dependency array controls when it re-runs:</p>
        <Table
          head={['Written', 'Runs']}
          rows={[
            [<code>useEffect(fn)</code>, <>After <strong>every</strong> render. Almost always a mistake.</>],
            [<code>useEffect(fn, [])</code>, <>Once on mount.</>],
            [<code>useEffect(fn, [a, b])</code>, <>On mount, then whenever <code>a</code> or <code>b</code> changes.</>],
          ]}
        />
        <p>
          <strong>The returned function is cleanup.</strong> React calls it before re-running the effect and on
          unmount. Here it removes the media-query listener — without it, every re-render adds another listener
          and none are removed.
        </p>
      </Concept>

      <Box kind="warning" title="The infinite loop everyone ships once">
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px]">{`const [data, setData] = useState([]);

useEffect(() => {
  fetchData().then(setData);
}, [data]);          // ❌ setData changes data → effect re-runs → forever`}</pre>
        <p className="mt-2">
          The effect writes something it depends on. The symptom is a request firing in a tight loop and a
          screen that flickers or freezes.
        </p>
        <p>
          <strong>Fix:</strong> remove it from the array — or better, do not fetch in an effect at all. Use
          SWR, which handles caching, deduplication and revalidation. In DRAIS, <code>useEffect</code> for
          data fetching is legacy; <code>useSWR</code> is the standard.
        </p>
      </Box>

      <Box kind="warning" title="The stale closure">
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px]">{`useEffect(() => {
  const id = setInterval(() => console.log(count), 1000);
  return () => clearInterval(id);
}, []);              // ❌ [] means the closure captured count === 0 forever`}</pre>
        <p className="mt-2">
          The effect captured <code>count</code> from the first render and never sees another value. It logs{' '}
          <code>0</code> indefinitely while the UI shows 47.
        </p>
        <p>
          <strong>Do not silence the lint rule.</strong> The exhaustive-deps warning is telling you about a real
          bug. Either add the dependency, or use the updater form, or a ref.
        </p>
      </Box>

      <h2>useMemo and useCallback</h2>

      <pre><code>{`const navigationItems = useMemo(() => {
  const items = getNavigationItems(tWrapper, lang);
  if (!user) return items;
  return filterMenuByRole(items, hasRole, !!user.isSuperAdmin, enabledModules);
}, [t, lang, user, enabledModules]);`}</code></pre>

      <Source path="src/components/layout/Sidebar.tsx" />

      <Concept name="useMemo" from="Sidebar.tsx">
        <p>
          Caches a <strong>computed value</strong> between renders, recomputing only when a dependency changes.
        </p>
        <p>
          Here it is justified: building the tree and filtering it by role and module runs on every render of a
          component that is on <em>every page</em>. Without the memo it recomputes when anything unrelated
          changes.
        </p>
        <p>
          <strong>Do not memo everything.</strong> <code>useMemo</code> has its own cost — the dependency
          comparison plus retained memory. For cheap computations it is slower than recomputing, and it adds
          noise. Reach for it when the work is genuinely expensive or the result feeds a memoised child.
        </p>
      </Concept>

      <Concept name="useCallback">
        <p>
          The same idea for <em>functions</em>. It matters because a function literal is a new reference every
          render — so passing one to a memoised child defeats the memo.
        </p>
        <p>
          <code>useCallback(fn, deps)</code> keeps the same reference while the deps hold. It is also what
          makes a function safe to list in another hook&apos;s dependency array.
        </p>
      </Concept>

      <h2>useRef</h2>

      <Concept name="useRef — two distinct uses">
        <p><strong>1. A handle on a DOM node</strong> — focus, scroll, measurement:</p>
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px]">{`const inputRef = useRef<HTMLInputElement>(null);
inputRef.current?.focus();`}</pre>
        <p><strong>2. A mutable box that does not trigger re-render</strong> — timer ids, previous values, &quot;has this already run&quot; flags:</p>
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px]">{`const timer = useRef<NodeJS.Timeout | null>(null);
timer.current = setTimeout(…);   // changing .current re-renders NOTHING`}</pre>
        <p>
          That is the key difference from state. <strong>Ref for things the UI does not display; state for
          things it does.</strong> Putting a displayed value in a ref means the screen never updates.
        </p>
      </Concept>

      <h2>useReducer, for state with rules</h2>

      <p>
        When updates follow a state machine rather than independent values, a reducer beats several{' '}
        <code>useState</code> calls. The DRCE editor is the clearest case in DRAIS:
      </p>

      <pre><code>{`const [state, dispatch] = useReducer(editorReducer, initialState);

// EditorState = { history, index, savedIndex, lastTouch }
// every edit is a described action, so undo is just index--`}</code></pre>

      <Source path="src/components/drce/editor/useDRCEEditor.ts" />

      <Box kind="tip" title="How to tell you want a reducer">
        <p>
          Several pieces of state that must change <em>together</em> and consistently. With four{' '}
          <code>useState</code> calls, every action has to remember to update all four — and one path that
          forgets is a bug you find much later. A reducer makes the transition a single, testable function.
        </p>
      </Box>

      <h2>Custom hooks</h2>

      <p>
        A custom hook is just a function starting with <code>use</code> that calls other hooks. DRAIS has 14,
        and the bar for adding one is deliberately high.
      </p>

      <Table
        head={['Reason', 'Justified?']}
        rows={[
          [<>It is just a fetch</>, <><strong>No.</strong> That is <code>useSWR(url)</code> at the call site.</>],
          [<>It encodes a business rule</>, <><strong>Yes</strong> — <code>useCurrency</code>, <code>useSchoolConfig</code>.</>],
          [<>Used in 3+ unrelated places</>, <><strong>Yes.</strong> Below that, a local function is clearer.</>],
          [<>It wraps hardware or the network</>, <><strong>Yes</strong>, and it must degrade gracefully — <code>useFingerprint</code>, <code>useSocket</code>.</>],
        ]}
      />

      <Exercise
        n={1}
        title="Find and fix a dependency array"
        objective={<>Search for <code>useEffect</code> across <code>src/components</code>. Find one with a missing or suppressed dependency and work out whether it is a real bug.</>}
        hints={<>Ask: does the effect read a value not in the array? If yes, it captured that value from the render it was created in.</>}
        mistakes={<>Adding every referenced value blindly — that can create the infinite loop. Think about which values should actually re-trigger the effect.</>}
      />

      <Exercise
        n={2}
        title="Convert useState + useEffect fetching to SWR"
        objective={<>Take <code>src/hooks/useStudents.ts</code>, which predates the convention, and rewrite it with <code>useSWR</code>.</>}
        hints={<>You gain caching, deduplication and <code>mutate</code>. Keep the exported shape identical so callers do not change.</>}
        mistakes={<>Dropping the null-key guard — a fetch that fires before the session resolves produces a 401 on every load.</>}
      />

      <SelfCheck
        questions={[
          {
            q: <>Why can a hook not be called inside an <code>if</code>?</>,
            a: <p>React tracks hooks by call order. A conditional hook changes the order between renders, so React returns the wrong state for a given call.</p>,
          },
          {
            q: <>Why does <code>selectedIds.add(id); setSelectedIds(selectedIds)</code> not re-render?</>,
            a: <p>Same object reference. React compares by reference and concludes nothing changed. Construct a new <code>Set</code> from the previous one.</p>,
          },
          {
            q: <>What does the effect&apos;s returned function do, and when?</>,
            a: <p>Cleanup — before the effect re-runs and on unmount. Without it, subscriptions and timers accumulate on every render.</p>,
          },
          {
            q: <>An interval logs <code>0</code> forever while the UI shows 47. Why?</>,
            a: <p>A stale closure: the effect had <code>[]</code>, so it captured <code>count</code> from the first render. Add the dependency, or use the updater form or a ref.</p>,
          },
          {
            q: <>State or ref for a timer id?</>,
            a: <p>Ref. Nothing displays it, so a re-render would be wasted — and setting state in a timer callback is a common source of loops.</p>,
          },
        ]}
      />

      <SeeAlso slugs={['learn-react', 'hooks', 'learn-nextjs', 'blueprint-drce-editor']} />
    </ControlDoc>
  );
}
