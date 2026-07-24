/**
 * RETIRED (route-hardening audit P0). This endpoint aggregated ledger,
 * balance_sheet and ALL students' names+scores with NO authentication and NO
 * school scoping — a cross-tenant data leak — and had zero callers. Removed.
 *
 * Per-school finance/analytics live behind session-scoped routes:
 *   /api/finance/reports/income-statement, /api/finance/reports/balance-sheet,
 *   /api/analytics/*  (all require getSessionSchoolId + school_id scope).
 */
import { NextResponse } from 'next/server';

const GONE = NextResponse.json(
  { error: 'Endpoint retired. Use the session-scoped /api/finance/reports/* and /api/analytics/* routes.' },
  { status: 410 },
);

export async function GET() { return GONE; }
export async function POST() { return GONE; }
