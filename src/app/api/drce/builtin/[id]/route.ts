/**
 * GET /api/drce/builtin/{id}
 *
 * Returns the built-in DRCEDocument for a registry id (kebab-case
 * strings like 'drce-emergency-secular'). 404 when the id is unknown.
 *
 * Why this exists: the /print-snapshot page is a client component
 * (necessarily — it hosts DRCEDocumentRenderer which is 'use client').
 * Built-in template documents live in src/lib/drce/builtin-resolver.ts
 * which the client can't import directly (it would pull a ~50 KB
 * blob into the client bundle for every page that loads). Surfacing
 * the resolver via this tiny endpoint keeps the bundle slim and the
 * data fetch deferred to the print page.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveBuiltInDocument } from '@/lib/drce/builtin-resolver';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const document = resolveBuiltInDocument(id);
  if (!document) {
    return NextResponse.json({ error: 'Unknown built-in template id' }, { status: 404 });
  }
  return NextResponse.json({ document });
}
