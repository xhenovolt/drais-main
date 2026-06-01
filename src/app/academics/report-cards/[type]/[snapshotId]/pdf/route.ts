/**
 * Snapshot PDF route — server-side puppeteer render of /print-snapshot.
 *
 * GET /academics/report-cards/{secular|theology|mixed}/{snapshotId}/pdf
 *   ?class_id=<index>
 *   ?student_id=<dbId>
 *   ?template=<registry-id>
 *
 * Puppeteer navigates a headless Chromium to the public
 * /print-snapshot page, which is a client component that hosts
 * DRCEDocumentRenderer through standard Next.js SSR + hydration. We
 * forward the operator's session cookie so the snapshot + overrides
 * APIs accept the in-browser fetches.
 *
 * WHY NOT renderToStaticMarkup ANY MORE:
 *   Next.js 15's RSC runtime blocks calling a 'use client' component
 *   as a function from a Route Handler:
 *     "Attempted to call DRCEDocumentRenderer() from the server but
 *      DRCEDocumentRenderer is on the client."
 *   We sidestep by rendering through a real Page and capturing it.
 *
 * Emergency_html templates aren't supported here (yet) because the
 * /print-snapshot page only renders DRCE templates. The /print route
 * still serves emergency_html via the existing string-substitution
 * path. If you need a PDF of an emergency template, use the
 * browser's "Save as PDF" from the print preview for now.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ type: string; snapshotId: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { type, snapshotId } = await ctx.params;
  const validTypes = new Set(['theology', 'secular', 'mixed']);
  if (!validTypes.has(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  // Build the print-snapshot URL. We reach the SAME Next.js server we
  // are running inside via the request's own origin.
  const sp = req.nextUrl.searchParams;
  const printUrl = new URL(`/print-snapshot/${type}/${snapshotId}`, req.nextUrl.origin);
  for (const k of ['class_id', 'student_id', 'template']) {
    const v = sp.get(k);
    if (v !== null) printUrl.searchParams.set(k, v);
  }

  // Forward the auth cookie so /api/snapshots/... and /api/drce/...
  // accept the in-browser fetches made by the print-snapshot page.
  const cookieHeader = req.headers.get('cookie') ?? '';

  // ── Launch puppeteer ────────────────────────────────────────────────────
  let puppeteer: typeof import('puppeteer').default;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch (e) {
    console.error('[snapshots/pdf] puppeteer import failed:', e);
    return NextResponse.json({
      error:   'PUPPETEER_IMPORT_FAILED',
      message: e instanceof Error ? e.message : String(e),
      hint:    'Run `npm install` to ensure puppeteer is present.',
    }, { status: 500 });
  }

  let browser: import('puppeteer').Browser | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
      protocolTimeout: 60_000,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[snapshots/pdf] browser.launch failed:', e);
    let hint = 'Check server logs for the stack trace.';
    if (msg.includes('Could not find') || msg.includes('not installed')) {
      hint = 'Chromium not found. Run `npx puppeteer browsers install chrome`.';
    } else if (msg.includes('libnss3') || msg.includes('libatk')) {
      hint = 'Missing system libraries. apt-get install -y libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libasound2';
    }
    return NextResponse.json({
      error:   'BROWSER_LAUNCH_FAILED',
      message: msg,
      hint,
    }, { status: 500 });
  }

  try {
    const page = await browser.newPage();
    // Forward auth cookie so the in-page fetches succeed.
    if (cookieHeader) {
      await page.setExtraHTTPHeaders({ Cookie: cookieHeader });
    }
    await page.goto(printUrl.toString(), { waitUntil: 'networkidle2', timeout: 30_000 });
    // Wait for the page to signal that the DRCE tree has finished
    // mounting (the page appends a [data-print-ready] node on success).
    try {
      await page.waitForSelector('[data-print-ready]', { timeout: 20_000 });
    } catch {
      // Capture whatever rendered — the error pane is also valid output
      // we can return so the operator sees what went wrong on-screen.
    }
    // WYSIWYG: wait for web fonts to finish loading before printing.
    // Without this, the first frame of the PDF can fall back to a
    // generic system font while the editor preview shows the authored
    // font, producing visible drift.
    try {
      await page.evaluate(() => (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready);
    } catch { /* legacy or no FontFaceSet — skip */ }
    await page.emulateMediaType('print');

    // Phase L2 — extract the DRCE running header/footer the page has
    // dropped into the DOM. Resolves placeholders client-side (where
    // it has access to the snapshot data) and surfaces the rendered
    // HTML on dataset attributes for the puppeteer route to consume.
    //
    // Returns nulls when the document has no recurring header/footer
    // configured — we then turn off displayHeaderFooter so puppeteer
    // doesn't insert its default URL/page banner.
    const running = await page.evaluate(() => {
      const h = document.querySelector('[data-drce-running-header-html]');
      const f = document.querySelector('[data-drce-running-footer-html]');
      return {
        header: h instanceof HTMLElement ? h.dataset.drceRunningHeaderHtml ?? null : null,
        footer: f instanceof HTMLElement ? f.dataset.drceRunningFooterHtml ?? null : null,
        headerReserveMm: h instanceof HTMLElement ? Number(h.dataset.drceReserveMm ?? '0') : 0,
        footerReserveMm: f instanceof HTMLElement ? Number(f.dataset.drceReserveMm ?? '0') : 0,
      };
    });

    const displayHeaderFooter = !!(running.header || running.footer);
    const pdf = await page.pdf({
      format:          'A4',
      printBackground: true,
      // Margins agree with the @page declaration in the print-snapshot
      // CSS, but grow vertically when a running header/footer is
      // present so they have room without overlapping the body.
      margin: {
        top:    displayHeaderFooter && running.header
          ? `${Math.max(running.headerReserveMm, 10)}mm`
          : '0',
        right:  '0',
        bottom: displayHeaderFooter && running.footer
          ? `${Math.max(running.footerReserveMm, 10)}mm`
          : '0',
        left:   '0',
      },
      preferCSSPageSize: !displayHeaderFooter, // can't honour @page size when margins are explicit
      displayHeaderFooter,
      headerTemplate: running.header ?? '<div></div>',
      footerTemplate: running.footer ?? '<div></div>',
      timeout: 30_000,
      tagged:  false,
    });

    const filename = `snapshot-${snapshotId}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[snapshots/pdf] render failed:', e);
    return NextResponse.json({
      error:   'PDF_RENDER_FAILED',
      message: msg,
      hint:    'The print page loaded but Chromium could not capture it. Check server logs.',
    }, { status: 500 });
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* best-effort */ }
    }
  }
}
