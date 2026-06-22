/**
 * DEPRECATED — superseded by /api/tahfiz/enrollments (Tahfiz Phase 1).
 *
 * The previous implementation:
 *   - DELETE hard-deleted the CANONICAL students row (data-loss landmine),
 *   - created duplicate students, and
 *   - detected "participants" by fragile class-name string matching.
 *
 * All of that is gone. Participation now lives in tahfiz_enrollments and is
 * managed via /api/tahfiz/enrollments (enroll / suspend / withdraw / soft-delete
 * — the students row is never touched). These handlers return 410 Gone so any
 * caller fails loudly and safely instead of mutating student data.
 */
import { NextResponse } from 'next/server';

const GONE = NextResponse.json(
  {
    success: false,
    error: 'This endpoint is deprecated. Use /api/tahfiz/enrollments to manage Tahfiz participants.',
    code: 'DEPRECATED',
    replacement: '/api/tahfiz/enrollments',
  },
  { status: 410 },
);

export async function GET()    { return GONE; }
export async function POST()   { return GONE; }
export async function PATCH()  { return GONE; }
export async function DELETE() { return GONE; }
