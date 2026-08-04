'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';
import { LessonIntro, Concept, Evolution, Exercise, SelfCheck } from '../Lesson';

export default function Page() {
  return (
    <ControlDoc slug="learn-async">
      <LessonIntro
        level="Foundation"
        prereqs="JavaScript functions and callbacks. Helpful: React from DRAIS."
        teaches={['Promise', 'async/await', 'Promise.all', 'try/catch', 'void', 'fire-and-forget', 'unhandled rejection']}
        outcome={<>Write async DRAIS code that fails loudly when it should, and never blocks a hot path on something optional.</>}
      />

      <p>
        Nearly every function in DRAIS that touches the database, a device or a provider is asynchronous. The
        language mechanics are small; the <strong>discipline around failure</strong> is what this lesson is
        about.
      </p>

      <h2>The mechanics, quickly</h2>

      <Concept name="Promise">
        <p>
          A value that is not ready yet. It ends in one of two states: <strong>fulfilled</strong> with a value,
          or <strong>rejected</strong> with an error.
        </p>
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px]">{`const p = query('SELECT …');   // a Promise, not rows
p.then(rows => …).catch(err => …);`}</pre>
      </Concept>

      <Concept name="async / await">
        <p>
          <code>await</code> pauses until a promise settles, letting asynchronous code read top to bottom. Two
          consequences people miss:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>An <code>async</code> function always returns a promise</strong>, even if you return a plain value.</li>
          <li><strong>A rejected promise throws at the <code>await</code></strong> — so ordinary <code>try/catch</code> works.</li>
        </ul>
      </Concept>

      <h2>Sequential vs parallel</h2>

      <Evolution
        stages={[
          {
            verdict: 'bad',
            label: 'Awaiting independent calls one at a time',
            code: `const classes  = await apiFetch('/api/classes');
const streams  = await apiFetch('/api/streams');
const programs = await apiFetch('/api/programs');
const modes    = await apiFetch('/api/study-modes');
const years    = await apiFetch('/api/academic_years');
const terms    = await apiFetch('/api/terms');`,
            why: <>Six round trips end to end. None of them depends on another, so five of the six waits are pure delay. At 150ms each that is nearly a second before the screen can render.</>,
          },
          {
            verdict: 'best',
            label: 'Promise.all — what the learner list actually does',
            code: `await Promise.all([
  apiFetch('/api/classes',        { silent: true }),
  apiFetch('/api/streams',        { silent: true }),
  apiFetch('/api/programs',       { silent: true }),
  apiFetch('/api/study-modes',    { silent: true }),
  apiFetch('/api/academic_years', { silent: true }),
  apiFetch('/api/terms',          { silent: true }),
]);`,
            why: <>All six start immediately; total time is the slowest one, not the sum. <strong>Use <code>Promise.all</code> whenever calls do not depend on each other</strong> — which is most of the time. <span className="text-slate-500">— src/app/students/list/page.tsx</span></>,
          },
        ]}
      />

      <Box kind="warning" title="Promise.all is all-or-nothing">
        <p>
          One rejection rejects the whole thing, and the other results are discarded. That is correct when you
          need all of them — but wrong when a partial result is still useful.
        </p>
        <p>
          For &quot;get what you can&quot;, use <code>Promise.allSettled</code>, which returns an outcome per
          entry. The cross-school health monitors take this shape: one school failing must not blank the scan.
        </p>
      </Box>

      <h2>Errors: the zero-silent-failures rule</h2>

      <Evolution
        stages={[
          {
            verdict: 'bad',
            label: 'Swallowing',
            code: `try {
  await recordPayment(input);
} catch {
  // ignore
}
return NextResponse.json({ success: true });`,
            why: <><strong>Reports success for a failed payment.</strong> The bursar sees a confirmation, the ledger has nothing, and the discrepancy surfaces weeks later with no log to explain it. This is the single worst pattern in this codebase&apos;s history.</>,
          },
          {
            verdict: 'better',
            label: 'Catch and return an error',
            code: `try {
  await recordPayment(input);
} catch (e) {
  return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
}`,
            why: <>Honest to the caller, but the UI cannot branch on prose and nothing was logged — so nobody can diagnose it afterwards.</>,
          },
          {
            verdict: 'best',
            label: 'Log with a tag, return a stable code',
            code: `try {
  const result = await recordPayment(input);
  return NextResponse.json({ success: true, data: result });
} catch (e) {
  console.error('[finance/payments]', e);
  return NextResponse.json(
    { success: false, error: { message: (e as Error).message, code: 'PAYMENT_FAILED' } },
    { status: 500 },
  );
}`,
            why: <>The tag makes it findable in logs; the <code>code</code> lets the UI react specifically. This is the shape the API error-handling guide requires.</>,
          },
        ]}
      />

      <Concept name="catch (e) is `unknown`">
        <p>
          TypeScript types a caught value as <code>unknown</code>, because JavaScript permits throwing
          anything. Hence <code>(e as Error).message</code> across the codebase.
        </p>
        <p>
          Strictly, a defensive check is better — <code>e instanceof Error ? e.message : String(e)</code> — but
          the cast is the established convention here.
        </p>
      </Concept>

      <h2>Fire-and-forget</h2>

      <pre><code>{`await recordPunch(event);            // durable — awaited

void notifyAdmsAttendance(event);   // optional — NOT awaited
void reindexEntity(schoolId, 'student', id);

return ok();`}</code></pre>

      <Concept name="void, and why it is written explicitly">
        <p>
          <code>void</code> discards the promise deliberately. It is not decoration — it tells the reader{' '}
          <em>and the linter</em> that not awaiting was a choice, rather than an omission.
        </p>
        <p>
          Six hundred learners arrive in twenty minutes. If the punch awaited an SMS provider, one slow
          provider would stall the queue and a timeout would lose the attendance record for a child standing at
          the gate.
        </p>
      </Concept>

      <Box kind="warning" title="An un-awaited rejection is an unhandled rejection">
        <p>
          <code>void doThing()</code> where <code>doThing</code> rejects produces an unhandled promise
          rejection — noisy in logs, and on some runtimes fatal.
        </p>
        <p>
          <strong>A fire-and-forget function must catch internally.</strong> That is why{' '}
          <code>writePlatformAudit</code> wraps its own body in try/catch: an audit failure must never fail the
          request, and must never crash the process either.
        </p>
      </Box>

      <Box kind="invariant" title="Order matters: persist, then notify">
        <p>
          Await the durable part. Fire the optional parts after. Reversing it means a notification can be sent
          about a thing that was never recorded — and delivery guarantees come from a durable queue, not from
          awaiting.
        </p>
      </Box>

      <h2>Async in React</h2>

      <Box kind="warning" title="A component cannot be async">
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px]">{`export default async function Page() { … }   // ❌ not in a client component`}</pre>
        <p className="mt-2">
          Rendering is synchronous. Data comes from <code>useSWR</code>, which owns the loading and error
          states for you.
        </p>
        <p>An <code>async</code> effect callback is likewise invalid — the effect must return a cleanup function or nothing, and an async function returns a promise:</p>
        <pre className="bg-slate-950 p-3 rounded overflow-x-auto text-[12.5px] mt-2">{`useEffect(async () => { … }, []);          // ❌
useEffect(() => { void load(); }, []);     // ✅ define inside, call it`}</pre>
      </Box>

      <h2>Transactions</h2>

      <pre><code>{`await withTransaction(async (conn) => {
  const personId  = await insertPerson(conn, input);
  const studentId = await insertStudent(conn, personId, input);
  await insertEnrollment(conn, studentId, input);
});   // any throw → the whole thing rolls back`}</code></pre>

      <Box kind="invariant" title="Multi-table writes need a transaction">
        <p>
          Without one, a failure after the second insert leaves a learner with no enrolment — a record that
          exists and cannot be found in any class list.
        </p>
        <p>
          <strong>Never fire-and-forget inside a transaction.</strong> The effect would outlive a rollback, so
          you would notify about something that did not happen.
        </p>
      </Box>

      <Exercise
        n={1}
        title="Find sequential awaits that should be parallel"
        objective={<>Search <code>src/app</code> for consecutive <code>await</code> calls with no data dependency and convert one to <code>Promise.all</code>.</>}
        hints={<>The tell is several <code>const x = await …</code> lines in a row where no later call uses an earlier result.</>}
        mistakes={<>Parallelising calls that <em>do</em> depend on each other, or converting writes that must be ordered.</>}
      />

      <Exercise
        n={2}
        title="Find a swallowed error"
        objective={<>Search for <code>catch {'{}'}</code> and <code>catch {'{ /* ignore */ }'}</code>. For each, decide whether the silence is deliberate.</>}
        hints={<>Legitimate cases exist — <code>writePlatformAudit</code> and the <code>last_used_at</code> touch are deliberately non-fatal. The question is whether a <em>user-visible</em> operation is being silently lost.</>}
        mistakes={<>Adding a <code>throw</code> to a fire-and-forget helper. That turns a non-fatal effect into a request failure — the opposite of the intent.</>}
      />

      <SelfCheck
        questions={[
          {
            q: <>Six independent fetches, 150ms each. Sequential vs <code>Promise.all</code>?</>,
            a: <p>~900ms versus ~150ms. Total time becomes the slowest call rather than the sum.</p>,
          },
          {
            q: <>When is <code>Promise.allSettled</code> right instead?</>,
            a: <p>When a partial result is still useful — a cross-school scan where one failing school must not blank the whole report.</p>,
          },
          {
            q: <>Why is <code>void</code> written rather than just calling the function?</>,
            a: <p>It states that not awaiting was deliberate, for both the reader and the linter. And the function must catch internally, or it produces an unhandled rejection.</p>,
          },
          {
            q: <>Why must the durable write be awaited before the side effects?</>,
            a: <p>Otherwise you can notify about something that was never recorded. Persist, then notify.</p>,
          },
          {
            q: <>What is wrong with <code>catch {'{}'}</code> around a payment?</>,
            a: <p>It reports success for a failed write. The bursar sees a confirmation, the ledger has nothing, and there is no log to diagnose it later.</p>,
          },
        ]}
      />

      <Source path="docs/guides/API_ERROR_HANDLING_GUIDE.md">The zero-silent-failures standard.</Source>

      <SeeAlso slugs={['learn-sql', 'data-flow', 'playbook-api', 'learn-patterns']} />
    </ControlDoc>
  );
}
