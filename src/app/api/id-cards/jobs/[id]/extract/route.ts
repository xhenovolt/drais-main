/**
 * POST /api/id-cards/jobs/:id/extract
 * Body: { sheetName, headerRow, mapping: {fieldKey: headerName}, requiredFields?: string[] }
 *
 * Applies a column mapping to the stored workbook and returns validated card
 * records plus every row issue (nothing is silently dropped). The mapping is
 * remembered on the job. Read-only with respect to all student tables.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCardsAccess, isResponse } from '@/lib/idcards/access';
import { getJob, getJobData, saveMapping } from '@/lib/idcards/jobs';
import { extractRows, CARD_FIELDS } from '@/lib/idcards/excel';
import { query } from '@/lib/db';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const s = await requireCardsAccess(req);
  if (isResponse(s)) return s;
  const { id } = await ctx.params;

  const job = await getJob(id, s.schoolId, s.userId);
  if (!job) return NextResponse.json({ error: 'Job not found or expired' }, { status: 404 });
  const data = await getJobData(id, s.schoolId, s.userId);
  if (!data) return NextResponse.json({ error: 'Job not found or expired' }, { status: 404 });

  const body = await req.json().catch(() => null) as any;
  if (!body || typeof body.sheetName !== 'string') return NextResponse.json({ error: 'sheetName is required' }, { status: 400 });
  const headerRow = Number.isInteger(body.headerRow) && body.headerRow >= 1 && body.headerRow <= 50 ? body.headerRow : 1;

  const allowed = new Set(CARD_FIELDS.map((f) => f.key));
  const mapping: Record<string, string> = {};
  if (body.mapping && typeof body.mapping === 'object') {
    for (const [k, v] of Object.entries(body.mapping)) {
      if (allowed.has(k) && typeof v === 'string' && v) mapping[k] = v.slice(0, 120);
    }
  }
  const requiredFields = Array.isArray(body.requiredFields)
    ? body.requiredFields.filter((f: unknown) => typeof f === 'string' && allowed.has(f))
    : undefined;

  const schoolRows = (await query('SELECT name FROM schools WHERE id = ? LIMIT 1', [s.schoolId])) as Array<{ name: string }>;

  let result;
  try {
    result = extractRows(data, {
      sheetName: body.sheetName, headerRow, mapping, requiredFields,
      schoolName: schoolRows[0]?.name ?? '',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Could not read the worksheet' }, { status: 422 });
  }

  await saveMapping(id, s.schoolId, s.userId, { sheetName: body.sheetName, headerRow, mapping, rowCount: result.rows.length });
  await logAudit({
    schoolId: s.schoolId, userId: s.userId, action: 'ID_CARD_JOB_MAPPED', entityType: 'id_card_job', entityId: id,
    details: {
      rows: result.rows.length,
      errors: result.rows.filter((r) => r.status === 'error').length,
      warnings: result.rows.filter((r) => r.status === 'warning').length,
    },
  });

  return NextResponse.json({
    success: true,
    ...result,
    summary: {
      total: result.rows.length,
      ok: result.rows.filter((r) => r.status === 'ok').length,
      warnings: result.rows.filter((r) => r.status === 'warning').length,
      errors: result.rows.filter((r) => r.status === 'error').length,
    },
  });
}
