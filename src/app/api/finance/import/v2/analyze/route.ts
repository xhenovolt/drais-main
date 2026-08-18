/**
 * POST /api/finance/import/v2/analyze — workbook intelligence for fee
 * imports, no writes. Mirrors /api/students/import/v2/analyze exactly;
 * see that file for the full rationale. This is the fees-domain sibling,
 * added alongside the three existing legacy fee-import paths — none of
 * them are touched by this route.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { checkModule } from '@/lib/auth/requireModule';
import { inspectWorkbook } from '@/lib/ingestion/parse/workbook-inspect';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

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
    return NextResponse.json({
      success: false,
      error: 'CSV files have a single implicit sheet — workbook analysis is for multi-sheet XLSX uploads.',
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

  return NextResponse.json({ success: true, inspection });
}
