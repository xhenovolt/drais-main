/**
 * POST /api/id-cards/jobs — register a workbook the browser already uploaded
 *                           (via /jobs/upload-ticket) to private Cloudinary storage.
 * GET  /api/id-cards/jobs — the caller's own live jobs.
 *
 * Body: { publicId, fileName }. The server verifies the id belongs to this
 * school + user, fetches the file through a signed private URL, validates it and
 * inspects the worksheets. Invalid uploads are destroyed immediately.
 * Nothing here writes student/people/enrollment rows.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { requireCardsAccess, isResponse } from '@/lib/idcards/access';
import { createJob, listJobs } from '@/lib/idcards/jobs';
import { inspectWorkbook, looksLikeWorkbook, suggestMapping } from '@/lib/idcards/excel';
import { destroyWorkbook, downloadWorkbook, extensionOf, ownsPublicId } from '@/lib/idcards/storage';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const s = await requireCardsAccess(req);
  if (isResponse(s)) return s;

  const body = await req.json().catch(() => null) as any;
  const publicId = typeof body?.publicId === 'string' ? body.publicId : '';
  const fileName = typeof body?.fileName === 'string' ? body.fileName : '';
  if (!ownsPublicId(publicId, s.schoolId, s.userId) || !extensionOf(fileName)) {
    return NextResponse.json({ error: 'Invalid upload reference' }, { status: 400 });
  }

  let data: Buffer;
  try { data = await downloadWorkbook(publicId); }
  catch (e: any) { return NextResponse.json({ error: e?.message || 'The uploaded file could not be read' }, { status: 422 }); }

  const reject = async (error: string, status: number) => {
    await destroyWorkbook(publicId);
    return NextResponse.json({ error }, { status });
  };
  if (data.length === 0) return reject('The file is empty', 400);
  if (!looksLikeWorkbook(data)) return reject('That file is not a valid Excel workbook', 400);

  let sheets;
  try { sheets = inspectWorkbook(data).sheets; }
  catch { return reject('The workbook could not be read. Re-save it as .xlsx and try again.', 422); }
  if (sheets.length === 0) return reject('The workbook has no worksheets', 422);

  const job = await createJob({
    schoolId: s.schoolId, userId: s.userId, fileName, storageRef: publicId, size: data.length,
    sha256: createHash('sha256').update(data).digest('hex'),
  });
  await logAudit({
    schoolId: s.schoolId, userId: s.userId, action: 'ID_CARD_JOB_UPLOADED', entityType: 'id_card_job',
    entityId: job.uuid, details: { sizeBytes: data.length, sheets: sheets.length },
  });

  const suggested = sheets.map((sh) => ({ sheet: sh.name, mapping: suggestMapping(sh.headers) }));
  return NextResponse.json({ success: true, jobId: job.uuid, expiresAt: job.expiresAt, fileName, sheets, suggested });
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
