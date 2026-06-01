/**
 * GET /api/verify/[token]/pdf
 *
 * PUBLIC PDF download for an HMAC-verified snapshot token. No session
 * required — the token IS the access proof.
 *
 * Pipeline:
 *   1. Validate token via verifyVerifyToken.
 *   2. Look up snapshot for the schoolId baked into the token, take
 *      its type so the print-snapshot URL maps to the right route.
 *   3. Build /print-snapshot/[type]/[id]?verify_token=<t>&… so the
 *      page reads the token-gated /api/verify/<t>/snapshot endpoint
 *      instead of staff/parent ones.
 *   4. Puppeteer that URL; capture A4 PDF.
 *
 * Returns 404 on bad token (no distinguishable failure mode for an
 * attacker probing valid signatures).
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyVerifyToken } from '@/lib/snapshots/verify-token';
import { query } from '@/lib/db';

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyVerifyToken(token);
  if (!payload) return notFound();

  // Resolve snapshot type so we can address the right /print-snapshot.
  const rows = (await query(
    `SELECT type FROM report_snapshots
      WHERE snapshot_id = ? AND status = 'ready'
        ${payload.c ? 'AND school_id = ?' : ''}
      LIMIT 1`,
    payload.c ? [payload.s, payload.c] : [payload.s],
  )) as Array<{ type: string }>;
  if (rows.length === 0) return notFound();
  const type = rows[0].type;

  // Build the puppeteer target.
  const printUrl = new URL(`/print-snapshot/${encodeURIComponent(type)}/${encodeURIComponent(payload.s)}`, req.nextUrl.origin);
  printUrl.searchParams.set('verify_token', token);
  if (payload.u) {
    printUrl.searchParams.set('student_id', String(payload.u));
  }

  // ── Launch puppeteer ─────────────────────────────────────────────────
  let puppeteer: typeof import('puppeteer').default;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch (e) {
    console.error('[verify/pdf] puppeteer import failed:', e);
    return NextResponse.json({ error: 'PDF_UNAVAILABLE' }, { status: 503 });
  }

  let browser: import('puppeteer').Browser | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      protocolTimeout: 60_000,
    });
    const page = await browser.newPage();
    await page.goto(printUrl.toString(), { waitUntil: 'networkidle2', timeout: 30_000 });
    try {
      await page.waitForSelector('[data-print-ready]', { timeout: 20_000 });
    } catch { /* render an error pane below if needed */ }
    try {
      await page.evaluate(() =>
        (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready,
      );
    } catch { /* legacy or no FontFaceSet */ }
    // Same header/footer extraction as the staff /pdf route so the
    // recurring bars print on the verify PDF too.
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
    await page.emulateMediaType('print');
    const pdf = await page.pdf({
      format:            'A4',
      printBackground:   true,
      margin: {
        top:    displayHeaderFooter && running.header ? `${Math.max(running.headerReserveMm, 10)}mm` : '0',
        right:  '0',
        bottom: displayHeaderFooter && running.footer ? `${Math.max(running.footerReserveMm, 10)}mm` : '0',
        left:   '0',
      },
      preferCSSPageSize: !displayHeaderFooter,
      displayHeaderFooter,
      headerTemplate: running.header ?? '<div></div>',
      footerTemplate: running.footer ?? '<div></div>',
      timeout:           30_000,
      tagged:            false,
    });
    const filename = `verified-${payload.s}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    });
  } catch (e) {
    console.error('[verify/pdf] render failed:', e);
    return NextResponse.json({ error: 'PDF_RENDER_FAILED' }, { status: 500 });
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* best-effort */ }
    }
  }
}
