/**
 * POST /api/class_results/import/v2 — Unified Ingestion Pipeline path
 * for class results.
 *
 * Parallel to /api/class_results/import. ResultsImportSystem UI still
 * calls the legacy path; schools opt in to v2 by direct API call (or
 * a future UI toggle) and validate the new behaviour against their
 * actual marksheets.
 *
 * Request shape (multipart/form-data):
 *
 *   file:             File (CSV or XLSX) — REQUIRED. Wide format
 *                     (one row per student, one column per subject).
 *   academic_year_id: REQUIRED
 *   term_id:          OPTIONAL (NULL is valid for all-year exams)
 *   class_id:         REQUIRED
 *   result_type_id:   REQUIRED
 *   overrides:        OPTIONAL JSON { sourceHeader → canonicalField }
 *   conflictPolicy:   OPTIONAL JSON ConflictPolicySet — default
 *                     prefer-existing
 *   enforceAllocation:'true' (default) | 'false' (legacy parity)
 *
 * Response: full IngestionReport. Orphans land in ingestion_orphans
 * for the human-review UI (Phase 6 from original brief).
 */

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSessionSchoolId } from '@/lib/auth';
import { runIngestionPipeline } from '@/lib/ingestion/pipeline';
import {
  makeResultsPipeline,
  explodeWideResultsRows,
  RESULT_FIELDS,
} from '@/lib/ingestion/pipelines/results';
import { createSqlPersonLookup } from '@/lib/ingestion/adapters/sql-person-lookup';
import {
  createSqlMemoryReader, createSqlMemoryWriter,
  persistIngestionRun, persistOrphan,
} from '@/lib/ingestion/adapters/sql-memory';
import { persistAutoMappings } from '@/lib/ingestion/memory';
import type { ConflictPolicySet, ParsedSource } from '@/lib/ingestion/types';
import { checkModule } from '@/lib/auth/requireModule';

export const runtime = 'nodejs';

// Identity columns the exploder should NOT treat as subject columns.
// Match against canonical names (after schema inference); the route
// does this match using the inferred mappings.
const IDENTITY_CANONICAL_FIELDS = new Set([
  'admission_no', 'first_name', 'last_name', 'other_name',
  'gender', 'date_of_birth', 'class_name', 'stream_name',
]);

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // ─── 1. Form parsing ─────────────────────────────────────────────────────
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `formData parse: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const file = form.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ success: false, error: 'file field required' }, { status: 400 });
  }
  const academicYearId = numericField(form, 'academic_year_id');
  const classId        = numericField(form, 'class_id');
  const resultTypeId   = numericField(form, 'result_type_id');
  const termId         = numericFieldOptional(form, 'term_id');
  if (!academicYearId || !classId || !resultTypeId) {
    return NextResponse.json(
      { success: false, error: 'academic_year_id, class_id, result_type_id required' },
      { status: 400 },
    );
  }

  let mappingOverrides: Record<string, string> | undefined;
  let conflictPolicy:   ConflictPolicySet | undefined;
  try {
    const o = form.get('overrides');
    if (typeof o === 'string') mappingOverrides = JSON.parse(o);
    const p = form.get('conflictPolicy');
    if (typeof p === 'string') conflictPolicy = JSON.parse(p);
  } catch {
    // Best-effort — bad JSON just means run without them.
  }
  const enforceAllocation = form.get('enforceAllocation') !== 'false';

  // ─── 2. Read the wide-shape upload into provenance-tagged rows ──────────
  let wideRows: ReturnType<typeof readWideRows>;
  try {
    const filename = (file as File).name ?? 'upload';
    const buf = Buffer.from(await file.arrayBuffer());
    wideRows = readWideRows(buf, filename);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `parse: ${(err as Error).message}` },
      { status: 400 },
    );
  }
  if (wideRows.rows.length === 0) {
    return NextResponse.json(
      { success: false, error: 'no rows in upload' },
      { status: 400 },
    );
  }

  // ─── 3. Infer which headers are identity vs subject ──────────────────────
  // Run a lightweight inference just on the wide headers — using the
  // students-shaped catalog won't quite work (results pipeline only
  // accepts admission_no/subject_name/score/grade/remarks). The
  // simplest robust approach: identity headers are those whose
  // normalised form matches admission_no synonyms; everything else is
  // a subject column.
  const memoryReader = createSqlMemoryReader();
  const memoryWriter = createSqlMemoryWriter();
  const wideMemory = await memoryReader
    .loadFieldMemory(session.schoolId, 'results')
    .catch(() => ({}));

  // For the wide layout, we run inferSchema with a 1-field catalog
  // (just admission_no) to detect which header IS the admission column;
  // every other header is treated as a subject column.
  const ADM_FIELD = RESULT_FIELDS.find(f => f.name === 'admission_no')!;
  const { inferSchema } = await import('@/lib/ingestion/schema-inference');
  const admInference = inferSchema(wideRows.headers, [ADM_FIELD], { memory: wideMemory });
  const admMapping = admInference.mappings.find(m => m.canonicalField === 'admission_no');
  if (!admMapping) {
    return NextResponse.json(
      { success: false, error: 'admission_no column not detected — supply mappingOverrides' },
      { status: 400 },
    );
  }
  const admHeader = admMapping.sourceHeader;
  const subjectHeaders = wideRows.headers.filter(h => h !== admHeader);

  // ─── 4. Re-key wide rows so admission_no is canonical ───────────────────
  const provRows = wideRows.rows.map(r => {
    const { __provenance, ...rest } = r;
    return {
      ...rest,
      admission_no: rest[admHeader],
      __provenance,
    } as Record<string, unknown> & { __provenance: typeof __provenance };
  });

  // ─── 5. Explode wide → narrow (one row per cell) ────────────────────────
  const exploded = explodeWideResultsRows({
    wideRows: provRows,
    subjectHeaders,
    identityHeaders: [admHeader],
  });
  if (exploded.length === 0) {
    return NextResponse.json(
      { success: false, error: 'no score cells found after explosion' },
      { status: 400 },
    );
  }
  // ParsedSource for the pipeline — headers are the post-explosion
  // canonical names; we don't need fuzzy mapping any more (the route
  // already produced the right shape).
  const parsed: ParsedSource = {
    rows: exploded.map(r => ({
      admission_no: r.admission_no,
      subject_name: r.subject_name,
      score: r.score,
      __provenance: r.__provenance,
    })) as unknown as ParsedSource['rows'],
    headers: ['admission_no', 'subject_name', 'score'],
    detectedFormat: wideRows.format,
  };

  // ─── 6. Build pipeline + run ────────────────────────────────────────────
  const pipeline = makeResultsPipeline({
    schoolId:       session.schoolId,
    academicYearId,
    termId,
    classId,
    resultTypeId,
    enforceAllocation,
    importedBy:     session.userId ?? null,
  });
  const lookup = createSqlPersonLookup();

  const report = await runIngestionPipeline({
    schoolId:        session.schoolId,
    parsed,
    pipeline,
    lookup,
    mappingMemory:   wideMemory, // currently empty for results — kept for future
    mappingOverrides,
    conflictPolicy,
  });

  // ─── 7. Persist memory, run, orphans ────────────────────────────────────
  // Readiness-audit Phase A: these were console.warn-only, invisible to
  // whoever's actually driving the import. Collected into `warnings` and
  // returned alongside the report — see students/import/v2/route.ts for
  // the identical fix and its rationale.
  const warnings: string[] = [];
  try {
    await persistAutoMappings({
      schoolId:     session.schoolId,
      pipelineName: 'results',
      mappings:     report.schemaInference.mappings,
      writer:       memoryWriter,
      approvedBy:   session.userId ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[results.v2] persistAutoMappings failed — this school will not benefit from learned column mapping on the next import:', err);
    warnings.push('Column-mapping memory failed to save — future imports for this school will need to re-map headers instead of remembering this run\'s choices.');
  }
  try {
    await persistIngestionRun({
      schoolId:    session.schoolId,
      pipelineName: 'results',
      runId:       report.runId,
      startedAt:   report.startedAt,
      finishedAt:  report.finishedAt,
      reportJson:  JSON.stringify(report),
      counts:      report.counts,
      initiatedBy: session.userId ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[results.v2] persistIngestionRun failed — this run has NO audit trail:', err);
    warnings.push('This import succeeded, but its audit-log entry (ingestion_runs) failed to save — the run itself is not recoverable from history.');
  }
  let orphanPersistFailures = 0;
  for (const outcome of report.outcomes) {
    if (outcome.decision.action === 'orphan') {
      try {
        await persistOrphan({
          schoolId:       session.schoolId,
          pipelineName:   'results',
          runId:          report.runId,
          sourceFile:     outcome.provenance.sourceFile,
          sourceSheet:    outcome.provenance.sourceSheet ?? null,
          sourceRowIndex: outcome.provenance.sourceRowIndex,
          reason:         outcome.decision.reason,
          candidatesJson: outcome.identity?.candidates
            ? JSON.stringify(outcome.identity.candidates)
            : null,
          payloadJson:    JSON.stringify(outcome.validated ?? outcome.mapped ?? outcome.raw),
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[results.v2] persistOrphan failed:', err);
        orphanPersistFailures++;
      }
    }
  }
  if (orphanPersistFailures > 0) {
    warnings.push(`${orphanPersistFailures} orphaned row(s) could not be saved to the review queue (ingestion_orphans) — they are still listed in this report's outcomes, but won't appear in the orphan-review UI.`);
  }

  return NextResponse.json({ success: true, report, warnings });
}

// ─── helpers ────────────────────────────────────────────────────────────────

function numericField(form: FormData, key: string): number {
  const raw = form.get(key);
  if (raw == null || raw === '') return 0;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : 0;
}
function numericFieldOptional(form: FormData, key: string): number | null {
  const raw = form.get(key);
  if (raw == null || raw === '') return null;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

interface WideRead {
  rows: Array<Record<string, unknown> & { __provenance: { sourceRowIndex: number; sourceFile: string; sourceSheet?: string } }>;
  headers: string[];
  format: 'csv' | 'xlsx';
}

function readWideRows(buf: Buffer, filename: string): WideRead {
  const lower = filename.toLowerCase();
  const isCsv = lower.endsWith('.csv');
  const wb = isCsv
    ? XLSX.read(buf.toString('utf-8'), { type: 'string' })
    : XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('workbook has no sheets');
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  if (aoa.length === 0) return { rows: [], headers: [], format: isCsv ? 'csv' : 'xlsx' };
  const headers = (aoa[0] as unknown[]).map(v => String(v ?? '').trim()).filter(Boolean);
  const rows: WideRead['rows'] = [];
  for (let i = 1; i < aoa.length; i++) {
    const arr = aoa[i] as unknown[];
    if (!Array.isArray(arr) || arr.every(v => v == null || v === '')) continue;
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => { row[h] = arr[idx]; });
    rows.push({
      ...row,
      __provenance: { sourceRowIndex: i + 1, sourceFile: filename, sourceSheet: sheetName },
    } as WideRead['rows'][number]);
  }
  return { rows, headers, format: isCsv ? 'csv' : 'xlsx' };
}
