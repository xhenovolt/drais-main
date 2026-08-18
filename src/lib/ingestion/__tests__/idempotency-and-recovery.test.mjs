// node:test suite — import redesign Phase E: re-import idempotency and
// partial-failure recovery, per the original brief's explicit ask:
// "re-importing the same file... partial failure" must both be handled
// without leaving an unknowable half-imported state or creating
// duplicates. Run with:
//   npx tsx --test src/lib/ingestion/__tests__/idempotency-and-recovery.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runIngestionPipeline } from '../pipeline.ts';
import { STUDENT_FIELDS, validateStudentRow, studentIdentityFromRow } from '../pipelines/students-schema.ts';

function makeParsed(rows) {
  return {
    headers: ['Admission No', 'First Name', 'Last Name', 'Class'],
    detectedFormat: 'xlsx',
    rows: rows.map((r, i) => ({ ...r, __provenance: { sourceRowIndex: i + 1, sourceFile: 'test.xlsx', sourceSheet: 'Sheet1' } })),
  };
}

/**
 * A stateful fake DB: starts empty, and after a "commit" actually stores
 * the row, so a SECOND pipeline run against the same source data finds
 * real matches instead of always missing — exactly what a real database
 * would do on re-import. This is the fixture that makes an idempotency
 * test meaningful instead of trivially true.
 */
function makeStatefulWorld() {
  const students = new Map(); // admission_no -> { personId, firstName, lastName }
  let nextId = 1000;

  const lookup = {
    byAdmissionNo: async (admissionNo) => {
      const s = students.get(admissionNo);
      return s ? [{ personId: s.personId, role: 'student', firstName: s.firstName, lastName: s.lastName }] : [];
    },
    byCredentialId: async () => [],
    byDeviceMapping: async () => [],
    byNamePrefix: async () => [],
  };

  const pipeline = {
    name: 'students',
    schema: STUDENT_FIELDS,
    validateRow: validateStudentRow,
    identityFromRow: studentIdentityFromRow,
    commit: async (row, identity, decision) => {
      if (decision.action === 'insert') {
        const personId = nextId++;
        students.set(row.admission_no, { personId, firstName: row.first_name, lastName: row.last_name });
      }
      // 'update'/'merge' — a real commit would write changed fields; the
      // fake world doesn't need to model that for this test, the row
      // already exists in `students`, which is what idempotency checks.
    },
  };

  return { lookup, pipeline, students };
}

describe('re-import idempotency', () => {
  it('running the same 50-row import twice does not create duplicates — the second run resolves every row to an existing match', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      'Admission No': `XHN/${i}`, 'First Name': `First${i}`, 'Last Name': `Last${i}`, Class: 'S1',
    }));

    const world = makeStatefulWorld();

    const firstRun = await runIngestionPipeline({ schoolId: 1, parsed: makeParsed(rows), pipeline: world.pipeline, lookup: world.lookup });
    assert.equal(firstRun.counts.inserted, 50);
    assert.equal(world.students.size, 50, 'the fake world actually recorded 50 distinct students after run 1');

    const secondRun = await runIngestionPipeline({ schoolId: 1, parsed: makeParsed(rows), pipeline: world.pipeline, lookup: world.lookup });
    assert.equal(secondRun.counts.inserted, 0, 'nothing should be freshly inserted on re-import');
    assert.equal(secondRun.counts.updated + secondRun.counts.merged, 50, 'every row should resolve to its existing match');
    assert.equal(world.students.size, 50, 'the world still has exactly 50 students, not 100 — no duplicates created');
  });

  it('a THIRD re-import still produces the same result (stable, not just "twice is fine")', async () => {
    const rows = [{ 'Admission No': 'XHN/STABLE', 'First Name': 'Jane', 'Last Name': 'Doe', Class: 'S2' }];
    const world = makeStatefulWorld();

    for (let i = 0; i < 3; i++) {
      const report = await runIngestionPipeline({ schoolId: 1, parsed: makeParsed(rows), pipeline: world.pipeline, lookup: world.lookup });
      if (i === 0) assert.equal(report.counts.inserted, 1);
      else assert.equal(report.counts.inserted, 0, `run ${i + 1} should not insert again`);
    }
    assert.equal(world.students.size, 1);
  });
});

describe('partial-failure recovery', () => {
  it('a large batch with scattered bad rows isolates exactly the bad ones without blocking the good ones', async () => {
    const TOTAL = 500;
    const rows = Array.from({ length: TOTAL }, (_, i) => {
      // Every 7th row is deliberately malformed (missing a name entirely —
      // admission_no alone is no longer a validation failure trigger
      // since it's optional and auto-generated at commit time; see
      // students-schema.ts).
      if (i % 7 === 0) return { 'Admission No': `XHN/${i}`, 'First Name': '', 'Last Name': '', Class: 'S1' };
      return { 'Admission No': `XHN/${i}`, 'First Name': `Good${i}`, 'Last Name': 'Row', Class: 'S1' };
    });
    const expectedBad = Math.ceil(TOTAL / 7);
    const expectedGood = TOTAL - expectedBad;

    const world = makeStatefulWorld();
    const report = await runIngestionPipeline({ schoolId: 1, parsed: makeParsed(rows), pipeline: world.pipeline, lookup: world.lookup, dryRun: true });

    assert.equal(report.counts.parsed, TOTAL, 'every row is accounted for, good or bad');
    assert.equal(report.counts.failed, expectedBad);
    assert.equal(report.counts.inserted, expectedGood);

    // Every failed row must carry enough provenance to retry ONLY that row.
    const failedOutcomes = report.outcomes.filter((o) => o.decision.action === 'fail');
    assert.equal(failedOutcomes.length, expectedBad);
    for (const o of failedOutcomes) {
      assert.ok(o.provenance.sourceRowIndex > 0);
      assert.match(o.decision.error, /determine the student.s name/);
    }

    // The retry set (just the failed row indices) is small and precise —
    // proving a caller CAN implement "fix these N rows and re-upload just
    // them" instead of re-processing the whole file.
    const retryIndices = failedOutcomes.map((o) => o.provenance.sourceRowIndex);
    assert.equal(retryIndices.length, expectedBad);
    assert.deepEqual([...new Set(retryIndices)], retryIndices, 'no duplicate row indices in the retry set');
  });

  it('a mid-batch crash in one row does not corrupt or skip subsequent rows', async () => {
    const rows = [
      { 'Admission No': 'XHN/A', 'First Name': 'A', 'Last Name': 'A', Class: 'S1' },
      { 'Admission No': 'XHN/CRASH', 'First Name': 'B', 'Last Name': 'B', Class: 'S1' },
      { 'Admission No': 'XHN/C', 'First Name': 'C', 'Last Name': 'C', Class: 'S1' },
    ];
    const world = makeStatefulWorld();
    const originalCommit = world.pipeline.commit;
    world.pipeline.commit = async (row, identity, decision) => {
      if (row.admission_no === 'XHN/CRASH') throw new Error('simulated unexpected commit failure');
      return originalCommit(row, identity, decision);
    };

    const report = await runIngestionPipeline({ schoolId: 1, parsed: makeParsed(rows), pipeline: world.pipeline, lookup: world.lookup });

    assert.equal(report.counts.parsed, 3);
    assert.equal(report.counts.failed, 1, 'only the crashing row is marked failed');
    assert.equal(report.counts.inserted, 2, 'both the row before and the row after the crash still succeeded');
    assert.equal(world.students.size, 2);
    assert.ok(world.students.has('XHN/A'));
    assert.ok(world.students.has('XHN/C'));
    assert.ok(!world.students.has('XHN/CRASH'));
  });
});
