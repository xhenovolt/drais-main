/**
 * RETIRED — /api/sms (410 Gone).
 *
 * This was a legacy, UNAUTHENTICATED endpoint. Its POST sent SMS by `member_code`
 * against an old `members` table using a hardcoded provider API key and a broken
 * recipient (`to: +256`); its GET fired a real SMS to a hardcoded number on every
 * request. It had no callers — the live SMS path is the authenticated,
 * per-school-credentialed `/api/sms/send`.
 *
 * Retained as a 410 (rather than deleted) so any stray external caller gets a
 * clear "gone" signal instead of a confusing 404. Do not reintroduce an
 * unauthenticated send here.
 */
import { NextResponse } from 'next/server';

const GONE = () => NextResponse.json(
  { error: 'This endpoint has been retired. Use POST /api/sms/send (authenticated).' },
  { status: 410 },
);

export const GET = GONE;
export const POST = GONE;
export const PUT = GONE;
export const DELETE = GONE;
