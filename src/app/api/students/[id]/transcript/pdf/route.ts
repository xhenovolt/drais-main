/**
 * GET /api/students/[id]/transcript/pdf
 *
 * Phase L5 — puppeteer the naked /print-transcript page and return
 * application/pdf. Same launch-fail-modes telemetry as the other
 * PDF routes (PUPPETEER_IMPORT_FAILED / BROWSER_LAUNCH_FAILED /
 * PDF_RENDER_FAILED). Staff session required — the transcript
 * exposes the learners full mark history, which is not public.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { launchPdfBrowser } from '@/lib/pdf/browser';

// Puppeteer + serverless Chromium needs more than the default duration.
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const studentId = Number((await params).id);
  if (!studentId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Verify the student is in the callers school before launching
  // puppeteer — saves a Chromium spawn on cross-tenant probes.
  const ok = (await query(
    `SELECT id FROM students WHERE id = ? AND school_id = ? LIMIT 1`,
    [studentId, session.schoolId],
  )) as Array<{ id: number }>;
  if (ok.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const printUrl = new URL(`/print-transcript/${encodeURIComponent(String(studentId))}`, req.nextUrl.origin);
  const cookieHeader = req.headers.get('cookie') ?? '';

  let browser: import('puppeteer').Browser | null = null;
  try {
    browser = await launchPdfBrowser({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      protocolTimeout: 60_000,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[students/transcript/pdf] browser.launch failed:', e);
    return NextResponse.json({
      error:   'BROWSER_LAUNCH_FAILED',
      message: msg,
      hint:    'Verify puppeteer Chromium is installed (npx puppeteer browsers install chrome).',
    }, { status: 500 });
  }

  try {
    const page = await browser.newPage();
    if (cookieHeader) {
      await page.setExtraHTTPHeaders({ Cookie: cookieHeader });
    }
    await page.goto(printUrl.toString(), { waitUntil: 'networkidle2', timeout: 30_000 });
    try {
      await page.waitForSelector('[data-print-ready]', { timeout: 20_000 });
    } catch { /* tolerated — error pane is a valid PDF too */ }
    try {
      await page.evaluate(() => (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready);
    } catch { /* legacy */ }
    await page.emulateMediaType('print');
    const pdf = await page.pdf({
      format:          'A4',
      printBackground: true,
      // The page provides its own @page rule with 14/12/16/12 mm
      // margins; preferCSSPageSize honours that so we don't fight it.
      preferCSSPageSize: true,
      timeout:         30_000,
      tagged:          false,
    });
    const filename = `transcript-${studentId}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    });
  } catch (e) {
    console.error('[students/transcript/pdf] render failed:', e);
    return NextResponse.json({
      error:   'PDF_RENDER_FAILED',
      message: e instanceof Error ? e.message : String(e),
    }, { status: 500 });
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* best-effort */ }
    }
  }
}
