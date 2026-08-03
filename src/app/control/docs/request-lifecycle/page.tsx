'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="request-lifecycle">
      <p>
        Four traced workflows. If you can follow these, you can follow anything in DRAIS — every other feature
        is a variation on one of them.
      </p>

      <h2>1. The generic request</h2>

      <p>Every authenticated school request passes through these stages, in this order.</p>

      <Diagram caption="Stages 1–3 are framework; stages 4–8 are yours to get right.">
{`  ┌─ 1  BROWSER ────────────────────────────────────────────────────────────┐
  │    Click → SWR key or fetch()                                           │
  └─────────────────────────────────────────────┬───────────────────────────┘
                                                ▼
  ┌─ 2  MIDDLEWARE  (Edge runtime — NO database) ───────────────────────────┐
  │    public-route exemption?      → pass through                          │
  │    drais_session cookie present? → else 401 (API) / redirect (page)     │
  │    forced password reset?       → /auth/set-password                    │
  │    RBAC prefix guard (drais_role cookie)                                │
  │    sets x-school-id header from cookie                                  │
  └─────────────────────────────────────────────┬───────────────────────────┘
                                                ▼
  ┌─ 3  ROUTE HANDLER  app/api/**/route.ts  (Node runtime) ─────────────────┐
  │  a. getSessionSchoolId()   ← the ONLY trusted school scope              │
  │  b. authorize(session, 'module.resource.action')                        │
  │  c. withModule('tahfiz')   ← if the feature is module-gated             │
  │  d. validate input         ← never trust the body                       │
  └─────────────────────────────────────────────┬───────────────────────────┘
                                                ▼
  ┌─ 4  SERVICE  src/lib/<subsystem>/ ──────────────────────────────────────┐
  │    business logic. Pure where it can be; takes a RESOLVED schoolId.     │
  └─────────────────────────────────────────────┬───────────────────────────┘
                                                ▼
  ┌─ 5  DATABASE  src/lib/db ───────────────────────────────────────────────┐
  │    parameterised, school-scoped. withTransaction() for multi-table.     │
  └─────────────────────────────────────────────┬───────────────────────────┘
                                                ▼
  ┌─ 6  AUDIT      logAudit(...)         ← every mutation                   │
  ┌─ 7  SIDE-EFFECT emit(...) / enqueue  ← fire-and-forget, never blocking  │
  ┌─ 8  RESPONSE   → mutate(key) on the client → UI updates                 │
  └─────────────────────────────────────────────────────────────────────────┘`}
      </Diagram>

      <Box kind="invariant" title="Middleware is not a security boundary on its own">
        <p>
          It runs on the Edge runtime and <strong>cannot reach the database</strong>, so it only checks that a
          cookie is <em>present</em> — never that it is valid. Real authentication happens in the route
          handler.
        </p>
        <p>
          Consequence: a route that skips step 3a because &quot;middleware already checked&quot; is
          unauthenticated. Every handler resolves its own session.
        </p>
      </Box>

      <Box kind="invariant" title="school_id comes from the session, never the request">
        <p>
          Step 3a is the whole tenancy model. A handler that reads <code>schoolId</code> from the body or query
          string works perfectly in testing — the client sends the right value — and is a cross-tenant read in
          production, because a client can send any value.
        </p>
        <p>
          The one exception is device operations, where the trusted scope is the <em>device&apos;s</em>{' '}
          school, not the session&apos;s.
        </p>
      </Box>

      <h2>2. Student admission</h2>

      <Diagram caption="The canonical create-a-record flow. Note where the transaction boundary sits.">
{`  AdmissionForm (client)
     │  POST /api/students
     ▼
  middleware ─── session cookie present
     │
     ▼
  route.ts
     ├─ getSessionSchoolId()              → schoolId
     ├─ authorize('learners.students.manage')
     ├─ validate: names, admission no, class, guardians
     │
     ▼  withTransaction()
     ├─ INSERT people          → person_id      the HUMAN
     ├─ INSERT students        → student_id     the LEARNER at this school
     ├─ INSERT enrollments     → class + term   WHERE they sit, this term
     └─ INSERT guardian contacts
     ▼  commit
     │
     ├─ logAudit('STUDENT_CREATED', …)
     ├─ reindexEntity(schoolId,'student',id)   fire-and-forget → search
     └─ emit('learner.admitted', …)            fire-and-forget → SMS
     │
     ▼
  201 → client mutate('/api/students') → list refreshes`}
      </Diagram>

      <Box kind="tip" title="Why three tables and not one">
        <p>
          <strong>person</strong> is the human. <strong>student</strong> is that human as a learner at this
          school. <strong>enrolment</strong> is where they sat, in a given term.
        </p>
        <p>
          Separating them is what allows a whole class to be promoted without losing a single historical mark,
          and why last year&apos;s report card still names last year&apos;s class. Collapsing them —
          which looks simpler — would make history unrepresentable.
        </p>
      </Box>

      <Box kind="warning" title="Fire-and-forget really means it">
        <p>
          Search indexing and SMS must not be awaited inside the transaction, and must not fail the request.
          An admission that succeeds but returns 500 because an SMS provider was slow is a far worse outcome
          than a learner who is briefly unsearchable.
        </p>
      </Box>

      <h2>3. An attendance punch</h2>

      <p>
        The one lifecycle that does <strong>not</strong> start in a browser. A device initiates it, and there
        is no user session anywhere in the flow.
      </p>

      <Diagram caption="Device → DRAIS. Authentication is the device serial, not a cookie.">
{`  ZKTeco device (gate)
     │  learner scans; device matches locally → PIN
     │  POST /api/zk-handler   (ADMS protocol, device serial identifies it)
     ▼
  zk-handler
     ├─ resolve device by serial     → device.school_id   ← TRUSTED SCOPE
     │                                  (NOT a session — there is none)
     ├─ record raw event  ─────────────────────────────────────────────┐
     │     punch_at = ACTUAL SERVER INSTANT                            │
     │     dedup key uses the DEVICE-REPORTED time                     │
     │     append-only: never updated, never deleted                   │
     └──────────────────────────────────────────────────────────────────┘
     │
     ├─ resolve identity: (school, serial, PIN) → biometric_enrollments
     │     hit  → person
     │     miss → pending_device_users   ← queued, NOT guessed
     │
     ├─ evaluate against school policy → attendance_records (present/late)
     ├─ notifyAdmsAttendance() → comm dispatcher → guardian SMS (async)
     └─ live popup surfaces it (poll-driven, not push — see below)`}
      </Diagram>

      <Table
        head={['Decision', 'Why']}
        rows={[
          [<><code>punch_at</code> is the server instant</>, <>Field devices have been observed hours fast. Trusting device wall time would file arrivals on the wrong day.</>],
          [<>Dedup keys on the <em>device-reported</em> time</>, <>The device re-sends the same record with its own timestamp; that is the stable identity of the event.</>],
          [<>Raw events are append-only</>, <>They are the evidence a school shows a ministry. A correction re-attributes; it never rewrites.</>],
          [<>An unmatched PIN is queued</>, <>Auto-mapping on a near-match once forked duplicate learners who then accrued attendance. Only a deterministic match maps automatically.</>],
          [<>Scope is the device&apos;s school</>, <>A live test exposed cross-school contamination from using the session&apos;s school instead.</>],
        ]}
      />

      <Box kind="warning" title="Live attendance is poll-bound, not push-bound">
        <p>
          The in-process event bus does not cross serverless instances, so the popup cannot be pushed to from
          the ingest lambda. Latency is <em>ingest + poll interval</em>. Do not &quot;fix&quot; this with an
          in-memory emitter — it will work in the desktop build and silently do nothing in production.
        </p>
      </Box>

      <h2>4. Report card generation</h2>

      <p>The most consequential flow in DRAIS: it produces a document parents keep for years.</p>

      <Diagram caption="Generation reads live data once. Rendering never does.">
{`  ══ GENERATION (once) ═════════════════════════════════════════════════════
  POST /api/snapshots
     ├─ acquire single-flight slot     uk_inflight UNIQUE(school,term,year,type)
     │     a second concurrent run is REJECTED, not queued
     ├─ fetch school + term + result-type metadata
     ├─ ONE pre-sorted query for all results
     ├─ group class → student; normalise Arabic → Western numerals
     ├─ rank per class    (ties: total → average → lastName → firstName → id)
     ├─ apply grading scale; resolve comments
     ├─ hash canonical bytes → meta.dataHash
     └─ persist report_snapshots.snapshot_json      ← FROZEN
                                    │
  ══ RENDER (many times) ══════════ │ ══════════════════════════════════════
  GET /print or /pdf                ▼
     ├─ load snapshot  ────────── reads ONLY the snapshot, never live tables
     ├─ load DRCE document (school-authored layout)
     ├─ apply per-student overrides   (transforms the DOCUMENT, not the data)
     ├─ render → HTML  → browser print, or puppeteer → PDF
     └─ QR carries an HMAC verify token`}
      </Diagram>

      <Box kind="invariant" title="Determinism is the product, not a nicety">
        <p>
          Same snapshot in, identical bytes out. That is why nothing in the render path may call{' '}
          <code>Date.now()</code>, <code>Math.random()</code>, or iterate an unsorted collection. Break it and
          a reprint no longer matches the copy the parent is holding — with no way to tell which is right.
        </p>
      </Box>

      <Box kind="warning" title="The one documented exception">
        <p>
          Overall comments (class teacher / DOS / headteacher) are re-resolved at print time so that
          per-template comment rules can apply. Everything else stays frozen. It is argued in full in ADR-0007
          — cite it as precedent, do not copy the pattern.
        </p>
      </Box>

      <h2>Where these flows go wrong</h2>

      <Table
        head={['Symptom', 'Stage', 'Cause']}
        rows={[
          [<>Cross-tenant data appears</>, '3a', <><code>schoolId</code> taken from the request instead of the session.</>],
          [<>403 for a user who should have access</>, '3b / 3c', <>Missing permission, or a disabled module (which no one bypasses).</>],
          [<>Half-written records</>, '5', <>Multi-table write without <code>withTransaction()</code>.</>],
          [<>&quot;Who changed this?&quot; unanswerable</>, '6', <>Mutation shipped without <code>logAudit</code>.</>],
          [<>Request 500s on a slow SMS provider</>, '7', <>A side effect was awaited instead of fired and forgotten.</>],
          [<>UI shows stale data after a write</>, '8', <>No <code>mutate(key)</code>.</>],
          [<>Works locally, dead in production</>, '7', <>Depends on the in-memory event bus crossing instances.</>],
        ]}
      />

      <Source path="middleware.ts">Stage 2.</Source>
      <Source path="src/lib/snapshots/README.md">Generation pipeline and determinism rules.</Source>
      <Source path="src/lib/ingestion/README.md">Punch intake and dedup.</Source>

      <SeeAlso slugs={['security', 'module-attendance', 'module-reports', 'playbook-api']} />
    </ControlDoc>
  );
}
