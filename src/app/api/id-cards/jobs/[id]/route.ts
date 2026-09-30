/**
 * RETIRED — /api/id-cards/jobs/:id (410 Gone).
 *
 * Fetched/deleted a stored workbook job. See ../route.ts and
 * ../upload-ticket/route.ts — the Excel -> card-records path is now
 * entirely client-side.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const gone = () => NextResponse.json(
  { success: false, error: 'This endpoint has been retired. ID card Excel import now runs entirely in the browser — no upload is needed.' },
  { status: 410 },
);

export function GET() { return gone(); }
export function DELETE() { return gone(); }
