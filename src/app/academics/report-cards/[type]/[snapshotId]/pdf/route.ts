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
  let browser: import('puppeteer').Browser | null = null;
  try {
    // Dynamic import so a missing puppeteer install (or build-time
    // bundling failure on platforms that ship without Chromium) does
    // not blow up the entire route module.
    const puppeteer = (await import('puppeteer')).default;
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // small/CI containers
      ],
    });
    const page = await browser.newPage();
    // setContent + waitUntil:'networkidle0' so external images
    // (Cloudinary, logos) finish loading before the PDF is captured.
    await page.setContent(built.html, { waitUntil: 'networkidle0', timeout: 30_000 });
    // emulateMediaType('print') so the @media print blocks apply.
    await page.emulateMediaType('print');
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' },
      preferCSSPageSize: true, // honour @page declarations in the HTML
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
    console.error('[snapshots/pdf] puppeteer failed:', e);
    return NextResponse.json(
      { error: 'PDF_GENERATION_FAILED', message: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* best-effort */ }
    }
  }
}
