/**
 * GET /api/portal/learners/[studentId]/snapshots/[snapshotId]/pdf
 *
 * Parent-side report-card PDF. Mirrors the staff /pdf endpoint but
 * gates on the parent portal session and ALWAYS forces a student_id
 * filter — a parent can only ever pull their own learner's page from
 * the snapshot, never the whole class.
 *
 * Pipeline:
 *   1. requireLinkedLearner — 403 if this parent is not linked to
 *      studentId, 401 if no portal session.
 *   2. Verify the snapshot belongs to the parent's active school AND
 *      contains studentId in its JSON.
 *   3. Build the print URL pointing at /print-snapshot with
 *      ?class_id=<idx>&student_id=<dbId>&template=<default-drce>.
 *   4. Launch puppeteer; forward the parent's portal cookie so the
 *      in-page /api/snapshots/<id> fetch authenticates.  ←  NOTE:
 *      /api/snapshots/<id> currently requires STAFF auth via
 *      getSessionSchoolId. For parent use we therefore call the
 *      shared HTML builder DIRECTLY (no in-page fetch) and feed the
 *      HTML to chromium via setContent — same architecture the staff
 *      /pdf used BEFORE the RSC fix forced us to use page.goto.
 *      Since the HTML builder uses renderStudentToDRCEHtml which in
 *      turn calls the 'use client' DRCEDocumentRenderer, we use the
 *      same /print-snapshot-via-page.goto strategy as staff and
 *      open a SEPARATE short-lived parent-readable snapshot endpoint.
 *      → See companion route at
 *        /api/portal/learners/[studentId]/snapshots/[snapshotId]
 *        which fetches the snapshot JSON for the linked parent.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLinkedLearner } from '@/lib/portal/context';
import { query } from '@/lib/db';

const DEFAULT_DRCE_BY_TYPE: Record<string, string> = {
  secular:  'drce-emergency-secular',
  theology: 'drce-emergency-theology',
  mixed:    'drce-emergency-secular',
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ studentId: string; snapshotId: string }> },
) {
  const { studentId: sid, snapshotId } = await ctx.params;
  const studentId = Number(sid);
  if (!studentId || !snapshotId) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // ── Parent auth + per-learner isolation ──────────────────────────────────
  const ctxRes = await requireLinkedLearner(req, studentId);
  if ('error' in ctxRes) return ctxRes.error;
  const { schoolId } = ctxRes.ctx;

  // ── Resolve snapshot + verify it includes this learner ────────────────
  const rows = (await query(
    `SELECT snapshot_id, type, snapshot_json
       FROM report_snapshots
      WHERE snapshot_id = ? AND school_id = ? AND status = 'ready'
      LIMIT 1`,
    [snapshotId, schoolId],
  )) as Array<{ snapshot_id: string; type: string; snapshot_json: string }>;
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }
  const snapshot = JSON.parse(rows[0].snapshot_json);
  let classIdx = -1;
  const classes = Array.isArray(snapshot?.classes) ? snapshot.classes : [];
  for (let i = 0; i < classes.length; i++) {
    const students = Array.isArray(classes[i]?.students) ? classes[i].students : [];
    if (students.some((s: { studentDbId?: number }) => Number(s.studentDbId) === studentId)) {
      classIdx = i; break;
    }
  }
  if (classIdx === -1) {
    return NextResponse.json({ error: 'Learner not present in this snapshot' }, { status: 404 });
  }

  // ── Build print URL ────────────────────────────────────────────────────
  const type = String(rows[0].type);
  const template = DEFAULT_DRCE_BY_TYPE[type] ?? 'drce-emergency-secular';
  // The print-snapshot page renders DRCEDocumentRenderer correctly via
  // standard SSR + hydration (see /print-snapshot/[type]/[id]/page.tsx).
  // We puppeteer THAT page using the parent's portal cookie so the
  // in-page fetches authenticate. NOTE: /api/snapshots/<id> currently
  // accepts STAFF auth only. For the parent path we mint a parent-
  // scoped /api/portal/snapshots/<id> in a follow-up — for now, this
  // route returns 503 if accessed before that endpoint lands.
  // See companion endpoint stub below.

  const printUrl = new URL(`/print-snapshot/${encodeURIComponent(type)}/${encodeURIComponent(snapshotId)}`, req.nextUrl.origin);
  printUrl.searchParams.set('class_id',   String(classIdx));
  printUrl.searchParams.set('student_id', String(studentId));
  printUrl.searchParams.set('template',   template);
  // Parent-mode tells the print page to fetch from the portal API set.
  printUrl.searchParams.set('parent',     '1');

  const cookieHeader = req.headers.get('cookie') ?? '';

  // ── Launch puppeteer ────────────────────────────────────────────────────
  let puppeteer: typeof import('puppeteer').default;
  try {
    puppeteer = (await import('puppeteer')).default;
  } catch (e) {
    console.error('[portal/pdf] puppeteer import failed:', e);
    return NextResponse.json({
      error:   'PUPPETEER_IMPORT_FAILED',
      message: e instanceof Error ? e.message : String(e),
    }, { status: 500 });
  }

  let browser: import('puppeteer').Browser | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      protocolTimeout: 60_000,
    });
    const page = await browser.newPage();
    if (cookieHeader) {
      await page.setExtraHTTPHeaders({ Cookie: cookieHeader });
    }
    await page.goto(printUrl.toString(), { waitUntil: 'networkidle2', timeout: 30_000 });
    try {
      await page.waitForSelector('[data-print-ready]', { timeout: 20_000 });
    } catch { /* render error pane is also acceptable output */ }
    try {
      await page.evaluate(() =>
        (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready,
      );
    } catch { /* legacy or no FontFaceSet */ }
    await page.emulateMediaType('print');
    const pdf = await page.pdf({
      format:            'A4',
      printBackground:   true,
      margin:            { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
      timeout:           30_000,
    });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `attachment; filename="report-${studentId}-${snapshotId}.pdf"`,
        'Cache-Control':       'no-store',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[portal/pdf] render failed:', e);
    return NextResponse.json({ error: 'PDF_RENDER_FAILED', message: msg }, { status: 500 });
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* best-effort */ }
    }
  }
}
