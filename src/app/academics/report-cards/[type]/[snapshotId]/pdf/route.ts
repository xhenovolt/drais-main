/**
 * Snapshot PDF route — server-side puppeteer render.
 *
 * GET /academics/report-cards/{secular|theology|mixed}/{snapshotId}/pdf
 *   ?class_id=<index>
 *   ?student_id=<dbId>
 *   ?template=<registry-id>
 *
 * Closes PHASE 0 audit G5 — until this route landed, there was NO PDF
 * export path for snapshots or DRCE templates. The legacy PDF buttons
 * scattered across /reports / /academics/reports / /tahfiz/reports
 * used html2canvas + jsPDF.addImage to capture a DOM ref as a single
 * rasterised A4 PNG, which couldn't recognise DRCE-emitted markup at
 * all (it scanned for legacy `.reportPage` selectors).
 *
 * This route:
 *   1. Reuses the SAME HTML builder the /print route uses, via
 *      buildSnapshotPrintHtml(). The PDF is therefore byte-identical
 *      in content to what the user sees when they choose the same
 *      template and Print.
 *   2. Launches a headless Chromium via the already-installed
 *      puppeteer dep (^24.17.1), sets the HTML, prints to PDF.
 *   3. Returns application/pdf so the browser triggers a download.
 *
 * Why server-side puppeteer rather than client html2canvas:
 *   - Multi-page report cards stay multi-page; html2canvas crushes
 *     the entire DOM into one PNG which jsPDF then puts on a single
 *     A4 page.
 *   - Vector output where the renderer emits SVG (shapes, QR codes).
 *   - <foreignObject> text shapes (G7 reference) survive because
 *     Chromium prints them natively; html2canvas drops them.
 *   - Authority over @page rules — Chromium applies the same @page
 *     CSS the /print HTML already declares.
 *
 * Performance:
 *   ~600-900ms cold for the chromium boot, ~300ms warm per PDF on
 *   typical hardware. Each invocation launches a fresh browser and
 *   closes it after the response is built — no shared global instance,
 *   no leak risk. Future optimisation: shared launch via a module-
 *   level promise, gated by NODE_ENV=production.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { loadSnapshot } from '@/lib/snapshots/storage';
import {
  buildSnapshotPrintHtml,
  VALID_SNAPSHOT_TYPES,
} from '@/lib/snapshots/build-print-html';
import type { SnapshotType, ReportSnapshot } from '@/lib/snapshots/types';

/**
 * Slim wrapper for the emergency_html PDF body. The /print version
 * carries the legacy "report-container" + interactive controls CSS;
 * the PDF version drops them — Chromium prints whatever DOM it sees,
 * and the existing emergency template files already include their own
 * `<style>` block with print rules.
 */
function wrapEmergencyForPdf(
  body: string,
  snapshot: ReportSnapshot,
  lang: string,
  direction: 'ltr' | 'rtl',
): string {
  const esc = (s: string) => String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch] as string);
  const title = `${esc(snapshot.meta.schoolName)} — ${esc(snapshot.meta.termName)} ${esc(snapshot.meta.yearName)}`;
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${direction}">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 1cm; }
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 16px; color: #333; }
    .student-block { page-break-after: always; break-after: page; }
    .student-block:last-of-type { page-break-after: auto; break-after: auto; }
    .report-container { width: 800px; margin: auto; border: 1px solid #ccc; padding: 10px; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ type: string; snapshotId: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { type, snapshotId } = await ctx.params;
  if (!VALID_SNAPSHOT_TYPES.includes(type as SnapshotType)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const snapshot = await loadSnapshot(snapshotId, session.schoolId);
  if (!snapshot) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (snapshot.meta.type !== type) {
    return NextResponse.json({ error: 'Snapshot type mismatch' }, { status: 400 });
  }

  const sp = req.nextUrl.searchParams;
  const templateIdRaw  = sp.get('template');
  const classIdRaw     = sp.get('class_id');
  const studentIdRaw   = sp.get('student_id');
  const filterClassIdx     = classIdRaw    !== null ? parseInt(classIdRaw,    10) : null;
  const filterStudentDbId  = studentIdRaw  !== null ? parseInt(studentIdRaw,  10) : null;

  const built = await buildSnapshotPrintHtml({
    snapshot,
    schoolId:           session.schoolId,
    templateId:         templateIdRaw ?? undefined,
    filterClassIdx,
    filterStudentDbId,
    editMode:           false, // PDF never carries edit UI
    controls:           '',     // no interactive widget in PDF
    emergencyEditScript: '',
    wrapEmergency:      wrapEmergencyForPdf,
  });

  if (built.ok === false) {
    return NextResponse.json({ error: built.error }, { status: built.status });
  }

  // ── Launch puppeteer ────────────────────────────────────────────────────
  // The route is divided into stages so each failure mode returns a
  // SPECIFIC error message with an actionable hint. A generic "PDF
  // failed" toast was useless — operators couldn't tell whether
  // Chromium was missing, the HTML was bad, or auth had expired.
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
        '--disable-dev-shm-usage', // small/CI containers
      ],
      // Hard cap on internal protocol calls so a hung Chromium never
      // freezes the Next.js process. Without this, a stuck launch can
      // wedge the dev server until restart.
      protocolTimeout: 60_000,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[snapshots/pdf] browser.launch failed:', e);
    let hint = '';
    if (msg.includes('Could not find') || msg.includes('not installed') || msg.includes('cache')) {
      hint = 'Chromium not found in puppeteer cache. Run `npx puppeteer browsers install chrome`.';
    } else if (msg.includes('libnss3') || msg.includes('libatk')) {
      hint = 'Missing system libraries for Chromium. On Debian/Ubuntu: `apt-get install -y libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libasound2`.';
    } else if (msg.includes('No usable sandbox')) {
      hint = 'Sandbox unavailable — the route already passes --no-sandbox, but your container may also need --cap-add SYS_ADMIN.';
    } else {
      hint = 'See server logs for the full stack trace.';
    }
    return NextResponse.json({
      error:   'BROWSER_LAUNCH_FAILED',
      message: msg,
      hint,
    }, { status: 500 });
  }

  try {
    const page = await browser.newPage();
    // waitUntil:'domcontentloaded' is enough for the static HTML we
    // produce. Previously `networkidle0` could hang for 30s when a
    // Cloudinary image stalled; we now only wait for the doc to parse
    // and rely on the `evaluateHandle` below to flush remaining images.
    await page.setContent(built.html, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Best-effort wait for in-flight images. Bounded — never blocks
    // the response when an image source is unreachable.
    await Promise.race([
      page.evaluate(() => Promise.all(
        Array.from(document.images)
          .filter(img => !img.complete)
          .map(img => new Promise<void>(res => {
            img.addEventListener('load',  () => res(), { once: true });
            img.addEventListener('error', () => res(), { once: true });
          })),
      )),
      new Promise<void>(res => setTimeout(res, 5_000)),
    ]);
    await page.emulateMediaType('print');
    const pdf = await page.pdf({
      format:          'A4',
      printBackground: true,
      margin:          { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
      preferCSSPageSize: true,
      timeout:         30_000,
    });

    const filename = `${snapshot.meta.schoolName}-${snapshot.meta.termName}-${snapshot.meta.yearName}.pdf`
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '_');

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
      hint:    'The HTML was built but Chromium could not render it. Check server logs for the stack trace.',
    }, { status: 500 });
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* best-effort */ }
    }
  }
}
