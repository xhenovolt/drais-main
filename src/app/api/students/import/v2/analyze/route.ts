/**
 * POST /api/students/import/v2/analyze — workbook intelligence, no writes.
 *
 * Step 1 of the redesigned import flow (readiness-audit brief §9-10):
 * upload a workbook, get back what DRAIS believes every sheet means —
 * purpose guess, detected header row, sheet-name-derived context — before
 * anything is mapped, matched, or written. No DB access beyond auth and
 * reading the school's saved import settings; nothing here can mutate
 * student/fee data.
 *
 * Request: multipart/form-data with a `file` field (CSV or XLSX).
 * Response: { success, inspection: WorkbookInspection, settings: ImportSettings }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { inspectWorkbook } from '@/lib/ingestion/parse/workbook-inspect';
import { getImportSettings } from '@/lib/ingestion/settings';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const ct = req.headers.get('content-type') ?? '';
  if (!ct.includes('multipart/form-data')) {
    return NextResponse.json({ success: false, error: 'expected multipart/form-data with a file field' }, { status: 400 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ success: false, error: 'file field required' }, { status: 400 });
  }

  const filename = (file as File).name ?? 'upload';
  if (filename.toLowerCase().endsWith('.csv')) {
    // CSV has exactly one "sheet" by construction — workbook inspection's
    // value is entirely about multi-sheet XLSX. Tell the caller plainly
    // rather than force CSV through XLSX.read and pretend it was inspected.
    return NextResponse.json({
      success: false,
      error: 'CSV files have a single implicit sheet — workbook analysis is for multi-sheet XLSX uploads. Use the main import endpoint directly for CSV.',
    }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch (err) {
    return NextResponse.json({ success: false, error: `could not read upload: ${(err as Error).message}` }, { status: 400 });
  }

  let inspection;
  try {
    inspection = inspectWorkbook(buffer);
  } catch (err) {
    return NextResponse.json({ success: false, error: `could not parse workbook: ${(err as Error).message}` }, { status: 400 });
  }

  const settings = await getImportSettings(session.schoolId);

  return NextResponse.json({ success: true, inspection, settings });
}
