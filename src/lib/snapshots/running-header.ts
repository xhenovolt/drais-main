/**
 * Resolve a DRCE running header / footer for snapshot printing.
 *
 * Inputs:
 *   - A DRCERunningHeaderFooter spec from a DRCEDocument
 *   - The ReportSnapshot for metadata placeholders
 *
 * Outputs:
 *   - An HTML snippet suitable for puppeteer's page.pdf({
 *       headerTemplate / footerTemplate }) options
 *   - The reserveMm hint so callers can grow @page margins to match
 *
 * Why a dedicated module: puppeteer's headerTemplate has STRICT
 * conventions — it must inline ALL its CSS (no external stylesheet
 * reaches it), text has zero default size (you must set
 * `font-size`), and the special classes `.pageNumber` /
 * `.totalPages` / `.title` only resolve when displayHeaderFooter is
 * true. The substitution logic + escaping lives here so both the
 * /pdf and /portal/pdf routes can call it.
 */
import type { ReportSnapshot } from '@/lib/snapshots/types';
import type { DRCERunningHeaderFooter } from '@/lib/drce/schema';

/** Escape an arbitrary user string for safe inclusion in HTML text. */
function htmlEscape(s: string): string {
  return String(s).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!),
  );
}

function fmtDate(d: string | Date | undefined): string {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString();
}

/**
 * Substitute placeholders in the template. Unknown tokens are left
 * intact so a typo is visible to the author rather than silently
 * eating their text.
 */
function applyPlaceholders(text: string, snapshot: ReportSnapshot): string {
  const meta = snapshot.meta;
  const term = String(meta.termName ?? '');
  const year = String(meta.yearName ?? '');
  const termYear = [term, year].filter(Boolean).join(' · ');
  const map: Record<string, string> = {
    schoolName:  String(meta.schoolName ?? ''),
    termYear,
    term,
    year,
    type:        String(meta.type ?? ''),
    generatedAt: fmtDate((meta as { generatedAt?: string }).generatedAt),
  };
  return text.replace(/\{(\w+)\}/g, (full, key) => {
    if (key === 'pageNumber' || key === 'totalPages') {
      // Special: emitted as <span class="pageNumber"> / <span
      // class="totalPages"> so puppeteer fills them per-page. The
      // CSS prevents the spans from collapsing.
      return `<span class="${key}"></span>`;
    }
    return key in map ? htmlEscape(map[key]) : full;
  });
}

/** Build the HTML snippet for puppeteer's page.pdf header/footer. */
export function buildPuppeteerHeaderFooterHtml(
  spec: DRCERunningHeaderFooter | undefined,
  snapshot: ReportSnapshot,
): string {
  if (!spec || spec.show === false || !spec.text) {
    // Puppeteer expects SOMETHING when displayHeaderFooter is true; an
    // empty <div> renders as zero height.
    return '<div></div>';
  }
  const align     = spec.align ?? 'center';
  const fontSize  = spec.fontSize ?? 8;
  const color     = spec.color ?? '#666666';
  const family    = spec.fontFamily ?? 'Arial, sans-serif';
  const justify =
    align === 'left'  ? 'flex-start' :
    align === 'right' ? 'flex-end'   :
                        'center';
  const inner = applyPlaceholders(spec.text, snapshot);
  return (
    `<div style="width:100%; font-family:${family}; font-size:${fontSize}pt; color:${color}; ` +
    `display:flex; justify-content:${justify}; align-items:center; padding:0 8mm;">` +
    inner +
    `</div>`
  );
}

/** Reserve in mm at the matching paper edge. Default 10 mm; users
 *  can override via spec.reserveMm. Returns 0 when not shown so the
 *  body content fills the page edge-to-edge. */
export function reserveMmFor(spec: DRCERunningHeaderFooter | undefined): number {
  if (!spec || spec.show === false || !spec.text) return 0;
  return Math.max(0, spec.reserveMm ?? 10);
}
