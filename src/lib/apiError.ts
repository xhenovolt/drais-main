import { NextResponse } from 'next/server';

/**
 * Maps a thrown error to a NextResponse, preserving the status code set by
 * requirePermission()/checkModule() (401/403) instead of collapsing every
 * failure — including "access denied" — into a generic 500.
 */
export function errorResponse(error: any, fallbackMessage: string) {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  return NextResponse.json({ success: false, error: error?.message || fallbackMessage }, { status });
}
