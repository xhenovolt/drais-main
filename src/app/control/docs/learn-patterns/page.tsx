'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';
import { LessonIntro, Concept, Evolution, Exercise, SelfCheck } from '../Lesson';

export default function Page() {
  return (
    <ControlDoc slug="learn-patterns">
      <LessonIntro
        level="Intermediate"
        prereqs="TypeScript from DRAIS. Helpful: Auth & tenancy, Data end to end."
        teaches={['tenant scoping', 'derived state', 'idempotency', 'fire-and-forget', 'append-only', 'pure core', 'guard clauses']}
        outcome={<>Recognise the six patterns that recur across DRAIS, and say what each earlier version actually cost — because each of these was a real bug first.</>}
      />

      <p>
        Every comparison below is a decision this codebase already made. The <em>bad</em> column is not a straw
        man — in most cases it is what the code used to do, and the consequence listed is what happened.
      </p>

      <h2>1. Where does <code>school_id</code> come from?</h2>

      <Evolution
        stages={[
          {
            verdict: 'bad',
            label: 'From the request',
            code: `export async function GET(req: NextRequest) {
  const schoolId = Number(new URL(req.url).searchParams.get('schoolId'));
  return NextResponse.json(await listLearners(schoolId));
}`,
            why: <><strong>A cross-tenant read.</strong> It works perfectly in testing, because your client sends the right value. In production any client can send any value — including another school&apos;s id. Nothing errors; the wrong school&apos;s learners are simply returned.</>,
          },
          {
            verdict: 'better',
            label: 'From the session, checked against the request',
            code: `const session = await getSessionSchoolId(req);
if (!session) return unauthorized();
const asked = Number(searchParams.get('schoolId'));
if (asked !== session.schoolId) return forbidden();`,
            why: <>Correct, but it invites the question &quot;which is authoritative?&quot; at every call site, and the check must be remembered every time. One route that forgets it is back to the first case.</>,
          },
          {
            verdict: 'best',
            label: 'From the session, full stop',
            code: `const session = await getSessionSchoolId(req);
if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

const learners = await listLearners(session.schoolId);   // the ONLY source`,
            why: <>There is nothing to forget, because the request never carries a school id. Tenancy stops being a check and becomes a property of how the data is obtained. <strong>The one exception is device operations</strong>, where the trusted scope is the <em>device&apos;s</em> school — a live test exposed cross-school contamination from using the session&apos;s.</>,
          },
        ]}
      />

      <h2>2. Storing a balance</h2>

      <Evolution
        stages={[
          {
            verdict: 'bad',
            label: 'A balance column',
            code: `UPDATE students SET balance = balance - ? WHERE id = ?;`,
            why: <>A second source of truth. It drifts the first time a write fails halfway, a retry double-applies, or two requests interleave. In finance, drift is not something you ship past — a school finds it during an audit and stops trusting the system.</>,
          },
          {
            verdict: 'better',
            label: 'A balance column, recomputed by a job',
            code: `// nightly: recompute every learner's balance from the ledger`,
            why: <>Self-healing, but wrong for up to a day, and it hides the underlying bug rather than removing it. It also needs a scheduled job — and DRAIS has exactly one cron, already spent.</>,
          },
          {
            verdict: 'best',
            label: 'Derive it',
            code: `balance = SUM(debit) - SUM(credit)      -- computed on read, every time`,
            why: <>There is no second value to drift. A correction is a compensating entry, so the history explains the balance. Costs a query per read — paid deliberately. <strong>No balance column exists anywhere in DRAIS, and none may be added.</strong></>,
          },
        ]}
      />

      <Concept name="Derived state">
        <p>
          The general rule: <strong>if a value can be computed from other values, computing it is safer than
          storing it.</strong> A stored copy is a cache, and every cache needs an invalidation story you will
          get wrong at least once.
        </p>
        <p>
          DRAIS derives money-location balances, budget spend, pocket money, attendance status and search
          ranking. It stores <em>one</em> computed value on purpose — the CAFE grade code, resolved at write
          time because reads are the hot path — and that decision is documented where it is made.
        </p>
      </Concept>

      <h2>3. Fixing a wrong record</h2>

      <Evolution
        stages={[
          {
            verdict: 'bad',
            label: 'Delete and re-enter',
            code: `DELETE FROM attendance_raw_events WHERE id = ?;
INSERT INTO attendance_raw_events (...) VALUES (...);`,
            why: <><strong>Destroys the evidence.</strong> These rows are what a school shows a ministry. A system that lets the past be rewritten cannot be used to prove anything about it — which is the entire product.</>,
          },
          {
            verdict: 'better',
            label: 'Update in place with an audit row',
            code: `UPDATE attendance_raw_events SET person_id = ? WHERE id = ?;
INSERT INTO audit_logs (...);`,
            why: <>The change is recorded, but the row no longer shows what the device actually reported. Reconstructing the original means replaying the audit log — possible, and not something anyone does under pressure.</>,
          },
          {
            verdict: 'best',
            label: 'Re-attribute; never mutate the event',
            code: `planCorrection()    // PURE — previews exactly what changes
applyCorrection()   // 1. mapping_history row  (who / when / old / new / why)
                    // 2. move the PIN to the right person
                    // 3. re-attribute affected events
                    //    time, device, finger PRESERVED verbatim`,
            why: <>The scan stays exactly as recorded; only the identity label attached to it changes. Same principle in finance (compensating entries), staff employment and class-teacher assignment — all append-only. <strong>Correct by adding, never by overwriting.</strong></>,
          },
        ]}
      />

      <h2>4. Matching a name</h2>

      <Evolution
        stages={[
          {
            verdict: 'bad',
            label: 'Create what you cannot find',
            code: `let person = await findByName(deviceName);
if (!person) person = await createPerson(deviceName);   // phantom learner`,
            why: <><strong>This shipped.</strong> A misspelt device name forked a duplicate learner, which then accrued its own attendance. The original learner appeared to be absent half the time, and the duplicate looked like a real child nobody could place.</>,
          },
          {
            verdict: 'better',
            label: 'Fuzzy match above a threshold',
            code: `const best = score(deviceName, candidates);
if (best.score > 0.6) await link(best.person, pin);      // "close enough"`,
            why: <>No phantom learners, but 0.6 permanently mapped a fingerprint to a <em>similar</em> name. A forensic audit found what that cost — attendance credited to the wrong child, discovered long afterwards.</>,
          },
          {
            verdict: 'best',
            label: 'Deterministic only; queue the rest',
            code: `// Permanent mapping requires: full-score match (every token)
//                        AND no other plausible candidate.
// Anything else → pending_device_users  ('pending' | 'ambiguous')`,
            why: <>The system proposes; a human confirms. Two same-named learners both scoring 1.0 is <em>ambiguous</em>, and an operator decides. <strong>A queue item costing thirty seconds beats a wrong mapping costing a term.</strong> The same stance governs name transliteration and payment import.</>,
          },
        ]}
      />

      <Box kind="invariant" title="The generalisation">
        <p>
          <strong>Never let the system silently commit a guess about a person&apos;s identity.</strong> It
          appears in biometric matching, Arabic transliteration (a reviewed draft, never auto-accepted), and
          payment import (name matches always require confirmation).
        </p>
      </Box>

      <h2>5. Side effects on a hot path</h2>

      <Evolution
        stages={[
          {
            verdict: 'bad',
            label: 'Await everything',
            code: `await recordPunch(event);
await sendGuardianSms(event);     // provider is slow or down
await reindexSearch(event);
return ok();`,
            why: <>The punch now depends on an SMS provider. Six hundred learners arrive in twenty minutes; one slow provider stalls the queue, and a timeout means the attendance record is lost even though the child is standing at the gate.</>,
          },
          {
            verdict: 'better',
            label: 'try/catch each effect',
            code: `await recordPunch(event);
try { await sendGuardianSms(event); } catch { /* ignore */ }`,
            why: <>No longer fails the request, but still <em>waits</em> for it. The hot path is as slow as the slowest external service, and the swallowed error means nobody learns the provider is down.</>,
          },
          {
            verdict: 'best',
            label: 'Persist, then fire and forget',
            code: `await recordPunch(event);          // the durable part — awaited

void notifyAdmsAttendance(event);  // fire-and-forget
void reindexEntity(schoolId, 'student', id);

return ok();`,
            why: <>The record is safe before anything optional runs. Delivery guarantees come from a durable queue — <code>notification_outbox</code> plus a drainer — not from awaiting. <strong>Persist first; notify after.</strong></>,
          },
        ]}
      />

      <Box kind="warning" title="Fire-and-forget is not the same as unreliable">
        <p>
          The distinction is <em>where the guarantee lives</em>. A fire-and-forget call that writes a durable
          row is reliable — the drainer will retry it. A fire-and-forget call that only publishes to the
          in-process event bus reaches nobody on serverless, because the bus does not cross instances.
        </p>
      </Box>

      <h2>6. Where the decision lives</h2>

      <Evolution
        stages={[
          {
            verdict: 'bad',
            label: 'Logic in the route handler',
            code: `export async function POST(req: NextRequest) {
  // 200 lines: auth, validation, eligibility rules, SQL, response shaping
}`,
            why: <>Untestable without an HTTP request and a database. The rules cannot be reused by the Control Center, so they get copied — and the copy drifts. This is how a second implementation of the contributing-subject rule produced wrong divisions on printed report cards.</>,
          },
          {
            verdict: 'better',
            label: 'Logic in a service that takes the session',
            code: `export async function issueCard(session: SessionInfo, input: Input) { … }`,
            why: <>Testable-ish, but bound to school auth. A Control Center route cannot call it without constructing a fake school session — which is precisely the isolation the two auth domains exist to prevent.</>,
          },
          {
            verdict: 'best',
            label: 'Pure core, resolved scope, audited shell',
            code: `// pure — unit-tested with no database
export function decideEligibility(ctx: Ctx): Decision { … }

// service — takes a RESOLVED schoolId, not a session
export async function issueCard(schoolId: number, input: Input) { … }

// route — auth, validation, audit; no business logic
export const POST = withRoute({ permission: 'issuance.manage' }, async ({ session }) =>
  issueCard(session.schoolId, await parse(req)));`,
            why: <>The pure part is tested without infrastructure. The service is callable by <strong>both</strong> auth domains without either sharing code with the other. The route stays thin. This is why the Control Center has a test file per module and no fixture database.</>,
          },
        ]}
      />

      <h2>The six, in one table</h2>

      <Table
        head={['Pattern', 'Rule', 'What the bad version cost']}
        rows={[
          ['Tenant scope', <>Session only; never the request</>, <>Cross-tenant reads</>],
          ['Derived state', <>Compute, do not store</>, <>Ledgers that stop adding up</>],
          ['Append-only', <>Correct by adding</>, <>Destroyed evidence</>],
          ['Deterministic identity', <>Queue, never guess</>, <>Duplicate learners accruing attendance</>],
          ['Persist then notify', <>Durable first, effects after</>, <>Lost punches when a provider is slow</>],
          ['Pure core', <>Rules out of routes</>, <>Duplicated rules, wrong divisions on report cards</>],
        ]}
      />

      <Exercise
        n={1}
        title="Audit a route against all six"
        objective={<>Pick any route under <code>src/app/api/</code> that you did not write. Check it against each pattern and write down which it satisfies.</>}
        hints={<>Fastest checks first: does it read <code>schoolId</code> from the session? Is there a <code>logAudit</code> on the mutation? Is any side effect awaited that need not be?</>}
        mistakes={<>Assuming an old route is correct because it is in production. Several predate these patterns — that is why the patterns exist.</>}
        solution={<p>If you find a real violation, fix it in a small separate commit with the reasoning in the message. That is exactly how the codebase converged on these in the first place.</p>}
      />

      <Exercise
        n={2}
        title="Find a stored value that should be derived"
        objective={<>Search for columns holding something computable — a count, a total, a status summary. For each, decide whether deriving it is affordable.</>}
        hints={<>Cached values usually have a hook keeping them fresh; <code>feeStatusMiddleware</code> is one. That hook is the tell.</>}
        mistakes={<>Concluding everything must be derived. Grade codes are stored on purpose, because reads are the hot path — the test is whether the cost is paid knowingly and written down.</>}
      />

      <SelfCheck
        questions={[
          {
            q: <>A route takes <code>schoolId</code> from the query string and it passes every test. Why is it still wrong?</>,
            a: <p>Tests send the correct value. A client can send any value, including another school&apos;s. Nothing errors — the wrong data is simply returned.</p>,
          },
          {
            q: <>Why is deleting a wrong attendance event worse than leaving it?</>,
            a: <p>Raw events are the evidence a school shows a ministry. Re-attribute instead: the time, device and finger stay verbatim and only the identity label changes.</p>,
          },
          {
            q: <>When is fire-and-forget unreliable?</>,
            a: <p>When the guarantee lives in the call rather than in a durable row. Writing to <code>notification_outbox</code> is reliable; publishing to the in-process bus reaches nobody across serverless instances.</p>,
          },
          {
            q: <>Why should a service take <code>schoolId</code> rather than a session?</>,
            a: <p>So both auth domains can call it without sharing auth code. A session parameter binds it to school auth and forces the Control Center to fake one.</p>,
          },
          {
            q: <>What would you say to &quot;a threshold of 0.6 is close enough for name matching&quot;?</>,
            a: <p>That it was tried, and it permanently mapped fingerprints to similar names. Permanent mappings require a full-score match with no other plausible candidate; everything else queues for a human.</p>,
          },
        ]}
      />

      <Source path="src/lib/biometric/name-match-policy.ts">The deterministic-match rule, kept pure and import-free.</Source>
      <Source path="src/lib/services/FinanceLedger.ts">The four ledger rules stated at the top of the file.</Source>

      <SeeAlso slugs={['learn-lab-attendance', 'playbook-api', 'security', 'decisions']} />
    </ControlDoc>
  );
}
