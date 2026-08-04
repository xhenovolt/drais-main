'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, Diagram, SeeAlso } from '../ControlDoc';
import { LessonIntro, Concept, Exercise, SelfCheck } from '../Lesson';

export default function Page() {
  return (
    <ControlDoc slug="learn-capstone">
      <LessonIntro
        level="Advanced"
        prereqs="Every earlier lesson. This assembles all of them."
        teaches={['vertical slice', 'migration', 'service layer', 'route', 'page', 'navigation', 'i18n', 'verification']}
        outcome={<>Ship a complete feature to DRAIS standards without asking anyone which step comes next.</>}
      />

      <p>
        One feature, every layer, nothing implicit. The brief is deliberately small so the{' '}
        <strong>process</strong> is the lesson rather than the domain.
      </p>

      <Box kind="note" title="The brief">
        <p>
          <strong>Class Notices.</strong> A teacher pins a short notice to a class for a term — &quot;bring PE
          kit on Fridays&quot;. Staff with the right permission can add, list and remove them.
        </p>
      </Box>

      <h2>Step 0 — Decide before you type</h2>

      <Table
        head={['Question', 'Answer for this feature', 'Why it matters']}
        rows={[
          ['Tenant-scoped?', <><strong>Yes</strong> — <code>school_id</code></>, <>Without it the table is invisible to backups and exports.</>],
          ['Soft-deletable?', <><strong>Yes</strong> — staff will delete by accident</>, <>Determines the lifecycle columns and a trash descriptor.</>],
          ['Keyed on person or student?', <>Neither — class + term</>, <>Wrong key is a silent join bug later.</>],
          ['Log or state?', <><strong>State</strong> — a notice is edited and removed</>, <>Logs are append-only; state rows are updatable. Never mix.</>],
          ['Optional module?', <>No — every school gets it</>, <>Decides whether a module gate is needed.</>],
          ['Searchable?', <>No, for v1</>, <>Otherwise you owe a reindex on every write path.</>],
        ]}
      />

      <Box kind="tip" title="Ten minutes here saves a migration later">
        <p>
          Every one of these is expensive to change once data exists. Answering them in writing is the actual
          senior-engineer habit this capstone is teaching.
        </p>
      </Box>

      <h2>Step 1 — The migration</h2>

      <pre><code>{`-- database/migrations/tidb/041_class_notices.sql

CREATE TABLE IF NOT EXISTS class_notices (
  id            BIGINT       NOT NULL AUTO_INCREMENT,
  school_id     BIGINT       NOT NULL,          -- tenancy
  class_id      BIGINT       NOT NULL,
  term_id       BIGINT       NOT NULL,
  body          VARCHAR(500) NOT NULL,
  created_by    BIGINT       NULL,

  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME     NULL,              -- soft delete
  deleted_by    BIGINT       NULL,
  delete_reason VARCHAR(255) NULL,
  restored_at   DATETIME     NULL,

  PRIMARY KEY (id),
  KEY idx_school_class_term (school_id, class_id, term_id),
  KEY idx_school_deleted (school_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`}</code></pre>

      <Table
        head={['Choice', 'Reason']}
        rows={[
          [<>Index leads with <code>school_id</code></>, <>Every query filters on it; composite indexes are usable left to right.</>],
          [<>Five lifecycle columns</>, <>The trash UI requires all of them in its display select.</>],
          [<><code>VARCHAR(500)</code></>, <>A notice is short. An unbounded <code>TEXT</code> invites pasted essays.</>],
          [<><code>created_by</code> nullable</>, <>A system-generated notice may have no user.</>],
        ]}
      />

      <h2>Step 2 — The service</h2>

      <pre><code>{`// src/lib/notices/service.ts
import { query } from '@/lib/db';

export interface ClassNotice {
  id: number;
  class_id: number;
  term_id: number;
  body: string;
  created_at: string;
  created_by_name: string | null;
}

/** Takes a RESOLVED schoolId — never a session. */
export async function listNotices(
  schoolId: number, classId: number, termId: number,
): Promise<ClassNotice[]> {
  return await query(
    \`SELECT n.id, n.class_id, n.term_id, n.body, n.created_at,
            CONCAT(p.first_name, ' ', p.last_name) AS created_by_name
       FROM class_notices n
       LEFT JOIN users  u ON u.id = n.created_by
       LEFT JOIN people p ON p.id = u.person_id
      WHERE n.school_id = ?  AND n.class_id = ?  AND n.term_id = ?
        AND n.deleted_at IS NULL
      ORDER BY n.created_at DESC\`,
    [schoolId, classId, termId],
  ) as ClassNotice[];
}`}</code></pre>

      <Concept name="Why the service takes schoolId, not a session">
        <p>
          This is the most reusable pattern in DRAIS. A service taking <code>schoolId</code> can be called by a
          school route (session-scoped) <strong>and</strong> a Control Center route (operator picks the school)
          without either sharing auth code with the other.
        </p>
        <p>Passing a session would bind it to school auth and force the Control Center to fabricate one.</p>
      </Concept>

      <Box kind="tip" title="Note the LEFT JOINs">
        <p>
          <code>created_by</code> is nullable, and a user may have been removed. <code>INNER JOIN</code> would
          make those notices <strong>disappear</strong> — the same class of bug as the old term resolver.
        </p>
      </Box>

      <h2>Step 3 — Permissions</h2>

      <pre><code>{`// src/lib/rbac/catalog.ts
p('academics', 'notices', 'view',   'View class notices'),
p('academics', 'notices', 'manage', 'Create and remove class notices'),`}</code></pre>

      <ol>
        <li>Add the two lines.</li>
        <li>Run the catalog sync from the admin UI.</li>
        <li>Add them to the relevant <code>ROLE_DEFAULTS</code> — teachers and admins here.</li>
        <li><code>npm run lint:permissions</code>.</li>
      </ol>

      <h2>Step 4 — The routes</h2>

      <pre><code>{`// src/app/api/academics/notices/route.ts
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);                       // 1
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {                                                                 // 2
    await requirePermission(session.userId, session.schoolId,
                            'academics.notices.view', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  const url     = new URL(req.url);                                     // 3
  const classId = Number(url.searchParams.get('classId'));
  const termId  = Number(url.searchParams.get('termId'));
  if (!classId || !termId) {
    return NextResponse.json(
      { success: false, error: { message: 'classId and termId are required', code: 'MISSING_PARAMS' } },
      { status: 400 },
    );
  }

  try {
    const data = await listNotices(session.schoolId, classId, termId);  // 4
    return NextResponse.json({ success: true, data });                  // 5
  } catch (e) {
    console.error('[academics/notices]', e);                            // 6
    return NextResponse.json(
      { success: false, error: { message: (e as Error).message, code: 'NOTICES_FAILED' } },
      { status: 500 },
    );
  }
}`}</code></pre>

      <Table
        head={['#', 'Step', 'Skip it and…']}
        rows={[
          ['1', 'Authenticate in the handler', <>Unauthenticated — middleware only checked the cookie exists.</>],
          ['2', 'Authorise', <>Anyone signed in can read it.</>],
          ['3', 'Validate input', <><code>NaN</code> reaches SQL.</>],
          ['4', <><code>schoolId</code> from the session</>, <><strong>Cross-tenant read.</strong></>],
          ['5', 'The envelope', <>The client cannot tell success from failure.</>],
          ['6', 'Tagged log + stable code', <>Unfindable in logs; the UI cannot react.</>],
        ]}
      />

      <p>The POST adds two things:</p>

      <pre><code>{`// validate ownership — a classId is user input, not proof
const owned = await query(
  'SELECT 1 FROM classes WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
  [classId, session.schoolId],
);
if (!owned.length) {
  return NextResponse.json(
    { success: false, error: { message: 'Class not found', code: 'NOT_FOUND' } },
    { status: 404 },
  );
}

const created = await createNotice(session.schoolId, { classId, termId, body }, session.userId);

void logAudit({                                    // fire-and-forget, never awaited
  schoolId: session.schoolId, userId: session.userId,
  action: AuditAction.NOTICE_CREATED,
  entityType: 'class_notice', entityId: created.id,
  details: { classId, termId },
  ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
});`}</code></pre>

      <Box kind="invariant" title="Permission ≠ ownership">
        <p>
          <code>academics.notices.manage</code> says the user may manage notices. It does not say{' '}
          <strong>this</strong> class is theirs. Another school&apos;s <code>classId</code> is a valid-looking
          number — verify it belongs to the session&apos;s school.
        </p>
        <p>Returning <strong>404, not 403</strong>, avoids confirming that the id exists elsewhere.</p>
      </Box>

      <h2>Step 5 — Trash descriptor</h2>

      <pre><code>{`// src/lib/trash/registry.ts
{
  code: 'class_notice',
  label: 'Class Notice', pluralLabel: 'Class Notices',
  tableName: 'class_notices',
  primaryKey: 'id',
  schoolIdColumn: 'school_id',
  displaySelect: \`n.id, LEFT(n.body, 60) AS label, c.name AS subtitle,
                  n.deleted_at, n.deleted_by, n.delete_reason, n.restored_at\`,
  displayJoins: 'LEFT JOIN classes c ON c.id = n.class_id',
  searchPredicate: (t) => ({ sql: 'n.body LIKE ?', params: [\`%\${t}%\`] }),
  dependencies: [],
}`}</code></pre>

      <p>Then <code>npm run trash:verify</code>. One descriptor gives archive, restore, list, search and purge — with uniform audit and permissions.</p>

      <h2>Step 6 — The page</h2>

      <pre><code>{`'use client';

export default function ClassNoticesPanel({ classId, termId }: {
  classId: number | null;
  termId: number | null;
}) {
  const { t } = useI18n();

  const { data, error, isLoading, mutate } = useSWR(
    classId && termId ? \`/api/academics/notices?classId=\${classId}&termId=\${termId}\` : null,
    fetcher,
  );

  if (isLoading) return <NoticeSkeleton />;
  if (error)     return <ErrorState onRetry={() => mutate()} />;

  const notices = data?.data ?? [];                 // unwrap the envelope
  if (!notices.length) {
    return (
      <EmptyState
        title={t('notices.empty', 'No notices yet')}
        hint={t('notices.emptyHint', 'Add one to tell this class something for the term.')}
      />
    );
  }

  return (
    <ul className="space-y-2">
      {notices.map((n: ClassNotice) => (
        <li key={n.id}
            className="rounded-xl border border-gray-200 dark:border-gray-800
                       bg-white dark:bg-gray-900 p-4">
          <p className="text-sm text-gray-900 dark:text-white">{n.body}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {n.created_by_name ?? t('common.system', 'System')}
          </p>
        </li>
      ))}
    </ul>
  );
}`}</code></pre>

      <Table
        head={['Detail', 'Which lesson it comes from']}
        rows={[
          [<>Null SWR key until both ids exist</>, <>Hooks — you cannot put a hook behind an <code>if</code>.</>],
          [<>All four states handled</>, <>React — the empty state is the one that gets skipped.</>],
          [<><code>data?.data</code></>, <>Data end to end — 575 routes use the envelope, 116 do not.</>],
          [<><code>key={'{'}n.id{'}'}</code></>, <>React — never the array index.</>],
          [<><code>dark:</code> on every colour</>, <>Theming — no <code>dark:</code> is broken, not neutral.</>],
          [<><code>t()</code> with a fallback</>, <>i18n — and the key goes in <strong>both</strong> dictionaries.</>],
        ]}
      />

      <h2>Step 7 — Wire it up</h2>

      <ol>
        <li>Mount the panel on the class page.</li>
        <li>Sidebar entry if it needs its own screen — gated by the same permission.</li>
        <li>Add every <code>t()</code> key to <strong>both</strong> <code>en.json</code> and <code>ar.json</code>.</li>
        <li>Check the layout in RTL.</li>
      </ol>

      <h2>Step 8 — Verify</h2>

      <pre><code>{`npm run lint:permissions   # permission literals vs the catalog
npm run trash:verify       # descriptor vs the real schema
npm run build              # types and imports across 248 pages`}</code></pre>

      <p>Then, by hand:</p>

      <Table
        head={['Check', 'Looking for']}
        rows={[
          ['Light and dark', <>Nothing invisible.</>],
          ['English and Arabic', <>No raw keys; RTL layout correct.</>],
          ['Narrow viewport', <>Staff use phones at the gate.</>],
          ['Without the permission', <>Entry hidden <strong>and</strong> the API 403s.</>],
          ['Empty state', <>A school with no notices sees an explanation, not a blank box.</>],
          [<>Another school&apos;s <code>classId</code></>, <><strong>404.</strong> If it returns data, stop and fix the ownership check.</>],
          ['Delete, then Trash', <>It is there and restores cleanly.</>],
        ]}
      />

      <h2>The whole slice</h2>

      <Diagram caption="Nine files. Every feature in DRAIS is some subset of this.">
{`  database/migrations/tidb/041_class_notices.sql   schema
  src/lib/notices/service.ts                       logic  (resolved schoolId)
  src/lib/notices/README.md                        why it exists
  src/lib/rbac/catalog.ts                          permissions
  src/lib/trash/registry.ts                        recoverability
  src/app/api/academics/notices/route.ts           GET + POST
  src/app/api/academics/notices/[id]/route.ts      DELETE
  src/components/academics/ClassNoticesPanel.tsx   UI
  src/i18n/en.json + ar.json                       both languages`}
      </Diagram>

      <Exercise
        n={1}
        title="Build it"
        objective={<>Implement Class Notices end to end against your local database. Do not skip the README or the Arabic keys.</>}
        hints={<>Work in the order above. The API first makes the UI far easier to write, because you can see real data.</>}
        mistakes={
          <ul className="list-disc pl-5 space-y-1">
            <li>Skipping the ownership check because the permission passed.</li>
            <li>Omitting <code>deleted_at IS NULL</code> — deleted notices reappear.</li>
            <li>Awaiting <code>logAudit</code>.</li>
            <li>English-only strings.</li>
            <li>No empty state.</li>
          </ul>
        }
        solution={<p>You are done when a colleague can read the diff without asking a question, and every item in Step 8 passes.</p>}
      />

      <Exercise
        n={2}
        title="Extend it"
        objective={<>Add an optional expiry date, after which a notice stops showing. Decide where the filtering belongs.</>}
        hints={<>SQL, service, or component? Reread the reshaping guidance in Data end to end — and remember that a date comparison must go through the timezone-safe helpers, not <code>toISOString()</code>.</>}
        mistakes={<>Filtering in the component. A second screen would then need the same logic, and the two would drift.</>}
      />

      <SelfCheck
        questions={[
          {
            q: <>Permission granted, and you still verify the class belongs to the school. Why?</>,
            a: <p>A permission is a capability, not ownership. Another school&apos;s <code>classId</code> is a valid-looking number. Return 404 so you do not confirm it exists elsewhere.</p>,
          },
          {
            q: <>Why does the service take <code>schoolId</code> rather than the session?</>,
            a: <p>So both auth domains can call it without sharing auth code. A session parameter binds it to school auth.</p>,
          },
          {
            q: <>What do you lose by skipping the trash descriptor?</>,
            a: <p>Restore, dependency preview, uniform audit and search — and you would have to write a bespoke delete route, which is the thing the registry exists to prevent.</p>,
          },
          {
            q: <>Which of the nine files is easiest to skip and most expensive to omit?</>,
            a: <p>The README. Nothing breaks without it, and the next person rediscovers every decision by reading the code — which is precisely the founder dependence this course exists to remove.</p>,
          },
          {
            q: <>You have shipped it. What is the last check?</>,
            a: <p>Request it with another school&apos;s <code>classId</code>. If data comes back, everything else is irrelevant.</p>,
          },
        ]}
      />

      <Box kind="tip" title="If you completed this unaided, you are ready">
        <p>
          You have written a migration, a tenant-safe service, an authenticated and audited API, a
          four-state bilingual component, and the recoverability wiring — and verified all of it. That is the
          full DRAIS standard. The rest is domain knowledge, and the module guides carry that.
        </p>
      </Box>

      <SeeAlso slugs={['playbook-module', 'playbook-api', 'playbook-page', 'learn-sql']} />
    </ControlDoc>
  );
}
