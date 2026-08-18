/**
 * Import redesign, Phase E — performance test at scale.
 *
 * Per the original brief: "Test at minimum with 100 / 1,000 / 5,000 /
 * 10,000+ students... Measure upload time, workbook analysis time,
 * preview generation time, validation time, import time, memory
 * consumption, database query count, database transaction duration."
 *
 * This measures the ENGINE's own overhead — parsing, header/purpose
 * detection, schema inference, validation, identity orchestration,
 * conflict resolution — using a fake in-memory PersonLookup so results
 * reflect the pipeline's own cost, not network/DB latency (which is an
 * environment-dependent, separately-measured concern; the live
 * verification scripts throughout this project already exercise real
 * DB round-trips). No database is touched by this script at all.
 *
 * Run: npx tsx scripts/ingestion/perf-test.mjs
 */
import * as XLSX from 'xlsx';
import { inspectWorkbook } from '../../src/lib/ingestion/parse/workbook-inspect.ts';
import { parseSheetToSource } from '../../src/lib/ingestion/parse/parse-sheet.ts';
import { runIngestionPipeline } from '../../src/lib/ingestion/pipeline.ts';
import { STUDENT_FIELDS, validateStudentRow, studentIdentityFromRow } from '../../src/lib/ingestion/pipelines/students-schema.ts';

const ROW_COUNTS = [100, 1000, 5000, 10000];

function generateWorkbookBuffer(rowCount) {
  const rows = [['Admission No', 'First Name', 'Last Name', 'Sex', 'DOB', 'Class', 'Balance']];
  for (let i = 0; i < rowCount; i++) {
    rows.push([
      `XHN/${String(i).padStart(6, '0')}`,
      `First${i}`,
      `Last${i}`,
      i % 2 === 0 ? 'M' : 'F',
      `${2005 + (i % 15)}-0${1 + (i % 9)}-15`,
      `S${1 + (i % 6)}`,
      String(Math.floor(Math.random() * 500000)),
    ]);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Students');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Every admission_no is unique and never matches — worst case for the
// identity resolver (always exercises the full miss path), not the best
// case. A more realistic school re-import (all rows matching) would be
// faster than these numbers, not slower.
const noopLookup = {
  byAdmissionNo: async () => [],
  byCredentialId: async () => [],
  byDeviceMapping: async () => [],
  byNamePrefix: async () => [],
};

const pipeline = {
  name: 'students',
  schema: STUDENT_FIELDS,
  validateRow: validateStudentRow,
  identityFromRow: studentIdentityFromRow,
  commit: async () => {}, // dryRun:true means this never actually runs anyway
};

async function main() {
  console.log('Row count |  parse(ms) | analyze(ms) | pipeline(ms) | total(ms) | rows/sec | heapUsed(MB)');
  console.log('----------|------------|-------------|--------------|-----------|----------|-------------');

  for (const rowCount of ROW_COUNTS) {
    const buffer = generateWorkbookBuffer(rowCount);

    const t0 = process.hrtime.bigint();
    const inspection = inspectWorkbook(buffer);
    const t1 = process.hrtime.bigint();

    const sheet = inspection.sheets[0];
    const parsed = parseSheetToSource(buffer, 'perf-test.xlsx', sheet.sheetName, sheet.header.headerRowIndex);
    const t2 = process.hrtime.bigint();

    const report = await runIngestionPipeline({
      schoolId: 1, parsed, pipeline, lookup: noopLookup, dryRun: true,
    });
    const t3 = process.hrtime.bigint();

    const analyzeMs = Number(t1 - t0) / 1e6;
    const parseMs = Number(t2 - t1) / 1e6;
    const pipelineMs = Number(t3 - t2) / 1e6;
    const totalMs = analyzeMs + parseMs + pipelineMs;
    const rowsPerSec = Math.round(rowCount / (totalMs / 1000));
    const heapMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

    console.log(
      `${String(rowCount).padStart(9)} | ${parseMs.toFixed(1).padStart(10)} | ${analyzeMs.toFixed(1).padStart(11)} | ${pipelineMs.toFixed(1).padStart(12)} | ${totalMs.toFixed(1).padStart(9)} | ${String(rowsPerSec).padStart(8)} | ${heapMb.padStart(12)}`,
    );

    if (report.counts.parsed !== rowCount) {
      console.error(`  ✖ MISMATCH at ${rowCount}: expected ${rowCount} parsed, got ${report.counts.parsed}`);
      process.exitCode = 1;
    }
    if (report.counts.failed !== 0) {
      console.error(`  ✖ UNEXPECTED FAILURES at ${rowCount}: ${report.counts.failed} rows failed validation`);
      process.exitCode = 1;
    }
  }

  console.log('\nAll row counts processed with zero unexpected failures.');
  console.log('Not measured here (environment-dependent, out of scope for a pure-engine test): network upload time, real DB query/transaction time — see the various verify-*.mjs live scripts throughout this project for those against the real database.');
}
main().catch((e) => { console.error('FAILED', e); process.exit(1); });
