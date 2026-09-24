/**
 * POST /api/id-cards/jobs/upload-ticket   { fileName, size }
 * Returns a signed, school+user-scoped ticket the browser uses to upload the
 * workbook DIRECTLY to private Cloudinary storage (no size limit from this server).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireCardsAccess, isResponse } from '@/lib/idcards/access';
import { extensionOf, signWorkbookUpload, MAX_WORKBOOK_BYTES } from '@/lib/idcards/storage';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const s = await requireCardsAccess(req);
  if (isResponse(s)) return s;
  const body = await req.json().catch(() => null) as any;
  const ext = typeof body?.fileName === 'string' ? extensionOf(body.fileName) : null;
  if (!ext) return NextResponse.json({ error: 'Upload an Excel file (.xlsx or .xls)' }, { status: 400 });
  if (Number(body?.size) > MAX_WORKBOOK_BYTES) {
    return NextResponse.json({ error: `File is too large (max ${MAX_WORKBOOK_BYTES / 1024 / 1024} MB)` }, { status: 413 });
  }
  try {
    return NextResponse.json({ success: true, ticket: signWorkbookUpload(s.schoolId, s.userId, ext) });
  } catch (e: any) {
    console.error('[id-cards/upload-ticket]', e?.message);
    return NextResponse.json({ error: 'File storage is not configured' }, { status: 503 });
  }
}
