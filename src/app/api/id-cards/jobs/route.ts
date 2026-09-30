/**
 * RETIRED — /api/id-cards/jobs (410 Gone).
 *
 * Registered a workbook the browser had already uploaded to private
 * Cloudinary storage, so the server could inspect its worksheets. Retired
 * along with /jobs/upload-ticket, /jobs/[id] and /jobs/[id]/extract — the
 * Excel -> card-records path is now entirely client-side (src/lib/idcards/
 * excel-client.ts). See upload-ticket/route.ts for the full explanation.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const gone = () => NextResponse.json(
  { success: false, error: 'This endpoint has been retired. ID card Excel import now runs entirely in the browser — no upload is needed.' },
  { status: 410 },
);

export function POST() { return gone(); }
export function GET() { return gone(); }
