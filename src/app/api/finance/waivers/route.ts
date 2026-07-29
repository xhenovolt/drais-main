/**
 * DEPRECATED — retired in the Finance Consolidation Stage C.
 *
 * Waivers/discounts/overrides: GET/POST /api/finance/fee-rules/adjustments
 * (list, create), PATCH/DELETE /api/finance/fee-rules/adjustments/[id]
 * (approve/reject, remove). Backed by learner_fee_adjustments, not
 * waivers_discounts — approving there re-prices any already-generated bill
 * immediately (repriceApprovedAdjustments in src/lib/finance/feeRules.ts),
 * not just future bill runs, closing the one real gap the older table's
 * direct student_fee_items.waived mutation covered.
 *
 * This route now returns 410 so nothing silently resurrects a second write
 * path — same pattern as /api/finance/fee_payments.
 */
import { NextResponse } from 'next/server';

const GONE = NextResponse.json(
  { error: 'Endpoint removed. Use /api/finance/fee-rules/adjustments (GET/POST) and /api/finance/fee-rules/adjustments/[id] (PATCH/DELETE).' },
  { status: 410 },
);

export async function GET() { return GONE; }
export async function POST() { return GONE; }
export async function PUT() { return GONE; }
export async function DELETE() { return GONE; }
