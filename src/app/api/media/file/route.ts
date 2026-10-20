/**
 * GET /api/media/file?ref=<db image reference>
 *
 * Serves an image for the signed-in user's school: the local copy when one exists (managed
 * store or school photo folder), otherwise a redirect to the original URL — unless the school's
 * policy is local-only, in which case 404 (the page shows its normal placeholder). The ref is
 * looked up in THIS school's manifest only; a filesystem path is never accepted from the request.
 */
import fs from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
import { mediaSession } from '../_auth';
import { resolveRef } from '@/lib/media/service';

export async function GET(req: NextRequest) {
  const s = await mediaSession(req);
  if (s instanceof NextResponse) return s;
  const ref = req.nextUrl.searchParams.get('ref') ?? '';
  if (!ref || ref.length > 2048) return NextResponse.json({ error: 'ref required' }, { status: 400 });
  const r = resolveRef(s.schoolId, ref);
  if (r.kind === 'redirect') return NextResponse.redirect(new URL(r.url, req.nextUrl.origin), 302);
  if (r.kind === 'missing') {
    return NextResponse.json({ error: 'not_found', reason: r.reason }, { status: r.reason === 'not_this_school' ? 403 : 404 });
  }
  const body = fs.readFileSync(r.absPath);
  return new NextResponse(body, {
    headers: {
      'Content-Type': r.mime,
      'Content-Length': String(body.length),
      // private: per-user browser cache only; refs are unique per school.
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
