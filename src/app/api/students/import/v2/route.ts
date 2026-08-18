/**
 * POST /api/students/import/v2 — Unified Ingestion Pipeline path.
 *
 * Parallel to the legacy /api/students/import. Both routes coexist:
 *
 *   - Legacy keeps working unchanged for the ImportModal UI.
 *   - v2 is the redesigned path (readiness-audit import brief) — schools
 *     opt in via the new /students/import-v2 UI. Retired once proven.
 *
 * Request (multipart/form-data):
 *
 *   file: File (CSV or XLSX) — REQUIRED
 *   sheets: JSON array — REQUIRED for XLSX, ignored for CSV (which has one
 *           implicit sheet). Each entry:
 *             { sheetName: string, headerRowIndex: number,
 *               useSheetContext?: boolean,      // default: school setting
 *               overrides?: Record<string,string> }
 *           Get sheetName/headerRowIndex from POST .../analyze first — this
 *           route does NOT re-detect the header row, so preview and commit
 *           can never disagree about where the data starts.
 *   dryRun: 'true' | 'false' — default false. true runs every stage
 *           (mapping, validation, identity, conflict) without writing
 *           anything and without persisting to ingestion_runs/orphans/
 *           memory — a preview, not a partial commit.
 *   autoEnroll: 'true' | 'false' — default true.
 *
 * JSON body form (curl/scripts) is unchanged: { rows: [...], headers?: [...] }
 * — single flat table, no multi-sheet concept, dryRun still supported.
 *
 * Response:
 *   { success: true, dryRun: boolean, reports: IngestionReport[],
 *     combinedCounts: {...}, warnings: string[] }
 *   One IngestionReport per sheet (or one, for the JSON-body path).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { runIngestionPipeline } from '@/lib/ingestion/pipeline';
import { makeStudentsPipeline } from '@/lib/ingestion/pipelines/students';
import { createSqlPersonLookup } from '@/lib/ingestion/adapters/sql-person-lookup';
import {
  createSqlMemoryReader, createSqlMemoryWriter,
  persistIngestionRun, persistOrphan,
} from '@/lib/ingestion/adapters/sql-memory';
import { persistAutoMappings } from '@/lib/ingestion/memory';
import { parseSheetToSource } from '@/lib/ingestion/parse/parse-sheet';
import { inferContextFromSheetName } from '@/lib/ingestion/parse/sheet-name-context';
import { getImportSettings } from '@/lib/ingestion/settings';
import type { ConflictPolicySet, IngestionReport, ParsedSource, RawCellValue } from '@/lib/ingestion/types';

export const runtime = 'nodejs';

interface SheetSelection {
  sheetName: string;
  headerRowIndex: number;
  useSheetContext?: boolean;
  overrides?: Record<string, string>;
}

function zeroCombinedCounts() {
  return { parsed: 0, inserted: 0, updated: 0, merged: 0, skipped: 0, orphaned: 0, failed: 0 };
}

function addCounts(target: ReturnType<typeof zeroCombinedCounts>, r: IngestionReport['counts']) {
  target.parsed += r.parsed; target.inserted += r.inserted; target.updated += r.updated;
  target.merged += r.merged; target.skipped += r.skipped; target.orphaned += r.orphaned; target.failed += r.failed;
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const settings = await getImportSettings(session.schoolId);
  const conflictPolicy: ConflictPolicySet = { perField: {}, default: settings.fieldConflictDefault };

  const ct = req.headers.get('content-type') ?? '';
  const warnings: string[] = [];
  let sources: Array<{ parsed: ParsedSource; sheetContext?: { className: string | null; streamName: string | null } | null; overrides?: Record<string, string> }>;
  let dryRun = false;

  if (ct.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ success: false, error: 'could not read form data' }, { status: 400 });

    const file = form.get('file');
    if (!(file instanceof Blob)) return NextResponse.json({ success: false, error: 'file field required' }, { status: 400 });
    const filename = (file as File).name ?? 'upload';
    dryRun = form.get('dryRun') === 'true';

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (err) {
      return NextResponse.json({ success: false, error: `could not read upload: ${(err as Error).message}` }, { status: 400 });
    }

    const isCsv = filename.toLowerCase().endsWith('.csv');
    let sheetSelections: SheetSelection[];
    if (isCsv) {
      // CSV has one implicit sheet — no analyze step needed, header assumed
      // at row 0 (matches every other CSV path in the app; a CSV with a
      // title row ahead of its header is rare enough not to warrant the
      // full workbook-inspection machinery for a single-sheet format).
      sheetSelections = [{ sheetName: 'Sheet1', headerRowIndex: 0 }];
    } else {
      const raw = form.get('sheets');
      if (typeof raw !== 'string') {
        return NextResponse.json({
          success: false,
          error: 'sheets[] is required for XLSX uploads — call POST .../analyze first to get sheetName + headerRowIndex per sheet, then pass the ones the user selected here.',
        }, { status: 400 });
      }
      try {
        sheetSelections = JSON.parse(raw);
        if (!Array.isArray(sheetSelections) || sheetSelections.length === 0) throw new Error('sheets must be a non-empty array');
      } catch (err) {
        return NextResponse.json({ success: false, error: `invalid sheets JSON: ${(err as Error).message}` }, { status: 400 });
      }
    }

    sources = sheetSelections.map((sel) => {
      const parsed = parseSheetToSource(buffer, filename, isCsv ? 'Sheet1' : sel.sheetName, sel.headerRowIndex);
      const useContext = sel.useSheetContext ?? settings.allowSheetNameContext;
      const sheetContext = useContext && !isCsv ? inferContextFromSheetName(sel.sheetName) : null;
      return { parsed, sheetContext: sheetContext && sheetContext.confidence > 0 ? sheetContext : null, overrides: sel.overrides };
    });
  } else if (ct.includes('application/json')) {
    const body = await req.json().catch(() => null) as { rows?: unknown[]; headers?: string[]; dryRun?: boolean; overrides?: Record<string, string> } | null;
    if (!body || !Array.isArray(body.rows)) {
      return NextResponse.json({ success: false, error: 'rows[] required in JSON body' }, { status: 400 });
    }
    dryRun = body.dryRun === true;
    const headers = Array.isArray(body.headers) && body.headers.length > 0
      ? body.headers
      : Object.keys((body.rows[0] ?? {}) as Record<string, unknown>);
    const parsed: ParsedSource = {
      rows: body.rows.map((r, i) => ({
        ...(r as Record<string, unknown>),
        __provenance: { sourceRowIndex: i + 1, sourceFile: 'api' },
      })) as ParsedSource['rows'],
      headers,
      detectedFormat: 'json',
    };
    sources = [{ parsed, sheetContext: null, overrides: body.overrides }];
  } else {
    return NextResponse.json({ success: false, error: `unsupported content-type: ${ct}` }, { status: 400 });
  }

  for (const s of sources) {
    if (s.parsed.rows.length === 0) {
      return NextResponse.json({ success: false, error: `no data rows found${s.parsed.headers.length ? '' : ' (and no headers detected either)'} — check the selected header row` }, { status: 400 });
    }
  }

  const lookup = createSqlPersonLookup();
  const memoryReader = createSqlMemoryReader();
  const memoryWriter = createSqlMemoryWriter();
  const memory = await memoryReader.loadFieldMemory(session.schoolId, 'students').catch(() => ({}));

  const reports: IngestionReport[] = [];
  const combinedCounts = zeroCombinedCounts();

  for (const { parsed, sheetContext, overrides } of sources) {
    const pipeline = makeStudentsPipeline({
      schoolId: session.schoolId,
      importedBy: session.userId ?? null,
      autoEnroll: true,
      allowUpdateExisting: settings.allowUpdateExisting,
      allowClassReassignment: settings.allowClassReassignment,
      autoCreateMissingClasses: settings.autoCreateMissingClasses,
    });

    // Sheet-name-derived context (e.g. "S.2 Blue" -> class/stream) is a
    // DEFAULT applied only when the row's own class/stream column is
    // empty — never overrides an explicit value the school actually
    // typed in. Wrapping validateRow rather than touching pipeline.ts
    // keeps this entirely a route-level concern.
    if (sheetContext) {
      const originalValidate = pipeline.validateRow;
      pipeline.validateRow = (mapped, provenance) => {
        const withDefaults: Record<string, RawCellValue> = { ...mapped };
        if (!withDefaults.class_name && sheetContext.className) withDefaults.class_name = sheetContext.className;
        if (!withDefaults.stream_name && sheetContext.streamName) withDefaults.stream_name = sheetContext.streamName;
        return originalValidate(withDefaults, provenance);
      };
    }

    const report = await runIngestionPipeline({
      schoolId: session.schoolId,
      parsed,
      pipeline,
      lookup,
      mappingMemory: memory,
      mappingOverrides: overrides,
      conflictPolicy,
      dryRun,
    });
    // Effective name requirement (OR-group, not expressible by the
    // generic per-field `required` flag): a name is resolvable if EITHER
    // first_name + last_name are both mapped, OR full_name is mapped.
    // first_name/last_name/full_name are all non-required in the schema
    // (see students-schema.ts) precisely so this OR logic lives here
    // instead of incorrectly blocking on either shape alone.
    const mappedFields = new Set(
      report.schemaInference.mappings.filter(m => m.canonicalField).map(m => m.canonicalField as string),
    );
    const hasSeparateName = mappedFields.has('first_name') && mappedFields.has('last_name');
    const hasFullName = mappedFields.has('full_name');
    if (!hasSeparateName && !hasFullName) {
      report.schemaInference.unresolvedRequired = [
        ...report.schemaInference.unresolvedRequired,
        'first_name+last_name (or a single combined Name column)',
      ];
    }

    reports.push(report);
    addCounts(combinedCounts, report.counts);

    if (dryRun) continue; // preview only — no memory/audit persistence for a run that wrote nothing

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
        console.error('[students.v2] persistAutoMappings failed — this school will not benefit from learned column mapping on the next import:', err);
        warnings.push(`Column-mapping memory failed to save for sheet "${parsed.rows[0]?.__provenance.sourceSheet ?? 'unknown'}".`);
      }
    }

    try {
      await persistIngestionRun({
        schoolId: session.schoolId,
        pipelineName: 'students',
        runId: report.runId,
        startedAt: report.startedAt,
        finishedAt: report.finishedAt,
        reportJson: JSON.stringify(report),
        counts: report.counts,
        initiatedBy: session.userId ?? null,
      });
    } catch (err) {
      console.error('[students.v2] persistIngestionRun failed — this run has NO audit trail:', err);
      warnings.push('An import succeeded, but its audit-log entry (ingestion_runs) failed to save — that run is not recoverable from history.');
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
            candidatesJson: outcome.identity?.candidates ? JSON.stringify(outcome.identity.candidates) : null,
            payloadJson: JSON.stringify(outcome.validated ?? outcome.mapped ?? outcome.raw),
          });
        } catch (err) {
          console.error('[students.v2] persistOrphan failed:', err);
          orphanPersistFailures++;
        }
      }
    }
    if (orphanPersistFailures > 0) {
      warnings.push(`${orphanPersistFailures} orphaned row(s) could not be saved to the review queue.`);
    }
  }

  return NextResponse.json({ success: true, dryRun, reports, combinedCounts, warnings });
}
