/**
 * GET /api/calendar/inference?term_id=123
 *
 * Returns the academic-calendar inference for one term. Read-only.
 * Used by the DRCE editor to preview what the new computed fields
 * ({next_term_begins}, {this_term_ends}, …) will resolve to before the
 * snapshot adapter starts populating `meta.calendar`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { infer } from '@/lib/calendar';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const termId = Number(new URL(req.url).searchParams.get('term_id') ?? '0');
  if (!termId) return NextResponse.json({ error: 'term_id is required' }, { status: 400 });

  const result = await infer(session.schoolId, termId);
  if (!result.current_term) {
    return NextResponse.json({ error: 'Term not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, inference: result });
}
