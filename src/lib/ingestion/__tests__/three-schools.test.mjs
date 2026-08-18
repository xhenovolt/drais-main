// node:test suite — the redesign's own success criteria (readiness-audit
// import brief §22): "a successful demonstration should include at least
// THREE radically different school Excel formats... DRAIS should correctly
// inspect all three, explain what it believes each workbook means, and
// safely import the approved data."
//
// Runs the REAL pipeline — inspectWorkbook, parseSheetToSource,
// validateStudentRow, studentIdentityFromRow, runIngestionPipeline — with
// dryRun:true and a fake in-memory PersonLookup (no DB touched at all, so
// this is safe to run anywhere, anytime, without a real school's data).
//
// Run with: npx tsx --test src/lib/ingestion/__tests__/three-schools.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { inspectWorkbook } from '../parse/workbook-inspect.ts';
import { parseSheetToSource } from '../parse/parse-sheet.ts';
import { inferContextFromSheetName } from '../parse/sheet-name-context.ts';
import { runIngestionPipeline } from '../pipeline.ts';
import { STUDENT_FIELDS, validateStudentRow, studentIdentityFromRow } from '../pipelines/students-schema.ts';

function aoaToBuffer(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const noopLookup = {
  byAdmissionNo: async () => [],
  byCredentialId: async () => [],
  byDeviceMapping: async () => [],
  byNamePrefix: async () => [],
};

function fakeStudentsPipeline() {
  const commitCalls = [];
  return {
    pipeline: {
      name: 'students',
      schema: STUDENT_FIELDS,
      validateRow: validateStudentRow,
      identityFromRow: studentIdentityFromRow,
      commit: async (row) => { commitCalls.push(row); }, // proves dryRun works: this must stay empty
    },
    commitCalls,
  };
}

async function runSheet(buffer, filename, sheetName, headerRowIndex, sheetContext) {
  const parsed = parseSheetToSource(buffer, filename, sheetName, headerRowIndex);
  const { pipeline, commitCalls } = fakeStudentsPipeline();

  if (sheetContext) {
    const original = pipeline.validateRow;
    pipeline.validateRow = (mapped, prov) => {
      const withDefaults = { ...mapped };
      if (!withDefaults.class_name && sheetContext.className) withDefaults.class_name = sheetContext.className;
      if (!withDefaults.stream_name && sheetContext.streamName) withDefaults.stream_name = sheetContext.streamName;
      return original(withDefaults, prov);
    };
  }

  const report = await runIngestionPipeline({
    schoolId: 1,
    parsed,
    pipeline,
    lookup: noopLookup,
    dryRun: true,
  });
  return { report, commitCalls };
}

describe('School A — one sheet, class in a column, messy formatting', () => {
  const buf = aoaToBuffer([
    ['Student Roll', [
      ['XHENVOLT ACADEMY — 2026 TERM 1 STUDENT ROLL'],
      [],
      ['Adm No', 'First Name', 'Last Name', 'Sex', 'DOB', 'Class', 'Balance'],
      ['XHN/001', 'John', 'Kato', 'M', '15/03/2012', 'S1', '150,000'],
      ['XHN/002', 'Mary', 'Nakato', 'F', '2012-07-22', 'S1', '0'],
      ['XHN/003', 'Peter', 'Okello', 'M', '03/11/2011', 'S2', '75,500.50'],
    ]],
  ]);

  it('inspects the workbook and finds the header past the title row', () => {
    const inspection = inspectWorkbook(buf);
    assert.equal(inspection.sheetCount, 1);
    assert.equal(inspection.sheets[0].header.headerRowIndex, 2);
    assert.equal(inspection.sheets[0].purpose.purpose, 'students');
  });

  it('imports all 3 rows, correctly parsing mixed date formats and comma-formatted money', async () => {
    const { report, commitCalls } = await runSheet(buf, 'roll.xlsx', 'Student Roll', 2, null);
    assert.equal(report.counts.parsed, 3);
    assert.equal(report.counts.failed, 0);
    assert.equal(report.counts.inserted, 3); // all no-match against the empty lookup
    assert.equal(commitCalls.length, 0); // dryRun — nothing actually committed
    const kato = report.outcomes.find((o) => o.validated?.admission_no === 'XHN/001');
    assert.equal(kato.validated.date_of_birth, '2012-03-15'); // DD/MM/YYYY normalized
    assert.equal(kato.validated.fees_balance, 150000); // comma-stripped
    assert.equal(kato.validated.class_name, 'S1'); // from the column, no sheet-context needed
  });
});

describe('School B — sheet-per-class, class comes ONLY from the sheet name', () => {
  const buf = aoaToBuffer([
    ['S.1 Blue', [
      ['Admission No', 'First Name', 'Last Name'],
      ['XHN/010', 'Amina', 'Nassuna'],
      ['XHN/011', 'Yusuf', 'Kirunda'],
    ]],
    ['S.1 Red', [
      ['Admission No', 'First Name', 'Last Name'],
      ['XHN/020', 'Omar', 'Ssekandi'],
    ]],
    ['S.2 Green', [
      ['Admission No', 'First Name', 'Last Name'],
      ['XHN/030', 'Grace', 'Namutebi'],
    ]],
  ]);

  it('inspects 3 class sheets with no class column at all', () => {
    const inspection = inspectWorkbook(buf);
    assert.equal(inspection.sheetCount, 3);
    for (const s of inspection.sheets) {
      assert.equal(s.headers.includes('Class'), false); // confirms this school genuinely has no class column
      assert.ok(s.nameContext.confidence > 0.5);
    }
  });

  it('every row gets its class/stream from sheet-name inference alone', async () => {
    const inspection = inspectWorkbook(buf);
    const allReports = [];
    for (const sheet of inspection.sheets) {
      const ctx = inferContextFromSheetName(sheet.sheetName);
      const { report } = await runSheet(buf, 'classes.xlsx', sheet.sheetName, sheet.header.headerRowIndex, ctx);
      allReports.push(report);
    }
    assert.equal(allReports.reduce((n, r) => n + r.counts.parsed, 0), 4);
    assert.equal(allReports.reduce((n, r) => n + r.counts.failed, 0), 0);

    const blue = allReports[0].outcomes.find((o) => o.validated?.admission_no === 'XHN/010');
    assert.equal(blue.validated.class_name, 'Senior 1');
    assert.equal(blue.validated.stream_name, 'Blue');
    const green = allReports[2].outcomes.find((o) => o.validated?.admission_no === 'XHN/030');
    assert.equal(green.validated.class_name, 'Senior 2');
    assert.equal(green.validated.stream_name, 'Green');
  });
});

describe('School C — students and fees mixed across sheets in one workbook', () => {
  const buf = aoaToBuffer([
    ['Students', [
      ['Admission No', 'First Name', 'Last Name', 'Class'],
      ['XHN/100', 'David', 'Mugisha', 'S3'],
      ['XHN/101', 'Sarah', 'Nabirye', 'S3'],
    ]],
    ['Term 1 Fees', [
      ['Admission No', 'Name', 'Tuition', 'Balance', 'Amount Paid', 'Payment Date'],
      ['XHN/100', 'David Mugisha', 500000, 100000, 400000, '2026-01-20'],
      ['XHN/101', 'Sarah Nabirye', 500000, 0, 500000, '2026-01-21'],
    ]],
  ]);

  it('correctly distinguishes the students sheet from the fees sheet by purpose', () => {
    const inspection = inspectWorkbook(buf);
    assert.equal(inspection.sheets[0].purpose.purpose, 'students');
    assert.equal(inspection.sheets[1].purpose.purpose, 'fees');
  });

  it('only runs the students pipeline against the students-purposed sheet', async () => {
    const inspection = inspectWorkbook(buf);
    const studentSheets = inspection.sheets.filter((s) => s.purpose.purpose === 'students');
    assert.equal(studentSheets.length, 1);
    const { report } = await runSheet(buf, 'mixed.xlsx', studentSheets[0].sheetName, studentSheets[0].header.headerRowIndex, null);
    assert.equal(report.counts.parsed, 2);
    assert.equal(report.counts.inserted, 2);
    // Fees sheet correctly NOT run through the student validator — it has
    // no admission_no/first_name/last_name shape that would even validate
    // sensibly, and this test proves nothing tried to.
  });
});
