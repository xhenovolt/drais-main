'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="system-map">
      <p>
        Before any architecture, the measured shape of what you have inherited. Every number here was counted
        from the repository, not estimated — so you can calibrate how much of the system any one change
        touches, and how much of it you will never need to read.
      </p>

      <Box kind="note" title="Counted, not guessed">
        <p>
          Figures below are from a direct inventory of <code>src/</code> and <code>database/</code>. They will
          drift as the system grows; re-run the counts rather than trusting a stale number in a document. The
          commands are given at the end of this page.
        </p>
      </Box>

      <h2>Scale</h2>

      <Table
        head={['Measure', 'Count', 'What it means for you']}
        rows={[
          [<>TypeScript / TSX lines</>, <strong>~307,000</strong>, <>Too large to read. You will always be working in a slice — find the slice, read its README, ignore the rest.</>],
          [<>Pages (<code>page.tsx</code>)</>, <strong>248</strong>, <>The user-facing surface. Roughly one per screen.</>],
          [<>API routes (<code>route.ts</code>)</>, <strong>691</strong>, <>The real backend. Almost all business logic is reachable from here.</>],
          [<>React components</>, <strong>300</strong>, <>Organised by domain folder, not by type.</>],
          [<>Library modules (<code>src/lib</code>)</>, <strong>347</strong>, <>Where the logic actually lives. 23 folders carry a README.</>],
          [<>Custom hooks</>, <strong>14</strong>, <>Deliberately few. Most data fetching is SWR at the call site.</>],
          [<>React contexts</>, <strong>4</strong>, <>Also deliberately few. See Frontend architecture.</>],
          [<>Layouts</>, <strong>13</strong>, <>One root, plus per-area shells (control, portal, parent, academics…).</>],
          [<>SQL migrations</>, <strong>39</strong>, <>Numbered, forward-only.</>],
          [<>Database tables</>, <strong>~330</strong>, <>Documented in the table dictionary. You will care about perhaps fifteen.</>],
        ]}
      />

      <Box kind="tip" title="The ratio that tells you the most">
        <p>
          691 API routes against 248 pages. DRAIS is <strong>backend-heavy</strong>: most screens are thin, and
          most complexity is behind a route handler. When something behaves oddly, the answer is far more often
          in <code>src/app/api/…</code> or <code>src/lib/…</code> than in a component.
        </p>
      </Box>

      <h2>Where the weight sits</h2>

      <p>
        Route and page counts per top-level area. This is the honest map of where the system&apos;s complexity
        actually is — which is not always where the product conversation suggests.
      </p>

      <Table
        head={['Area', 'API routes', 'Pages', 'Notes']}
        rows={[
          [<strong>attendance</strong>, '90', '22', <>The largest module by a wide margin. Devices, identity, health, logs, recovery.</>],
          [<strong>students</strong>, '64', '19', <>Admission through to leaving, plus import, ID cards, trash.</>],
          [<strong>admin</strong>, '62', '20', <>Users, roles, staff, trash, audit, devices, templates, parents.</>],
          [<strong>finance</strong>, '56', '24', <>Most pages of any area. Fees, payments, budgets, clearance.</>],
          [<strong>tahfiz</strong>, '29', '13', <>Qur&apos;an memorisation — a full vertical, module-gated.</>],
          [<strong>control-center</strong>, '28', '20', <>The Xhenvolt operator console. Separate auth domain.</>],
          [<strong>platform</strong>, '19', '—', <>External API v1. No UI: it is a machine interface.</>],
          [<strong>portal / parent</strong>, '30', '10', <>Two parent-facing surfaces, both isolation-gated.</>],
          [<strong>academics</strong>, '11', '22', <>Page-heavy, route-light — most academic logic sits in <code>src/lib</code>.</>],
        ]}
      />

      <h2>The shape of a request</h2>

      <Diagram caption="Every school-facing request follows this path. Deviations are the interesting part.">
{`  browser
     │
     ▼
  middleware.ts ──────────── cookie presence, public-route exemption, RBAC prefix guard
     │                       (Edge runtime — no DB access here)
     ▼
  app/layout.tsx ─────────── provider tree, staff shell (or bypass for control/portal/print)
     │
     ▼
  page.tsx ───────────────── client component; fetches via SWR
     │
     ▼
  app/api/**/route.ts ────── session → permission → module gate → validation
     │
     ▼
  src/lib/<subsystem> ────── the actual business logic
     │
     ▼
  src/lib/db ─────────────── TiDB (or local MySQL in desktop mode)
     │
     ▼
  audit log · notification · SWR revalidation → UI`}
      </Diagram>

      <h2>The four surfaces</h2>

      <Table
        head={['Surface', 'Route prefix', 'Auth', 'Who it is for']}
        rows={[
          ['School app', <code>/(protected)</code>, <code>drais_session</code>, 'Staff'],
          ['Parent portal', <><code>/portal</code>, <code>/parent</code></>, <code>drais_parent_session</code>, 'Guardians'],
          ['Control Center', <code>/control</code>, <code>drais_control</code>, 'Xhenvolt operators'],
          ['Platform API', <code>/api/platform/v1</code>, <>Bearer <code>keyId:secret</code></>, 'Other systems (JETON)'],
        ]}
      />

      <Box kind="invariant">
        <p>
          These share <strong>no authentication code and no session tables</strong>. That is the property the
          design depends on, and the reason the duplication between them is deliberate rather than technical
          debt.
        </p>
      </Box>

      <h2>Ship targets</h2>

      <Table
        head={['Target', 'Mechanism', 'What differs']}
        rows={[
          ['Web', 'Vercel', 'The primary target. Serverless — see the constraints in Architecture overview.'],
          ['Desktop', 'Electron', 'Can run against a local MySQL. Single process, so in-memory state is actually shared.'],
          ['Android', 'Capacitor + nodejs-mobile-cordova', 'Embeds the server. A separate native Expo client exists as a distinct edition.'],
        ]}
      />

      <h2>Documentation already in the repository</h2>

      <Table
        head={['Location', 'Count', 'Status']}
        rows={[
          [<code>docs/adr/</code>, '12 + template', <>Current. The most valuable documentation in the repo.</>],
          [<code>src/lib/*/README.md</code>, '23', <>Current. Closest to the code; most likely to be right.</>],
          [<code>docs/guides/</code>, '15', <>Mostly current. Procedures you can follow.</>],
          [<code>docs/audits/</code>, '28', <><strong>Findings, not specifications.</strong> Check the date against <code>git log</code> before acting.</>],
          [<code>docs/releases/</code>, '54', <>Stops at v1.133.0; the git log is authoritative beyond that. A known, deliberate gap.</>],
          [<code>docs/archive/</code>, '48', <><strong>Nothing here is current.</strong> Kept for forensic history only.</>],
        ]}
      />

      <Box kind="warning" title="17 of 40 src/lib folders still have no README">
        <p>
          Uncovered: <code>academics</code>, <code>academic</code>, <code>admissions</code>,{' '}
          <code>issuance</code>, <code>export</code>, <code>i18n</code>, <code>datetime</code>,{' '}
          <code>utils</code> and the smaller single-file folders. Write one when you next work in them —
          the pattern is established in the 23 that exist.
        </p>
      </Box>

      <h2>What you can safely ignore</h2>

      <p>
        A large repository is mostly irrelevant to any given task. Specifically:
      </p>

      <ul>
        <li><strong><code>docs/archive/</code></strong> — superseded by definition.</li>
        <li><strong>Emergency report templates under <code>backup/</code></strong> — load-bearing but frozen. Do not refactor them.</li>
        <li><strong><code>src/lib/services/</code></strong> — a mixed legacy folder, not a subsystem. New code goes in its domain folder.</li>
        <li><strong>Duplicate-looking route trees</strong> (<code>class_results</code> vs <code>class-results</code>, <code>workplans</code> vs <code>work-plans</code>) — historical; check <code>git log</code> before assuming either is dead.</li>
      </ul>

      <h2>Re-running this inventory</h2>

      <pre><code>{`find src/app -name 'page.tsx' | wc -l          # pages
find src/app/api -name 'route.ts' | wc -l      # API routes
find src/components -name '*.tsx' | wc -l      # components
find src/lib -name '*.ts' | wc -l              # lib modules
ls database/migrations/tidb/*.sql | wc -l      # migrations
ls src/lib/*/README.md | wc -l                 # documented subsystems

# where the weight sits
find src/app/api -name route.ts | sed 's|src/app/api/||;s|/route.ts||' \\
  | cut -d/ -f1 | sort | uniq -c | sort -rn | head -20`}</code></pre>

      <Source path="docs/README.md">Indexes every subsystem README and names the ones still missing.</Source>
      <Source path="docs/database/TABLE_DICTIONARY.md">The ~330 tables.</Source>

      <SeeAlso slugs={['architecture', 'subsystems', 'security', 'request-lifecycle']}>
        Start with Architecture overview — it explains why the odd parts of this map are the way they are.
      </SeeAlso>
    </ControlDoc>
  );
}
