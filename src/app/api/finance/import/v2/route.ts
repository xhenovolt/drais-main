/**
 * POST /api/finance/import/v2 — the consolidated fees pipeline (import
 * redesign Phase C). Added ALONGSIDE the three existing legacy fee-import
 * paths (src/lib/finance/import.ts, feeImport.ts, /api/finance/bulk-import)
 * — none of them are touched, retired, or changed by this route. This is
 * the one new, consistent path going forward: one matching key
 * (admission_no, exact only — see pipelines/fees-schema.ts), one write
 * path (recordPayment(), already proven atomic), one audit trail
 * (ingestion_runs, same as students/results).
 *
 * Request/response shape mirrors /api/students/import/v2 exactly — see
 * that file's header for the full contract (sheets[] sourced from
 * .../analyze, dryRun, multi-sheet aggregation). The one behavioral
 * difference: a fee row with no matching student is ALWAYS held for
 * review (allowInsertOnNoMatch:false on the fees pipeline) — there is no
 * "create a new student from a fee row" concept.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { checkModule } from '@/lib/auth/requireModule';
import { runIngestionPipeline } from '@/lib/ingestion/pipeline';
import { makeFeesPipeline } from '@/lib/ingestion/pipelines/fees';
import { createSqlPersonLookup } from '@/lib/ingestion/adapters/sql-person-lookup';
import {
  createSqlMemoryReader, createSqlMemoryWriter,
  persistIngestionRun, persistOrphan,
} from '@/lib/ingestion/adapters/sql-memory';
import { persistAutoMappings } from '@/lib/ingestion/memory';
import { parseSheetToSource } from '@/lib/ingestion/parse/parse-sheet';
import type { IngestionReport, ParsedSource } from '@/lib/ingestion/types';

export const runtime = 'nodejs';

interface SheetSelection {
  sheetName: string;
  headerRowIndex: number;
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
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const ct = req.headers.get('content-type') ?? '';
  const warnings: string[] = [];
  let sources: Array<{ parsed: ParsedSource; overrides?: Record<string, string> }>;
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
      sheetSelections = [{ sheetName: 'Sheet1', headerRowIndex: 0 }];
    } else {
      const raw = form.get('sheets');
      if (typeof raw !== 'string') {
        return NextResponse.json({
          success: false,
          error: 'sheets[] is required for XLSX uploads — call POST .../analyze first.',
        }, { status: 400 });
      }
      try {
        sheetSelections = JSON.parse(raw);
        if (!Array.isArray(sheetSelections) || sheetSelections.length === 0) throw new Error('sheets must be a non-empty array');
      } catch (err) {
        return NextResponse.json({ success: false, error: `invalid sheets JSON: ${(err as Error).message}` }, { status: 400 });
      }
    }

    sources = sheetSelections.map((sel) => ({
      parsed: parseSheetToSource(buffer, filename, isCsv ? 'Sheet1' : sel.sheetName, sel.headerRowIndex),
      overrides: sel.overrides,
    }));
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
    sources = [{ parsed, overrides: body.overrides }];
  } else {
    return NextResponse.json({ success: false, error: `unsupported content-type: ${ct}` }, { status: 400 });
  }

  for (const s of sources) {
    if (s.parsed.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'no data rows found — check the selected header row' }, { status: 400 });
    }
  }

  const lookup = createSqlPersonLookup();
  const memoryReader = createSqlMemoryReader();
  const memoryWriter = createSqlMemoryWriter();
  const memory = await memoryReader.loadFieldMemory(session.schoolId, 'fees').catch(() => ({}));

  const reports: IngestionReport[] = [];
  const combinedCounts = zeroCombinedCounts();

  for (const { parsed, overrides } of sources) {
    const pipeline = makeFeesPipeline({ schoolId: session.schoolId, importedBy: session.userId ?? null });

    const report = await runIngestionPipeline({
      schoolId: session.schoolId,
      parsed,
      pipeline,
      lookup,
      mappingMemory: memory,
      mappingOverrides: overrides,
      // Fees deliberately has no conflictPolicy override surface yet —
      // every confident match always calls recordPayment() (see
      // pipelines/fees.ts's comment on why decision.action is always
      // 'update', never 'insert', for fees), so there's no per-field
      // conflict to resolve the way there is for a mutable student record.
      dryRun,
    });
    reports.push(report);
    addCounts(combinedCounts, report.counts);

    if (dryRun) continue;

    if (report.schemaInference.mappings.length > 0) {
      try {
        await persistAutoMappings({
          schoolId: session.schoolId, pipelineName: 'fees',
          mappings: report.schemaInference.mappings, writer: memoryWriter, approvedBy: session.userId ?? null,
        });
      } catch (err) {
        console.error('[fees.v2] persistAutoMappings failed:', err);
        warnings.push('Column-mapping memory failed to save for one sheet.');
      }
    }

    try {
      await persistIngestionRun({
        schoolId: session.schoolId, pipelineName: 'fees', runId: report.runId,
        startedAt: report.startedAt, finishedAt: report.finishedAt,
        reportJson: JSON.stringify(report), counts: report.counts, initiatedBy: session.userId ?? null,
      });
    } catch (err) {
      console.error('[fees.v2] persistIngestionRun failed — this run has NO audit trail:', err);
      warnings.push('An import succeeded, but its audit-log entry failed to save — that run is not recoverable from history.');
    }

    let orphanFailures = 0;
    for (const outcome of report.outcomes) {
      if (outcome.decision.action === 'orphan') {
        try {
          await persistOrphan({
            schoolId: session.schoolId, pipelineName: 'fees', runId: report.runId,
            sourceFile: outcome.provenance.sourceFile, sourceSheet: outcome.provenance.sourceSheet ?? null,
            sourceRowIndex: outcome.provenance.sourceRowIndex, reason: outcome.decision.reason,
            candidatesJson: outcome.identity?.candidates ? JSON.stringify(outcome.identity.candidates) : null,
            payloadJson: JSON.stringify(outcome.validated ?? outcome.mapped ?? outcome.raw),
          });
        } catch (err) {
          console.error('[fees.v2] persistOrphan failed:', err);
          orphanFailures++;
        }
      }
    }
    if (orphanFailures > 0) warnings.push(`${orphanFailures} row(s) needing review could not be saved to the review queue.`);
  }

  return NextResponse.json({ success: true, dryRun, reports, combinedCounts, warnings });
}
