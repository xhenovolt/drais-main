/**
 * GET    /api/id-cards/jobs/:id — job metadata + worksheet inspection.
 * DELETE /api/id-cards/jobs/:id — destroy the job and its stored workbook now.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCardsAccess, isResponse } from '@/lib/idcards/access';
import { deleteJob, getJob, getJobData } from '@/lib/idcards/jobs';
import { inspectWorkbook, suggestMapping } from '@/lib/idcards/excel';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const s = await requireCardsAccess(req);
  if (isResponse(s)) return s;
  const { id } = await ctx.params;
  const job = await getJob(id, s.schoolId, s.userId);
  if (!job) return NextResponse.json({ error: 'Job not found or expired' }, { status: 404 });
  const data = await getJobData(id, s.schoolId, s.userId);
  if (!data) return NextResponse.json({ error: 'Job not found or expired' }, { status: 404 });
  const sheets = inspectWorkbook(data).sheets;
  return NextResponse.json({
    success: true,
    jobId: job.job_uuid, fileName: job.file_name, status: job.status, expiresAt: job.expires_at,
    savedMapping: job.mapping_json ? safeJson(job.mapping_json) : null,
    sheetName: job.sheet_name, headerRow: job.header_row,
    sheets, suggested: sheets.map((sh) => ({ sheet: sh.name, mapping: suggestMapping(sh.headers) })),
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const s = await requireCardsAccess(req);
  if (isResponse(s)) return s;
  const { id } = await ctx.params;
  const ok = await deleteJob(id, s.schoolId, s.userId);
  if (!ok) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  await logAudit({ schoolId: s.schoolId, userId: s.userId, action: 'ID_CARD_JOB_DELETED', entityType: 'id_card_job', entityId: id });
  return NextResponse.json({ success: true });
}

function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return null; } }
