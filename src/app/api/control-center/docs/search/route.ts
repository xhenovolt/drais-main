import { NextRequest, NextResponse } from 'next/server';
import { search } from '@/lib/devdocs';
import { docsContext } from '../_shared';

export const runtime = 'nodejs';

/** GET ?q=attendance settings&cat=route — ranked matches, at most 60, plus counts per category. */
export async function GET(req: NextRequest) {
  const c = await docsContext(req);
  if (c.res) return c.res;
  const q = (req.nextUrl.searchParams.get('q') || '').slice(0, 200);
  const cat = req.nextUrl.searchParams.get('cat');
  const all = search(c.search, q, null, 100000).results;
  const counts: Record<string, number> = {};
  for (const r of all) counts[r.cat] = (counts[r.cat] || 0) + 1;
  const { total, results } = cat ? search(c.search, q, cat, 60) : { total: all.length, results: all.slice(0, 60) };
  return NextResponse.json({ q, cat: cat || null, total, counts, results });
}
