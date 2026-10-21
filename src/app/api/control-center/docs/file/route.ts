import { NextRequest, NextResponse } from 'next/server';
import { fileDetail, notesForFile, sourceText } from '@/lib/devdocs';
import { docsContext } from '../_shared';

export const runtime = 'nodejs';

/** GET ?path=src/app/layout.tsx — one source file's analysis, source text, explanations and dependants. */
export async function GET(req: NextRequest) {
  const c = await docsContext(req);
  if (c.res) return c.res;
  const file = req.nextUrl.searchParams.get('path') || '';
  const detail = fileDetail(c.index, file);
  if (!detail) return NextResponse.json({ error: 'No such source file in this build', path: file }, { status: 404 });
  const { notes, from } = notesForFile(file);
  return NextResponse.json({ generatedAt: c.index.generatedAt, commit: c.index.commit, ...detail, source: sourceText(file), notes, notesFrom: from });
}
