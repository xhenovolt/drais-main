'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso } from '../ControlDoc';
import { LessonIntro, Concept, Evolution, Exercise, SelfCheck } from '../Lesson';

export default function Page() {
  return (
    <ControlDoc slug="learn-nextjs">
      <LessonIntro
        level="Foundation"
        prereqs="React, taught from DRAIS."
        teaches={['file-based routing', 'page.tsx', 'layout.tsx', 'route.ts', 'dynamic segments', 'await params', 'middleware', 'Edge vs Node runtime', "'use client'"]}
        outcome={<>Find any screen or endpoint from its URL, add either one, and explain why authentication cannot live in middleware.</>}
      />

      <p>
        Next.js is React plus a router, a server, and a build. In DRAIS that means{' '}
        <strong>248 pages and 691 route handlers</strong> arranged by folder — the folder structure{' '}
        <em>is</em> the URL structure.
      </p>

      <h2>Three magic filenames</h2>

      <Table
        head={['File', 'Becomes', 'Runs']}
        rows={[
          [<code>page.tsx</code>, <>A visitable URL</>, <>Browser (in DRAIS, always <code>&apos;use client&apos;</code>)</>],
          [<code>layout.tsx</code>, <>A wrapper around everything below it</>, <>Browser</>],
          [<code>route.ts</code>, <>An HTTP endpoint</>, <><strong>Server only.</strong> Never shipped to the browser.</>],
        ]}
      />

      <Diagram caption="Folder path = URL path. There is no route table to maintain.">
{`  src/app/dashboard/page.tsx                → /dashboard
  src/app/students/list/page.tsx            → /students/list
  src/app/students/[id]/page.tsx            → /students/42
  src/app/api/students/route.ts             → /api/students
  src/app/api/students/[id]/route.ts        → /api/students/42
  src/app/students/layout.tsx               → wraps EVERY /students/* page`}
      </Diagram>

      <Box kind="tip" title="This is how you navigate 939 files">
        <p>
          Given a URL, you know the file. Given a file, you know the URL. When a school reports a problem on{' '}
          <code>/attendance/logs</code>, the page is <code>src/app/attendance/logs/page.tsx</code> and its data
          is whatever it fetches from <code>src/app/api/attendance/…</code>. No searching.
        </p>
      </Box>

      <h2>Layouts nest</h2>

      <p>DRAIS has 13 layouts. They compose from the outside in:</p>

      <Diagram>
{`  src/app/layout.tsx              ← root: every provider, the staff shell
      └ src/app/students/layout.tsx     ← anything /students/*
            └ src/app/students/list/page.tsx

  Also: /control, /portal, /parent, /auth, /academics, /finance,
        /settings, /attendance, /tahfiz, /inventory, /(protected)`}
      </Diagram>

      <Concept name="Why /control and /portal have their own layout">
        <p>
          They belong to <strong>different auth domains</strong> and need different chrome — the Control Center
          is dark operator chrome, the parent portal must not show staff navigation.
        </p>
        <p>
          But note: a nested layout does <strong>not</strong> replace the root layout, it nests inside it. So
          the root provider tree — including <code>AuthContext</code> — still runs on <code>/control</code>.
          That is exactly why the Control Center login broke when the exemption list drifted.
        </p>
      </Concept>

      <Concept name="(protected) — a route group">
        <p>
          Parentheses mean &quot;organise, do not affect the URL&quot;. <code>src/app/(protected)/</code> groups
          pages so they can share a layout, without adding <code>/protected</code> to any URL.
        </p>
      </Concept>

      <h2>Dynamic segments</h2>

      <pre><code>{`// src/app/api/students/[id]/route.ts
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const resolvedParams = await params;      // ← Next 15: params is a PROMISE
  const { id } = resolvedParams;
  if (!id) return NextResponse.json({ success: false, message: 'Student ID is required.' }, { status: 400 });
  …
}`}</code></pre>

      <Box kind="warning" title="params is a Promise in Next 15">
        <p>
          You must <code>await</code> it. Forgetting produces <code>undefined</code> rather than an error,
          because <code>{'{ id }'}</code> destructured from a Promise is simply not there — so the check falls
          through to &quot;ID is required&quot; and the route looks broken for no visible reason.
        </p>
        <p>
          <code>withRoute</code> awaits it for you, which is one reason to prefer the wrapper.
        </p>
      </Box>

      <Box kind="invariant" title="A dynamic segment is user input">
        <p>
          <code>/api/students/42</code> and <code>/api/students/999999</code> are the same route. The id is a
          string from the URL — <strong>never proof of ownership</strong>.
        </p>
        <p>
          Every such route must confirm the row belongs to the session&apos;s school. A permission saying
          &quot;may edit learners&quot; does not say &quot;may edit <em>this</em> learner&quot;.
        </p>
      </Box>

      <h2>Route handlers</h2>

      <p>
        Export a function named for the HTTP method. That is the entire API. It runs on the server and is never
        sent to the browser — so it can hold secrets and query the database directly.
      </p>

      <pre><code>{`export async function GET(req: NextRequest)  { … }
export async function POST(req: NextRequest) { … }
export async function PATCH(req: NextRequest){ … }
export async function DELETE(req: NextRequest){ … }`}</code></pre>

      <Concept name="export const runtime = 'nodejs'" from="218 routes declare it">
        <p>Next.js can run server code in two places:</p>
        <Table
          head={['', 'Edge', 'Node']}
          rows={[
            ['Starts', 'Very fast', 'Slower'],
            ['Node APIs', <>No — no <code>fs</code>, no <code>crypto</code> modules, <strong>no database driver</strong></>, <>Yes</>],
            ['Used by', <>middleware</>, <>route handlers touching the DB</>],
          ]}
        />
        <p>
          A route that queries TiDB or uses <code>node:crypto</code> <strong>must</strong> declare{' '}
          <code>runtime = &apos;nodejs&apos;</code>. 218 routes in DRAIS do.
        </p>
        <p>
          <code>maxDuration</code> extends the timeout — but if work can exceed the limit at all, it belongs in
          a step loop or a job, not a longer request.
        </p>
      </Concept>

      <h2>Middleware</h2>

      <p>
        One file at the repository root, running before <em>every</em> matched request.
      </p>

      <Source path="middleware.ts" />

      <Evolution
        stages={[
          {
            verdict: 'bad',
            label: 'Authenticate in middleware',
            code: `export function middleware(req: NextRequest) {
  const token = req.cookies.get('drais_session')?.value;
  const session = await db.query('SELECT … FROM sessions WHERE token = ?', [token]);
  if (!session) return redirect('/login');       // ❌ impossible
}`,
            why: <><strong>This cannot work.</strong> Middleware runs on the Edge runtime, which has no database driver. Attempting it produces either a build failure or, worse, something that looks like authentication and is not.</>,
          },
          {
            verdict: 'best',
            label: 'Presence at the edge, validation in the handler — what DRAIS does',
            code: `// middleware.ts — Edge. Cookie PRESENCE only.
const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
if (!sessionToken) {
  return isApiRoute ? createApiError('Unauthorized', 'UNAUTHORIZED', 401)
                    : createRedirect(request, '/login');
}

// route.ts — Node. The REAL check.
const session = await getSessionSchoolId(req);
if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });`,
            why: <>Middleware cheaply turns away requests with no cookie at all. The handler does the real validation against the database. <strong>Both are required</strong> — and a handler that skips its check because &quot;middleware already ran&quot; is unauthenticated, because middleware never validated anything.</>,
          },
        ]}
      />

      <Box kind="invariant" title="Middleware is a filter, not a gate">
        <p>
          It also handles the public-route exemption list, the forced-password-reset redirect, and a coarse
          role check from a cookie. None of that is authentication.
        </p>
      </Box>

      <h2>&apos;use client&apos;</h2>

      <p>
        Next.js App Router defaults to server components. <strong>DRAIS does not use them</strong> — nearly
        every page starts with <code>&apos;use client&apos;</code>.
      </p>

      <Concept name="Why DRAIS is client-rendered throughout" from="ADR-0014">
        <p>
          Almost every screen is stateful and session-scoped: mark sheets with inline editing, live attendance,
          the report designer. There is no shared cache between users, so the main server-rendering win does not
          apply — and mixing the two creates two mental models for fetching, auth and errors.
        </p>
        <p>
          <strong>Follow the convention.</strong> A lone server component means the next person has to work out
          which kind they are looking at before they can read it.
        </p>
      </Concept>

      <Box kind="warning" title="What 'use client' does not mean">
        <p>
          It does <em>not</em> mean &quot;runs only in the browser&quot; — client components still render once on
          the server for the initial HTML. It means &quot;this may use state, effects and browser APIs&quot;.
        </p>
        <p>
          So code touching <code>window</code> or <code>localStorage</code> at module scope still breaks. Put it
          in an effect, or guard with <code>typeof window === &apos;undefined&apos;</code> — which is what{' '}
          <code>useThemeStore</code> does.
        </p>
      </Box>

      <h2>Finding your way</h2>

      <Table
        head={['You have', 'You want', 'Do this']}
        rows={[
          [<>A URL</>, <>The page</>, <><code>src/app</code> + path + <code>/page.tsx</code></>],
          [<>A page</>, <>Its data</>, <>Search the file for <code>useSWR</code> / <code>apiFetch</code>; the URL is the route path.</>],
          [<>An endpoint</>, <>Its logic</>, <>Follow the route&apos;s imports into <code>src/lib/&lt;subsystem&gt;/</code>.</>],
          [<>A bug on one screen</>, <>The layer at fault</>, <>Page → route → service → SQL, in that order.</>],
        ]}
      />

      <Exercise
        n={1}
        title="Map a feature without searching"
        objective={<>Pick <code>/attendance/logs</code>. Using only the folder convention, find the page, the routes it calls, and the subsystem those routes import.</>}
        hints={<>The page is exactly where the URL says. Its fetch URLs tell you the route files.</>}
        mistakes={<>Reaching for a global search first. The point is to internalise the convention — it is faster.</>}
      />

      <Exercise
        n={2}
        title="Add a dynamic route"
        objective={<>Create <code>src/app/api/terms/[id]/summary/route.ts</code> returning a summary for one term. Authenticate, authorise, await <code>params</code>, and confirm the term belongs to the session&apos;s school.</>}
        hints={<>Model it on <code>src/app/api/students/[id]/route.ts</code>. Remember <code>runtime = &apos;nodejs&apos;</code>.</>}
        mistakes={
          <ul className="list-disc pl-5 space-y-1">
            <li>Not awaiting <code>params</code> — the id is silently <code>undefined</code>.</li>
            <li>Trusting the id. Another school&apos;s term id is a valid-looking number.</li>
            <li>Omitting the runtime declaration, then wondering why the driver fails.</li>
          </ul>
        }
      />

      <SelfCheck
        questions={[
          {
            q: <>Which file serves <code>/students/42</code>, and which serves <code>/api/students/42</code>?</>,
            a: <p><code>src/app/students/[id]/page.tsx</code> and <code>src/app/api/students/[id]/route.ts</code>.</p>,
          },
          {
            q: <>Why can authentication not happen in middleware?</>,
            a: <p>Middleware runs on the Edge runtime, which has no database driver. It can only check that a cookie is present; validating it requires the sessions table, so the real check is in the handler.</p>,
          },
          {
            q: <>A route works locally and fails on deploy with a driver error. First thing to check?</>,
            a: <p>Whether it declares <code>export const runtime = &apos;nodejs&apos;</code>.</p>,
          },
          {
            q: <>Does <code>/control</code> having its own layout mean the root providers do not run?</>,
            a: <p>No — layouts nest. The root layout still wraps it, which is why <code>AuthContext</code> runs there and why it needs an exemption list.</p>,
          },
          {
            q: <>A page reads <code>localStorage</code> at the top of the file and crashes on load. Why, given it is <code>&apos;use client&apos;</code>?</>,
            a: <p>Client components still render once on the server, where <code>localStorage</code> does not exist. Move it into an effect or guard on <code>typeof window</code>.</p>,
          },
        ]}
      />

      <SeeAlso slugs={['learn-async', 'request-lifecycle', 'security', 'playbook-api']} />
    </ControlDoc>
  );
}
