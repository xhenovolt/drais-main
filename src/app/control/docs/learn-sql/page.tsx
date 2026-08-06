'use client';

import React from 'react';
import ControlDoc, { Box, Source, Table, SeeAlso } from '../ControlDoc';
import { LessonIntro, Concept, Evolution, Exercise, SelfCheck } from '../Lesson';

export default function Page() {
  return (
    <ControlDoc slug="learn-sql">
      <LessonIntro
        level="Intermediate"
        prereqs="Async JavaScript in DRAIS. Helpful: Core tables."
        teaches={['SELECT', 'JOIN', 'LEFT vs INNER', 'GROUP BY', 'indexes', 'parameterised queries', 'transactions', 'N+1']}
        outcome={<>Write a DRAIS query that is tenant-safe, injection-safe, index-friendly, and correct about soft deletes.</>}
      />

      <Box kind="note" title="No ORM">
        <p>
          DRAIS uses <strong>raw SQL through <code>mysql2</code></strong> — no Prisma, no Drizzle. You write the
          query. That means full control and full responsibility: nothing generates the tenant filter for you.
        </p>
      </Box>

      <h2>The shape of every DRAIS query</h2>

      <pre><code>{`const rows = await query(
  \`SELECT s.id, s.admission_no, p.first_name, p.last_name, c.name AS class_name
     FROM students s
     JOIN people p       ON p.id = s.person_id
     LEFT JOIN enrollments e ON e.student_id = s.id AND e.term_id = ?
     LEFT JOIN classes c     ON c.id = e.class_id
    WHERE s.school_id = ?          -- tenancy
      AND s.deleted_at IS NULL     -- soft delete
    ORDER BY p.last_name, p.first_name\`,
  [termId, schoolId],
);`}</code></pre>

      <p>Four things are non-negotiable in that query. Take them one at a time.</p>

      <h2>1. Parameters, never string building</h2>

      <Evolution
        stages={[
          {
            verdict: 'bad',
            label: 'Interpolated',
            code: "const rows = await query(\n  `SELECT * FROM students WHERE admission_no = '${input}'`\n);",
            why: <><strong>SQL injection.</strong> An <code>input</code> of <code>{"' OR '1'='1"}</code> returns every row — across every school. It is also wrong for ordinary data: a learner named O&apos;Brien breaks the query outright.</>,
          },
          {
            verdict: 'best',
            label: 'Placeholders',
            code: `const rows = await query(
  'SELECT * FROM students WHERE admission_no = ? AND school_id = ?',
  [input, session.schoolId],
);`,
            why: <>The driver sends the query and the values separately, so a value can never be parsed as SQL. Quoting and escaping are handled. <strong>Every query in DRAIS uses <code>?</code>.</strong></>,
          },
        ]}
      />

      <Box kind="warning" title="The one thing ? cannot do">
        <p>
          Placeholders work for <em>values</em>, not identifiers. You cannot write{' '}
          <code>ORDER BY ?</code> and pass a column name.
        </p>
        <p>
          For dynamic sorting, <strong>validate against an allow-list</strong> of permitted column names and
          interpolate only from that list. Never interpolate a user-supplied column directly.
        </p>
      </Box>

      <h2>2. Tenancy</h2>

      <Box kind="invariant" title="Every tenant query filters on school_id, from the session">
        <p>
          There is no ORM adding it and no middleware enforcing it. A query without the filter returns other
          schools&apos; data and looks perfectly normal in review.
        </p>
        <p>
          When the table has no <code>school_id</code> of its own, <strong>join through one that does</strong> —
          which is how the parent-portal gate and the override storage layer work.
        </p>
      </Box>

      <h2>3. Soft deletes</h2>

      <p>
        Most tenant tables carry <code>deleted_at</code>. Omitting <code>deleted_at IS NULL</code> is the most
        common way a &quot;deleted&quot; learner reappears — in a list, a count, or a report total that no
        longer matches the screen above it.
      </p>

      <Box kind="tip" title="Watch it in aggregates especially">
        <p>
          A <code>COUNT(*)</code> that forgets the filter disagrees with a list that remembers it. Two numbers
          on the same page contradicting each other is how it usually gets noticed.
        </p>
      </Box>

      <h2>4. JOIN, and which kind</h2>

      <Concept name="INNER vs LEFT JOIN">
        <Table
          head={['', 'INNER JOIN', 'LEFT JOIN']}
          rows={[
            ['Keeps', 'Rows with a match on both sides', 'All left rows; NULLs where no match'],
            ['Use for', <>A required relationship — a student always has a person</>, <>An optional one — a student may have no current enrolment</>],
            ['Risk', <><strong>Silently drops rows</strong></>, <>Must handle <code>NULL</code></>],
          ]}
        />
        <p>
          In the query above, <code>people</code> is an <code>INNER JOIN</code> because a student without a
          person is impossible. <code>enrollments</code> and <code>classes</code> are <code>LEFT</code> because
          a newly admitted learner may not be enrolled yet — and an <code>INNER JOIN</code> there would make
          them <em>vanish from the list entirely</em>.
        </p>
      </Concept>

      <Box kind="warning" title="This exact mistake is in the ADR record">
        <p>
          The old term resolver <code>INNER JOIN</code>ed <code>academic_years</code>. Any term whose
          academic-year row was missing simply <strong>disappeared</strong> — no error, no empty state, just a
          term that could not be selected and nobody could explain.
        </p>
        <p>
          <strong>When a join drops rows you expected, check its type first.</strong>
        </p>
      </Box>

      <h2>Indexes</h2>

      <pre><code>{`KEY idx_school_status (school_id, status)`}</code></pre>

      <Concept name="Composite index order">
        <p>
          An index is a sorted lookup structure. A composite index is usable <strong>left to right</strong>:
        </p>
        <Table
          head={['Query filters on', 'Uses idx_school_status?']}
          rows={[
            [<code>school_id</code>, <>Yes</>],
            [<>{'school_id + status'}</>, <>Yes — fully</>],
            [<><code>status</code> alone</>, <><strong>No</strong> — the leading column is missing</>],
          ]}
        />
        <p>
          This is why DRAIS indexes lead with <code>school_id</code>: <em>every</em> tenant query filters on it,
          so it belongs at the front.
        </p>
      </Concept>

      <Box kind="tip" title="Use EXPLAIN before optimising">
        <p>
          Prefix a slow query with <code>EXPLAIN</code>. A full table scan on a large table is the usual
          culprit, and the fix is normally an index or a rewritten <code>WHERE</code> — not a code change.
        </p>
        <p>
          A function around a column (<code>WHERE DATE(punch_at) = ?</code>) prevents index use. Compare
          against a range instead.
        </p>
      </Box>

      <h2>The N+1</h2>

      <Evolution
        stages={[
          {
            verdict: 'bad',
            label: 'A query per row',
            code: `const classes = await query('SELECT id, name FROM classes WHERE school_id = ?', [schoolId]);
for (const c of classes) {
  c.count = await query('SELECT COUNT(*) FROM students WHERE class_id = ?', [c.id]);
}`,
            why: <>1 + N queries. Thirty classes is thirty-one round trips. It is fast on a test school with three classes and slow in production, which is why it survives review.</>,
          },
          {
            verdict: 'best',
            label: 'One GROUP BY',
            code: `const rows = await query(
  \`SELECT c.id, c.name, COUNT(s.id) AS student_count
     FROM classes c
     LEFT JOIN students s ON s.class_id = c.id AND s.deleted_at IS NULL
    WHERE c.school_id = ?
    GROUP BY c.id, c.name\`,
  [schoolId],
);`,
            why: <>One round trip regardless of class count. Note <code>LEFT JOIN</code> so a class with no learners still appears with a count of 0 — an <code>INNER JOIN</code> would hide empty classes. The Control Center health monitors are written this way deliberately: <strong>each monitor is one <code>GROUP BY</code>, no N+1</strong>, because they scan every school.</>,
          },
        ]}
      />

      <h2>Transactions</h2>

      <pre><code>{`await withTransaction(async (conn) => {
  const personId  = await insertPerson(conn, input);
  const studentId = await insertStudent(conn, personId, input);
  await insertEnrollment(conn, studentId, input);
});`}</code></pre>

      <Box kind="invariant" title="All or nothing">
        <p>
          Any throw rolls the whole thing back. Without it, a failure after the second insert leaves a learner
          with no enrolment — a record that exists and appears in no class list.
        </p>
        <p>Pass the transaction&apos;s <code>conn</code> to every statement inside. A call that uses the pool instead is outside the transaction and will not roll back.</p>
      </Box>

      <h2>Two driver settings you must not change</h2>

      <Table
        head={['Setting', 'Why it is load-bearing']}
        rows={[
          [<code>timezone: &apos;Z&apos;</code>, <>DRAIS stores instants and derives local dates explicitly. A driver converting timezones would corrupt attendance dates for every school.</>],
          [<code>bigNumberStrings</code>, <>TiDB bigints exceed JavaScript number precision. Without it, the low bits of a large id are silently lost.</>],
        ]}
      />

      <h2>Checklist</h2>

      <Table
        head={['#', 'Check']}
        rows={[
          ['1', <><code>?</code> placeholders — never interpolation</>],
          ['2', <><code>school_id</code> filter, from the session</>],
          ['3', <><code>deleted_at IS NULL</code></>],
          ['4', <>Right join type — <code>LEFT</code> for optional relationships</>],
          ['5', <>Index-friendly <code>WHERE</code>, leading with <code>school_id</code></>],
          ['6', <>No query inside a loop</>],
          ['7', <><code>withTransaction</code> for multi-table writes</>],
        ]}
      />

      <Exercise
        n={1}
        title="Find an N+1"
        objective={<>Search <code>src/lib</code> and <code>src/app/api</code> for <code>await query</code> inside a <code>for</code> or <code>.map</code>. Rewrite one as a single query.</>}
        hints={<>Usually a <code>JOIN</code> plus <code>GROUP BY</code>, or one <code>WHERE id IN (…)</code> followed by grouping in JavaScript.</>}
        mistakes={<>Switching to <code>INNER JOIN</code> while aggregating and losing the zero rows. Verify the count of returned rows before and after.</>}
      />

      <Exercise
        n={2}
        title="Write a tenant-safe summary query"
        objective={<>Write one query returning, per class for a term: class name, enrolled learners, and how many have a fingerprint enrolment. One round trip.</>}
        hints={<>Two <code>LEFT JOIN</code>s and a <code>COUNT(DISTINCT …)</code>. Beware double counting when joining two one-to-many relationships.</>}
        mistakes={
          <ul className="list-disc pl-5 space-y-1">
            <li>Forgetting <code>deleted_at IS NULL</code> — deleted learners inflate the count.</li>
            <li>Two one-to-many joins multiplying rows; <code>COUNT(DISTINCT)</code> is the fix.</li>
            <li>Taking <code>schoolId</code> from anywhere but the session.</li>
          </ul>
        }
      />

      <SelfCheck
        questions={[
          {
            q: <>Why is <code>WHERE admission_no = &apos;{'${input}'}&apos;</code> wrong twice over?</>,
            a: <p>SQL injection, and it breaks on ordinary data — a learner named O&apos;Brien terminates the string early.</p>,
          },
          {
            q: <>Learners missing from a class list. Which join type do you suspect?</>,
            a: <p><code>INNER JOIN</code> on something optional, such as enrolment. Newly admitted learners with no enrolment row are dropped silently — the same bug the old term resolver had with <code>academic_years</code>.</p>,
          },
          {
            q: <>Does a query filtering only on <code>status</code> use <code>KEY (school_id, status)</code>?</>,
            a: <p>No. Composite indexes are usable left to right, and the leading column is missing.</p>,
          },
          {
            q: <>Fast in testing, slow in production. First suspicion?</>,
            a: <p>An N+1 — a query inside a loop. Three classes hides it; thirty does not.</p>,
          },
          {
            q: <>Why does DRAIS index on <code>(school_id, …)</code> rather than the other order?</>,
            a: <p>Every tenant query filters on <code>school_id</code>, so it must lead for the index to be usable.</p>,
          },
        ]}
      />

      <Source path="docs/database/TABLE_DICTIONARY.md">Every table and column.</Source>

      <SeeAlso slugs={['learn-capstone', 'schema', 'data', 'learn-async']} />
    </ControlDoc>
  );
}
