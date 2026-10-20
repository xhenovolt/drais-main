import { NextRequest, NextResponse } from 'next/server';
import { requireControl } from '@/lib/control/guard';
import { loadIndex } from '@/lib/devdocs';

/** Control session with docs.view, and the loaded index — or the response to return instead. */
export async function docsContext(req: NextRequest) {
  const g = await requireControl(req, 'docs.view');
  if (g.res) return { res: g.res };
  const loaded = loadIndex();
  if (!loaded) {
    return {
      res: NextResponse.json(
        { error: 'The route documentation index has not been generated in this build.', hint: 'Run: npm run docs:gen', code: 'NOT_GENERATED' },
        { status: 409 },
      ),
    };
  }
  return { ...loaded };
}
