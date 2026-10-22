import { NextRequest, NextResponse } from 'next/server';
import { routeDetail, routeCallers, routeDocFor, notesForFile, sourceText } from '@/lib/devdocs';
import { docsContext } from '../_shared';

export const runtime = 'nodejs';

/**
 * GET ?url=/students/list — everything known about one route: the generated analysis,
 * the hand-written route document (with its computed status), and for every file the
 * document explains, the source text and the merged notes. &callers=1 adds who fetches it.
 */
export async function GET(req: NextRequest) {
  const c = await docsContext(req);
  if (c.res) return c.res;
  const url = req.nextUrl.searchParams.get('url') || '/';
  const detail = routeDetail(c.index, url);
  if (!detail) return NextResponse.json({ error: 'No such route in this build', url }, { status: 404 });
  const callers = req.nextUrl.searchParams.get('callers') ? routeCallers(c.index, url) : undefined;
  const routeDoc = routeDocFor(c.index, url);
  const walkthrough = routeDoc
    ? routeDoc.doc.files.map((f) => ({
        path: f.path, role: f.role, shared: f.shared, lineLevel: !!f.lineLevel,
        info: c.index.files[f.path] || null,
        source: sourceText(f.path),
        notes: notesForFile(f.path).notes,
      }))
    : undefined;
  return NextResponse.json({ generatedAt: c.index.generatedAt, commit: c.index.commit, ...detail, callers, routeDoc, walkthrough });
}
