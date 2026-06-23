/**
 * DEPRECATED — duplicate payment path, retired in the finance consolidation.
 *
 * Recording payments: POST /api/finance/payments (item-level, txn-safe, auto
 * receipt + ledger + reconciliation + audit). Listing payments: GET the same.
 * This route had no callers and wrote to an overlapping table set; it now
 * returns 410 so nothing silently resurrects a second write path.
 */
import { NextResponse } from 'next/server';

const GONE = NextResponse.json(
  { error: 'Endpoint removed. Use /api/finance/payments (GET to list, POST to record).' },
  { status: 410 },
);

export async function GET() { return GONE; }
export async function POST() { return GONE; }
