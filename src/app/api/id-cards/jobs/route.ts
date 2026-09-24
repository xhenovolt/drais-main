/**
 * POST /api/id-cards/jobs — upload an Excel workbook for card generation.
 * GET  /api/id-cards/jobs — the caller's own live jobs.
 *
 * The workbook is stored privately in id_card_jobs (no URL, no Cloudinary) and
 * expires automatically. Nothing here writes student/people/enrollment rows.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCardsAccess, isResponse } from '@/lib/idcards/access';
import { createJob, listJobs } from '@/lib/idcards/jobs';
import { inspectWorkbook, looksLikeWorkbook, MAX_XLSX_BYTES, suggestMapping } from '@/lib/idcards/excel';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const s = await requireCardsAccess(req);
  if (isResponse(s)) return s;

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'Expected a multipart upload' }, { status: 400 }); }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: 'The file is empty' }, { status: 400 });
  if (file.size > MAX_XLSX_BYTES) {
    return NextResponse.json({ error: `File is too large (max ${MAX_XLSX_BYTES / 1024 / 1024} MB)` }, { status: 413 });
  }
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    return NextResponse.json({ error: 'Upload an Excel file (.xlsx or .xls)' }, { status: 400 });
  }

  const data = Buffer.from(await file.arrayBuffer());
  if (!looksLikeWorkbook(data)) {
    return NextResponse.json({ error: 'That file is not a valid Excel workbook' }, { status: 400 });
  }

  let sheets;
  try { sheets = inspectWorkbook(data).sheets; }
  catch { return NextResponse.json({ error: 'The workbook could not be read. Re-save it as .xlsx and try again.' }, { status: 422 }); }
  if (sheets.length === 0) return NextResponse.json({ error: 'The workbook has no worksheets' }, { status: 422 });

  const job = await createJob({ schoolId: s.schoolId, userId: s.userId, fileName: file.name, data });
  await logAudit({
    schoolId: s.schoolId, userId: s.userId, action: 'ID_CARD_JOB_UPLOADED', entityType: 'id_card_job',
    entityId: job.uuid, details: { sizeBytes: data.length, sheets: sheets.length },
  });

  const suggested = sheets.map((sh) => ({ sheet: sh.name, mapping: suggestMapping(sh.headers) }));
  return NextResponse.json({ success: true, jobId: job.uuid, expiresAt: job.expiresAt, fileName: file.name, sheets, suggested });
}

export async function GET(req: NextRequest) {
  const s = await requireCardsAccess(req);
  if (isResponse(s)) return s;
  const jobs = await listJobs(s.schoolId, s.userId);
  return NextResponse.json({
    success: true,
    jobs: jobs.map((j) => ({
      jobId: j.job_uuid, fileName: j.file_name, status: j.status, rowCount: j.row_count,
      sheetName: j.sheet_name, expiresAt: j.expires_at, createdAt: j.created_at,
    })),
  });
}
