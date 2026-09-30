/**
 * RETIRED — /api/id-cards/jobs/:id/extract (410 Gone).
 *
 * Applied a column mapping to a stored workbook server-side. See ../route.ts
 * and ../../upload-ticket/route.ts — the Excel -> card-records path,
 * including column mapping and row extraction, is now entirely client-side
 * (src/lib/idcards/excel-client.ts).
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export function POST() {
  return NextResponse.json(
    { success: false, error: 'This endpoint has been retired. ID card Excel import now runs entirely in the browser — no upload is needed.' },
    { status: 410 },
  );
}
