/**
 * POST /api/students/import/v2 — Unified Ingestion Pipeline path.
 *
 * Parallel to the legacy /api/students/import. Both routes coexist
 * during Phase 2 migration:
 *
 *   - Legacy keeps working unchanged for the ImportModal UI.
 *   - v2 lets schools opt in via direct API call (or a future UI
 *     toggle) to validate the unified pipeline against their real
 *     exports before we flip the default.
 *
 * Request shape (multipart/form-data OR JSON):
 *
 *   file: File (CSV or XLSX) — REQUIRED
 *   overrides?: JSON string of { sourceHeader → canonicalField } — optional
 *               human-supplied mapping that wins over inference
 *   conflictPolicy?: JSON string of ConflictPolicySet — optional, falls
 *                    back to safe prefer-existing default
 *   autoEnroll?: boolean — auto-create active enrolment when class_name
 *                resolves to an existing class. Default true.
 *
 * Response (JSON):
 *
 *   {
 *     success: true,
 *     report: IngestionReport      // full per-row outcomes + counts +
 *                                   // schemaInference for the review UI
 *   }
 *
 *   The full report is also persisted to ingestion_runs for audit.
 *   Orphans land in ingestion_orphans for the human-review UI (Phase 6
 *   from the original brief).
 */

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSessionSchoolId } from '@/lib/auth';
import { runIngestionPipeline } from '@/lib/ingestion/pipeline';
import { makeStudentsPipeline } from '@/lib/ingestion/pipelines/students';
import { createSqlPersonLookup } from '@/lib/ingestion/adapters/sql-person-lookup';
import {
  createSqlMemoryReader, createSqlMemoryWriter,
  persistIngestionRun, persistOrphan,
} from '@/lib/ingestion/adapters/sql-memory';
import { persistAutoMappings } from '@/lib/ingestion/memory';
import type { ConflictPolicySet, ParsedSource } from '@/lib/ingestion/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // 1. PARSE the upload. The pipeline doesn't touch parsing — it's too
  //    format-dependent. We support multipart form-data (browser) and
  //    JSON body (curl / scripts).
  let parsed: ParsedSource;
  try {
    parsed = await parseRequest(req);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `parse: ${(err as Error).message}` },
      { status: 400 },
    );
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { success: false, error: 'no rows in upload' },
      { status: 400 },
    );
  }

  // 2. Pull caller-supplied overrides (from a future review UI).
  let mappingOverrides: Record<string, string> | undefined;
  let conflictPolicy:   ConflictPolicySet | undefined;
  let autoEnroll = true;
  try {
    const form = req.headers.get('content-type')?.includes('multipart/form-data')
      ? await req.formData().catch(() => null)
      : null;
    if (form) {
      const o = form.get('overrides');
      if (typeof o === 'string') mappingOverrides = JSON.parse(o);
      const p = form.get('conflictPolicy');
      if (typeof p === 'string') conflictPolicy = JSON.parse(p);
      const a = form.get('autoEnroll');
      if (a === 'false' || a === '0') autoEnroll = false;
    }
  } catch {
    // Best-effort — bad overrides JSON just means we run without them.
  }

  // 3. Build the pipeline + adapters.
  const pipeline = makeStudentsPipeline({
    schoolId: session.schoolId,
    importedBy: session.userId ?? null,
    autoEnroll,
  });
  const lookup = createSqlPersonLookup();
  const memoryReader = createSqlMemoryReader();
  const memoryWriter = createSqlMemoryWriter();

  const memory = await memoryReader.loadFieldMemory(session.schoolId, 'students')
    .catch(() => ({}));

  // 4. RUN.
  const report = await runIngestionPipeline({
    schoolId: session.schoolId,
    parsed,
    pipeline,
    lookup,
    mappingMemory: memory,
    mappingOverrides,
    conflictPolicy,
  });

  // 5. Persist auto-rememberable mappings — high-confidence non-fuzzy
  //    hits get cached so the school sees them automatically next time.
  const warnings: string[] = [];
  if (report.schemaInference.mappings.length > 0) {
    try {
      await persistAutoMappings({
        schoolId: session.schoolId,
        pipelineName: 'students',
        mappings: report.schemaInference.mappings,
        writer: memoryWriter,
        approvedBy: session.userId ?? null,
      });
    } catch (err) {
      // Memory persistence failure is non-fatal — the import succeeded.
      // eslint-disable-next-line no-console
      console.error('[students.v2] persistAutoMappings failed — this school will not benefit from learned column mapping on the next import:', err);
      warnings.push('Column-mapping memory failed to save — future imports for this school will need to re-map headers instead of remembering this run\'s choices.');
    }
  }

  // 6. Persist run + orphans for the audit log. Readiness-audit Phase A:
  // these failures used to be console.warn-only — invisible to whoever's
  // actually driving the import, since nothing in the response said the
  // audit trail didn't get written. Collected into `warnings` and returned
  // alongside the report instead, so a broken tracking table is visible to
  // the caller, not just to whoever happens to be tailing server logs.
  try {
    await persistIngestionRun({
      schoolId:    session.schoolId,
      pipelineName: 'students',
      runId:       report.runId,
      startedAt:   report.startedAt,
      finishedAt:  report.finishedAt,
      reportJson:  JSON.stringify(report),
      counts:      report.counts,
      initiatedBy: session.userId ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[students.v2] persistIngestionRun failed — this run has NO audit trail:', err);
    warnings.push('This import succeeded, but its audit-log entry (ingestion_runs) failed to save — the run itself is not recoverable from history.');
  }
  let orphanPersistFailures = 0;
  for (const outcome of report.outcomes) {
    if (outcome.decision.action === 'orphan') {
      try {
        await persistOrphan({
          schoolId: session.schoolId,
          pipelineName: 'students',
          runId: report.runId,
          sourceFile: outcome.provenance.sourceFile,
          sourceSheet: outcome.provenance.sourceSheet ?? null,
          sourceRowIndex: outcome.provenance.sourceRowIndex,
          reason: outcome.decision.reason,
          candidatesJson: outcome.identity?.candidates
            ? JSON.stringify(outcome.identity.candidates)
            : null,
          payloadJson: JSON.stringify(outcome.validated ?? outcome.mapped ?? outcome.raw),
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[students.v2] persistOrphan failed:', err);
        orphanPersistFailures++;
      }
    }
  }
  if (orphanPersistFailures > 0) {
    warnings.push(`${orphanPersistFailures} orphaned row(s) could not be saved to the review queue (ingestion_orphans) — they are still listed in this report's outcomes, but won't appear in the orphan-review UI.`);
  }

  return NextResponse.json({ success: true, report, warnings });
}

// ─── Parser ──────────────────────────────────────────────────────────────────
async function parseRequest(req: NextRequest): Promise<ParsedSource> {
  const ct = req.headers.get('content-type') ?? '';

  if (ct.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) throw new Error('file field missing');
    const filename = (file as File).name ?? 'upload';
    const buf = Buffer.from(await file.arrayBuffer());
    return parseBuffer(buf, filename);
  }

  if (ct.includes('application/json')) {
    const body = await req.json() as { rows?: unknown[]; headers?: string[] };
    if (!Array.isArray(body.rows)) throw new Error('rows[] required in JSON body');
    const headers = Array.isArray(body.headers) && body.headers.length > 0
      ? body.headers
      : Object.keys((body.rows[0] ?? {}) as Record<string, unknown>);
    return {
      rows: body.rows.map((r, i) => ({
        ...(r as Record<string, unknown>),
        __provenance: { sourceRowIndex: i + 1, sourceFile: 'api' },
      })) as ParsedSource['rows'],
      headers,
      detectedFormat: 'json',
    };
  }

  throw new Error(`unsupported content-type: ${ct}`);
}

function parseBuffer(buf: Buffer, filename: string): ParsedSource {
  const lower = filename.toLowerCase();
  const isCsv = lower.endsWith('.csv');

  const wb = isCsv
    ? XLSX.read(buf.toString('utf-8'), { type: 'string' })
    : XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('workbook has no sheets');
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  if (aoa.length === 0) return { rows: [], headers: [], detectedFormat: isCsv ? 'csv' : 'xlsx' };

  const headers = (aoa[0] as unknown[]).map(v => String(v ?? '').trim()).filter(Boolean);
  const rows: ParsedSource['rows'] = [];
  for (let i = 1; i < aoa.length; i++) {
    const arr = aoa[i] as unknown[];
    if (!Array.isArray(arr) || arr.every(v => v == null || v === '')) continue;
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => { row[h] = arr[idx]; });
    rows.push({
      ...row,
      __provenance: { sourceRowIndex: i + 1, sourceFile: filename, sourceSheet: sheetName },
    } as ParsedSource['rows'][number]);
  }

  return { rows, headers, detectedFormat: isCsv ? 'csv' : 'xlsx' };
}
