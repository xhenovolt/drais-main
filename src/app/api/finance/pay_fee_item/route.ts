/**
 * DEPRECATED — duplicate single-item payment path, retired in the finance
 * consolidation. Use POST /api/finance/payments with an `items` array (each
 * { student_fee_item_id, amount }). Had no callers; returns 410.
 */
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Endpoint removed. Use POST /api/finance/payments with an items[] allocation.' },
    { status: 410 },
  );
}
