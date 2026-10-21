import { NextRequest, NextResponse } from 'next/server';
import { registry } from '@/lib/devdocs';
import { docsContext } from '../_shared';

export const runtime = 'nodejs';

/** GET — documentation coverage of every page route, by sidebar module, plus file-level totals. */
export async function GET(req: NextRequest) {
  const c = await docsContext(req);
  if (c.res) return c.res;
  return NextResponse.json({ generatedAt: c.index.generatedAt, commit: c.index.commit, ...registry(c.index as any) });
}
