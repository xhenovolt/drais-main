import { NextRequest, NextResponse } from 'next/server';
import { routeTree, coverage } from '@/lib/devdocs';
import { docsContext } from '../_shared';

export const runtime = 'nodejs';

/** GET ?kind=page|api — the real route tree, with coverage figures. */
export async function GET(req: NextRequest) {
  const c = await docsContext(req);
  if (c.res) return c.res;
  const kind = req.nextUrl.searchParams.get('kind') === 'api' ? 'api' : 'page';
  const { index } = c;
  return NextResponse.json({ generatedAt: index.generatedAt, commit: index.commit, stats: index.stats, coverage: coverage(index, kind), routes: routeTree(index, kind) });
}
