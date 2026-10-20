import { NextRequest, NextResponse } from 'next/server';
import { routeDetail, routeCallers } from '@/lib/devdocs';
import { docsContext } from '../_shared';

export const runtime = 'nodejs';

/** GET ?url=/students/list — everything the generator knows about one route. &callers=1 adds who fetches it. */
export async function GET(req: NextRequest) {
  const c = await docsContext(req);
  if (c.res) return c.res;
  const url = req.nextUrl.searchParams.get('url') || '/';
  const detail = routeDetail(c.index, url);
  if (!detail) return NextResponse.json({ error: 'No such route in this build', url }, { status: 404 });
  const callers = req.nextUrl.searchParams.get('callers') ? routeCallers(c.index, url) : undefined;
  return NextResponse.json({ generatedAt: c.index.generatedAt, commit: c.index.commit, ...detail, callers });
}
