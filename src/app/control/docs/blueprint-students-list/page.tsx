'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso } from '../ControlDoc';

export default function Page() {
  return (
    <ControlDoc slug="blueprint-students-list">
      <p>
        <strong>3,155 lines and 48.7 kB of client bundle — the largest page in DRAIS.</strong> Read it once and
        you will recognise the shape of every list screen in the system: filters, a table, inline edit, bulk
        actions, import/export, and a stack of modals.
      </p>

      <p>
        This blueprint is deliberately honest about the parts that are <em>not</em> exemplary. A page this size
        accumulates history, and knowing which parts to copy matters more than the tour.
      </p>

      <Source path="src/app/students/list/page.tsx" />

      <h2>Why this page exists</h2>

      <p>
        It is the school&apos;s working view of its learners, and in practice the hub for most learner
        operations — staff start here rather than at a profile. That is why so much has accreted onto it:
        fingerprint enrolment, device sync, bulk SMS, photo upload, import, class reassignment, quick edit.
      </p>

      <h2>Anatomy</h2>

      <Diagram caption="The structure every DRAIS list page shares.">
{`  ┌ header ─────────────────────────────────────────────────────────┐
  │  title · counts · primary actions (Admit, Import, Export)        │
  ├ tabs ───────────────────────────────────────────────────────────┤
  │  Enrolled  |  Admitted        ← two datasets, one screen         │
  ├ filters ────────────────────────────────────────────────────────┤
  │  search · class · year · gender                                  │
  ├ bulk bar (appears on selection) ────────────────────────────────┤
  │  status · reassign class · SMS · delete · enrol fingerprint      │
  ├ table ──────────────────────────────────────────────────────────┤
  │  checkbox · photo · name (inline-editable) · class · actions     │
  ├ pagination ─────────────────────────────────────────────────────┤
  │  PAGE_SIZE = 50, CLIENT-SIDE slice                               │
  └─────────────────────────────────────────────────────────────────┘
     modals: QuickEdit · Snapshot · BulkSms · Import · BulkPhoto
             FolderPhoto · ReassignClass · DeviceSelector · SyncDevice`}
      </Diagram>

      <h2>Data flow</h2>

      <p>
        Reference data loads in parallel on mount — classes, streams, programs, study modes, academic years,
        terms — each with <code>{'{ silent: true }'}</code> so background loads do not fire success toasts.
      </p>

      <pre><code>{`await Promise.all([
  apiFetch('/api/classes',        { silent: true }),
  apiFetch('/api/streams',        { silent: true }),
  apiFetch('/api/programs',       { silent: true }),
  apiFetch('/api/study-modes',    { silent: true }),
  apiFetch('/api/academic_years', { silent: true }),
  apiFetch('/api/terms',          { silent: true }),
]);`}</code></pre>

      <h3>apiFetch — the mandated wrapper</h3>

      <Box kind="invariant" title="All client-side API calls must go through apiFetch. Direct fetch() is forbidden.">
        <p>
          It guarantees a success toast on every mutation, an error toast on every failure, consistent JSON
          parsing, and it <strong>throws</strong> on failure so callers must handle it. That is the mechanism
          behind the &quot;zero silent failures&quot; standard on the client side.
        </p>
        <p>Pass <code>{'{ silent: true }'}</code> for background reads that should not toast.</p>
      </Box>

      <Box kind="warning" title="Stated policy, partial adoption">
        <p>
          <code>apiFetch</code> appears in <strong>34 files</strong>, while raw <code>fetch</code> appears in
          roughly <strong>122 pages</strong>. The rule is real and correct; the codebase has not caught up.
        </p>
        <p>
          Write new code with <code>apiFetch</code>. When you touch an old file that uses raw{' '}
          <code>fetch</code>, converting it is a cheap, low-risk improvement — you gain error surfacing for free.
        </p>
      </Box>

      <h2>What to copy, and what not to</h2>

      <Table
        head={['Aspect', 'Verdict']}
        rows={[
          [<><code>apiFetch</code> with <code>silent</code> for background reads</>, <><strong>Copy.</strong> The intended pattern.</>],
          [<>Parallel reference-data load on mount</>, <><strong>Copy.</strong> Six sequential awaits would be six round trips.</>],
          [<>Modal components extracted to <code>src/components/students/</code></>, <><strong>Copy.</strong> It is the only reason the file is 3,155 lines rather than 8,000.</>],
          [<>Local <code>useState</code> for server data</>, <><strong>Do not copy.</strong> Predates the SWR convention — you lose caching, revalidation and <code>mutate</code>.</>],
          [<><strong>Client-side pagination</strong></>, <><strong>Do not copy.</strong> See below — this is the significant one.</>],
          [<>~25 <code>useState</code> declarations in one component</>, <><strong>Do not copy.</strong> Group related state into a reducer or extract sub-components.</>],
          [<>No page-level permission gating</>, <><strong>Do not copy.</strong> Enforcement is server-side, but the UI should still hide actions a user cannot perform.</>],
        ]}
      />

      <h2>The pagination problem</h2>

      <pre><code>{`const PAGE_SIZE = 50;
const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
const pageData   = filteredData.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);`}</code></pre>

      <Box kind="warning" title="Every learner is loaded into memory, then 50 are shown">
        <p>
          Filtering and paging happen entirely on the client. For a school of 400 that is fine and the
          interaction feels instant. For a school of several thousand it means a large payload, a large parse,
          and 48.7 kB of bundle doing work the database should do.
        </p>
        <p>
          <strong>New list screens should paginate and filter server-side.</strong> This page works, and
          converting it is a real piece of work rather than a tidy-up — but do not treat it as the model.
        </p>
      </Box>

      <p>
        Note that <code>usePagination()</code> is the same in-memory approach. It is appropriate for a few
        hundred rows and wrong for an unbounded list.
      </p>

      <h2>Bulk actions</h2>

      <p>
        Selection is a <code>Set&lt;number&gt;</code> of ids, and the bulk bar appears only when it is
        non-empty. The backing routes are extensive: <code>bulk/enroll</code>,{' '}
        <code>bulk/enroll-sse</code>, <code>bulk-assign-class</code>, <code>bulk/delete</code>,{' '}
        <code>bulk/status</code>, <code>bulk-photo-upload</code>.
      </p>

      <Box kind="invariant" title="Three rules for any bulk action">
        <ol className="list-decimal pl-5 space-y-1">
          <li><strong>Confirm destructive operations</strong> with the count in the prompt — &quot;Delete 47 learners?&quot;, not &quot;Are you sure?&quot;.</li>
          <li><strong>Report per-row outcomes.</strong> &quot;437 of 450 succeeded&quot; with the 13 named is actionable; &quot;Done&quot; is not.</li>
          <li><strong>Emit progress</strong> for anything long — silent long operations are treated as a defect. SSE exists here for exactly this.</li>
        </ol>
      </Box>

      <h2>Inline editing</h2>

      <p>
        Name and gender are editable in place, tracked by{' '}
        <code>{'{ studentId, field }'}</code> plus a draft value. Cheap for the user, and correct as long as the
        write goes through the normal audited route — an inline edit is still a mutation and still needs its
        audit entry.
      </p>

      <Box kind="note" title="A dead import worth knowing about">
        <p>
          <code>useOptimistic</code> and <code>useTransition</code> are imported at the top of the file, and{' '}
          <code>useOptimistic</code> is <strong>never called</strong>. Optimistic updates were started and not
          finished. Harmless, but do not infer from the import that the page does optimistic updates — it does
          not.
        </p>
      </Box>

      <h2>Safely extending this page</h2>

      <Table
        head={['You want to add…', 'Do this']}
        rows={[
          [<>A column</>, <>Add to the table header and row. Check it renders in both themes, and that it does not push the table into horizontal overflow on a phone — staff use phones at the gate.</>],
          [<>A filter</>, <>Add the state and fold it into <code>filteredData</code>. <strong>Reset <code>page</code> to 1</strong> when it changes, or the user lands on an empty page 7.</>],
          [<>A bulk action</>, <>Add to the bulk bar, follow the three rules above, and make the route idempotent — a retried bulk call must not double-apply.</>],
          [<>A modal</>, <>New component in <code>src/components/students/</code>. Do not inline it; that is how a 3,155-line file becomes a 4,000-line file.</>],
          [<>A row action</>, <>Consider the actions menu rather than another always-visible button. The row is already dense.</>],
          [<>An export column</>, <><code>useExport()</code>. Do not build a second CSV path.</>],
        ]}
      />

      <Box kind="warning" title="The four things forgotten on this page specifically">
        <ol className="list-decimal pl-5 space-y-1">
          <li><strong>Reset pagination when a filter changes.</strong></li>
          <li><strong>Clear the selection</strong> after a bulk action, or stale ids linger in the <code>Set</code>.</li>
          <li><strong>Translate the new string</strong> into both <code>en.json</code> and <code>ar.json</code>.</li>
          <li><strong><code>dark:</code> variants.</strong> A new cell with no dark variant is invisible to half the users.</li>
        </ol>
      </Box>

      <h2>What this page teaches about list screens generally</h2>

      <ol>
        <li><strong>Extract modals early.</strong> The single biggest factor in whether a list page stays readable.</li>
        <li><strong>Decide pagination at the start.</strong> Retrofitting server-side pagination onto client-side filtering is a rewrite.</li>
        <li><strong>Load reference data in parallel, silently.</strong></li>
        <li><strong>Bulk actions need confirmation, per-row results and progress</strong> — all three, every time.</li>
        <li><strong>The list becomes the hub.</strong> Plan for actions to accumulate; put them behind a menu before the row runs out of room.</li>
      </ol>

      <SeeAlso slugs={['frontend', 'playbook-page', 'module-students', 'hooks']} />
    </ControlDoc>
  );
}
