// node:test suite — the pipeline orchestrator itself (readiness-audit
// Phase A: this file previously had zero coverage anywhere — every existing
// ingestion test only exercised pure sub-modules). pipeline.ts has no DB
// import of its own (PersonLookup and the domain pipeline's commit() are
// both caller-injected), so it can be tested for real here, not mirrored.
// Run with: npx tsx --test src/lib/ingestion/__tests__/pipeline-dry-run.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runIngestionPipeline } from '../pipeline.ts';

const FIELDS = [
  { name: 'admission_no', label: 'Admission Number', synonyms: ['adm no'], type: 'string', required: true },
  { name: 'first_name', label: 'First Name', synonyms: ['firstname'], type: 'string', required: true },
  { name: 'last_name', label: 'Last Name', synonyms: ['lastname'], type: 'string', required: true },
];

function makeParsed(headers, rows) {
  return {
    headers,
    detectedFormat: 'xlsx',
    rows: rows.map((r, i) => ({ ...r, __provenance: { sourceRowIndex: i + 1, sourceFile: 'test.xlsx', sourceSheet: 'Sheet1' } })),
  };
}

const noopLookup = {
  byAdmissionNo: async () => [],
  byCredentialId: async () => [],
  byDeviceMapping: async () => [],
  byNamePrefix: async () => [],
};

function makePipeline(commitCalls) {
  return {
    name: 'test-pipeline',
    schema: FIELDS,
    validateRow: (mapped) => {
      if (!mapped.admission_no) return { ok: false, error: 'admission_no is empty' };
      return { ok: true, value: { admission_no: String(mapped.admission_no), first_name: String(mapped.first_name ?? ''), last_name: String(mapped.last_name ?? '') } };
    },
    identityFromRow: (row) => ({ admissionNo: row.admission_no, firstName: row.first_name, lastName: row.last_name, personRole: 'student' }),
    commit: async (row) => { commitCalls.push(row); },
  };
}

describe('runIngestionPipeline — dry run', () => {
  it('never calls commit() when dryRun is true, but still reports full decisions', async () => {
    const commitCalls = [];
    const parsed = makeParsed(
      ['Admission No', 'First Name', 'Last Name'],
      [
        { 'Admission No': 'XHN/001', 'First Name': 'John', 'Last Name': 'Kato' },
        { 'Admission No': 'XHN/002', 'First Name': 'Mary', 'Last Name': 'Nakato' },
      ],
    );
    const report = await runIngestionPipeline({
      schoolId: 1,
      parsed,
      pipeline: makePipeline(commitCalls),
      lookup: noopLookup,
      dryRun: true,
    });

    assert.equal(commitCalls.length, 0, 'commit must never be called in dry-run mode');
    assert.equal(report.dryRun, true);
    assert.equal(report.counts.inserted, 2); // decisions still fully resolved
    assert.equal(report.outcomes.length, 2);
    assert.equal(report.outcomes[0].decision.action, 'insert');
  });

  it('calls commit() for every insertable row when dryRun is false/absent', async () => {
    const commitCalls = [];
    const parsed = makeParsed(
      ['Admission No', 'First Name', 'Last Name'],
      [{ 'Admission No': 'XHN/001', 'First Name': 'John', 'Last Name': 'Kato' }],
    );
    const report = await runIngestionPipeline({
      schoolId: 1,
      parsed,
      pipeline: makePipeline(commitCalls),
      lookup: noopLookup,
    });

    assert.equal(commitCalls.length, 1);
    assert.equal(report.dryRun, false);
    assert.equal(report.counts.inserted, 1);
  });

  it('a dry run and a real run produce identical decisions for the same input', async () => {
    const parsed1 = makeParsed(['Admission No', 'First Name', 'Last Name'], [{ 'Admission No': 'XHN/001', 'First Name': 'John', 'Last Name': 'Kato' }]);
    const parsed2 = makeParsed(['Admission No', 'First Name', 'Last Name'], [{ 'Admission No': 'XHN/001', 'First Name': 'John', 'Last Name': 'Kato' }]);

    const dryReport = await runIngestionPipeline({ schoolId: 1, parsed: parsed1, pipeline: makePipeline([]), lookup: noopLookup, dryRun: true });
    const realReport = await runIngestionPipeline({ schoolId: 1, parsed: parsed2, pipeline: makePipeline([]), lookup: noopLookup });

    assert.deepEqual(dryReport.outcomes[0].decision, realReport.outcomes[0].decision);
    assert.deepEqual(dryReport.counts, realReport.counts);
  });

  it('still fails rows loudly (not silently) in dry-run mode', async () => {
    const parsed = makeParsed(['Admission No', 'First Name', 'Last Name'], [{ 'Admission No': '', 'First Name': 'John', 'Last Name': 'Kato' }]);
    const report = await runIngestionPipeline({ schoolId: 1, parsed, pipeline: makePipeline([]), lookup: noopLookup, dryRun: true });
    assert.equal(report.counts.failed, 1);
    assert.match(report.outcomes[0].decision.error, /admission_no is empty/);
  });
});
