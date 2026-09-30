/**
 * RETIRED — /api/id-cards/jobs/upload-ticket (410 Gone).
 *
 * Signed a Cloudinary upload ticket so a spreadsheet workbook could be sent
 * to private cloud storage for server-side parsing. Retired because the
 * Excel → card-records path (src/components/idcards/IdCardGenerate.tsx) is
 * now entirely client-side (src/lib/idcards/excel-client.ts, exceljs): the
 * workbook, including any photos pasted directly into a column, is parsed
 * in the browser and never uploaded anywhere. This also means a school's
 * learner photos are never written to Cloudinary just to make a batch of
 * ID cards.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export function POST() {
  return NextResponse.json(
    { success: false, error: 'This endpoint has been retired. ID card Excel import now runs entirely in the browser — no upload is needed.' },
    { status: 410 },
  );
}
