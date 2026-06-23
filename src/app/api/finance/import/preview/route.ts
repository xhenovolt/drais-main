/**
 * POST /api/finance/import/preview
 * Stage + match + dedup an uploaded statement WITHOUT posting anything.
 * Body: { sourceSystem, importType, filename?, termId?, rows: NormalizedRow[] }
 * The client parses the Excel/CSV and maps columns → the normalized fields.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createPreview, type SourceSystem, type ImportType, type NormalizedRow } from '@/lib/finance/import';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  const rows: NormalizedRow[] = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  if (rows.length > 5000) return NextResponse.json({ error: 'Too many rows (max 5000 per batch)' }, { status: 400 });

  const sourceSystem = (body.sourceSystem || 'manual_excel') as SourceSystem;
  const importType = (body.importType === 'opening_balances' ? 'opening_balances' : 'payments') as ImportType;

  try {
    const result = await createPreview({
      schoolId: session.schoolId,
      sourceSystem,
      importType,
      filename: body.filename,
      termId: body.termId ? Number(body.termId) : null,
      rows,
      createdBy: session.userId,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    console.error('[finance/import/preview]', e);
    return NextResponse.json({ error: e.message || 'Preview failed' }, { status: 500 });
  }
}
