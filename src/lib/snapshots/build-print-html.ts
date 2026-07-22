/**
 * Shared snapshot → printable-HTML builder.
 *
 * Extracted in PHASE 1B so both the existing /print route handler AND
 * the new /pdf route can produce identical HTML from the same inputs.
 * The /pdf route then feeds the result to puppeteer for server-side
 * PDF generation; the /print route ships the same HTML to the browser
 * for native printing.
 *
 * SAFE TO CALL FROM A ROUTE HANDLER. No NextRequest/Response coupling;
 * pure inputs → pure result so it remains trivially testable.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ReportSnapshot, SnapshotType } from '@/lib/snapshots/types';
import { snapshotToTemplateMap } from '@/lib/snapshots/adapter/toTemplateMap';
import { renderEmergencyTemplate } from '@/lib/snapshots/adapter/renderEmergencyTemplate';
import { listOverrides } from '@/lib/snapshots/overrides';
import { BUILT_IN_TEMPLATES } from '@/lib/drce/registry';
import { resolveBuiltInDocument } from '@/lib/drce/builtin-resolver';
import { renderStudentToDRCEHtml, wrapDRCEPrintDocument } from '@/lib/drce/print-renderer';
import type { DRCEDocument } from '@/lib/drce/schema';

export const DEFAULT_TEMPLATE_BY_TYPE: Record<SnapshotType, string> = {
  secular:  'emergency-secular',
  theology: 'emergency-theology',
  mixed:    'emergency-secular',
};

export const VALID_SNAPSHOT_TYPES: SnapshotType[] = ['theology', 'secular', 'mixed'];

export interface BuildPrintHtmlOptions {
  snapshot:           ReportSnapshot;
  schoolId:           number;
  templateId?:        string;
  filterClassIdx?:    number | null;
  filterStudentDbId?: number | null;
  editMode?:          boolean;
  /**
   * Optional injection point for the control panel/script block that the
   * /print route ships with the HTML (the in-browser "Print" / class
   * filter widget). The /pdf route deliberately leaves this empty so
   * the rendered PDF has no UI chrome.
   */
  controls?:          string;
  /**
   * Extra `<script>` block appended after the student blocks. Used by
   * the legacy emergency edit mode in the /print route. /pdf leaves
   * this empty.
   */
  emergencyEditScript?: string;
  /**
   * Custom wrapDocument for the emergency_html path. /print passes its
   * own (which includes the legacy CSS); /pdf passes a slim wrapper
   * tuned for puppeteer.
   */
  wrapEmergency?:     (body: string, snapshot: ReportSnapshot, lang: string, direction: 'ltr' | 'rtl') => string;
}

export type BuildPrintHtmlResult =
  | { ok: true;  html: string; bytes: number; renderer: 'drce' | 'emergency_html' }
  | { ok: false; status: number; error: string };

function resolveEmergencyTemplateFile(templateId: string): string | null {
  const entry = BUILT_IN_TEMPLATES.find(t => t.id === templateId);
  if (!entry || entry.renderer !== 'emergency_html' || !entry.engineRef) return null;
  return entry.engineRef;
}

/**
 * Build the full printable HTML for a snapshot given a template id and
 * optional class/student filter. Returns a discriminated union so
 * callers can convert errors to their own HTTP response shape.
 */
export async function buildSnapshotPrintHtml(
  opts: BuildPrintHtmlOptions,
): Promise<BuildPrintHtmlResult> {
  const {
    snapshot, schoolId,
    templateId: templateIdRaw,
    filterClassIdx     = null,
    filterStudentDbId  = null,
    editMode           = false,
    controls           = '',
    emergencyEditScript = '',
    wrapEmergency,
  } = opts;

  const templateId = templateIdRaw && templateIdRaw.trim() !== ''
    ? templateIdRaw.trim()
    : DEFAULT_TEMPLATE_BY_TYPE[snapshot.meta.type];

  const isArabic  = snapshot.meta.numerals === 'arabic';
  const direction: 'ltr' | 'rtl' = isArabic ? 'rtl' : 'ltr';
  const lang      = isArabic ? 'ar' : 'en';

  // ── DRCE path ──────────────────────────────────────────────────────────
  // Built-in emergency_html template ids (e.g. 'emergency-secular') must
  // NEVER resolve through dvcf_documents: a DB row sharing the template_key
  // would hijack the emergency template into the DRCE branch, whose
  // renderToStaticMarkup of a 'use client' component throws under Next 15
  // ("Attempted to call DRCEDocumentRenderer() from the server"). Emergency
  // ids go straight to the string-templating path below.
  const isBuiltInEmergency = resolveEmergencyTemplateFile(templateId) !== null;
  let drceDoc: DRCEDocument | null = isBuiltInEmergency ? null : resolveBuiltInDocument(templateId);
  if (!drceDoc && !isBuiltInEmergency) {
    try {
      const { query } = await import('@/lib/db');
      const normalized = templateId.trim();
      const numericId = Number(normalized);

      const rows = Number.isFinite(numericId) && numericId > 0
        ? (await query(
            `SELECT schema_json FROM dvcf_documents
              WHERE id = ? AND (school_id IS NULL OR school_id = ?)
              LIMIT 1`,
            [numericId, schoolId],
          )) as Array<{ schema_json: string }>
        : (await query(
            `SELECT schema_json FROM dvcf_documents
              WHERE template_key = ? AND (school_id IS NULL OR school_id = ?)
              LIMIT 1`,
            [normalized, schoolId],
          )) as Array<{ schema_json: string }>;

      if (rows.length) {
        drceDoc = JSON.parse(rows[0].schema_json) as DRCEDocument;
      }
    } catch { /* fall through */ }
  }

  if (drceDoc) {
    const allOverrides = await listOverrides({ snapshotId: snapshot.meta.snapshotId, schoolId });
    const renderCtx = {
      school: snapshot.meta.branding
        ? {
            name:            snapshot.meta.branding.schoolName,
            arabic_name:     snapshot.meta.branding.arabicName,
            address:         snapshot.meta.branding.address,
            contact:         snapshot.meta.branding.phone || snapshot.meta.branding.email,
            center_no:       snapshot.meta.branding.centerNo,
            registration_no: snapshot.meta.branding.registrationNumber,
            logo_url:        snapshot.meta.branding.logoUrl,
          }
        : { name: snapshot.meta.schoolName },
      isPrint:  true,
      editMode, 
      language: snapshot.meta.language,
      isRTL:    isArabic,
    };

    const studentBlocks: string[] = [];
    for (const [classIdx, cls] of snapshot.classes.entries()) {
      if (filterClassIdx !== null && !Number.isNaN(filterClassIdx) && classIdx !== filterClassIdx) continue;
      for (const [studentIdx, stu] of cls.students.entries()) {
        if (filterStudentDbId !== null && !Number.isNaN(filterStudentDbId) && stu.studentDbId !== filterStudentDbId) continue;
        const html = await renderStudentToDRCEHtml({
          document:   drceDoc,
          snapshot,
          classIdx,
          studentIdx,
          overrides:  allOverrides,
          renderCtx,
        });
        studentBlocks.push(
          `<div class="student-block" data-class-index="${classIdx}" data-student-db-id="${stu.studentDbId}">${html}</div>`,
        );
      }
    }

    if (studentBlocks.length === 0) {
      const emptyHtml = `<!DOCTYPE html><html><body style="text-align:center;padding:60px;color:#666;">${isArabic ? 'لا توجد نتائج' : 'No results to display'}</body></html>`;
      return { ok: true, html: emptyHtml, bytes: emptyHtml.length, renderer: 'drce' };
    }

    const fullHtml = wrapDRCEPrintDocument({
      snapshot,
      body: studentBlocks.join('\n'),
      controls,
    });
    return { ok: true, html: fullHtml, bytes: fullHtml.length, renderer: 'drce' };
  }

  // ── emergency_html path ────────────────────────────────────────────────
  const templateFile = resolveEmergencyTemplateFile(templateId);
  if (!templateFile) {
    return {
      ok: false, status: 400,
      error: `TEMPLATE_NOT_FOUND — unknown template id "${templateId}". Use a DRCE template id or an emergency_html template id.`,
    };
  }

  const templatePath = path.join(process.cwd(), 'backup', templateFile);
  let template: string;
  try {
    template = await fs.readFile(templatePath, 'utf8');
  } catch (e) {
    console.error('[buildSnapshotPrintHtml] Missing template:', templatePath, (e as Error).message);
    return { ok: false, status: 500, error: `TEMPLATE_MISSING — file ${templateFile} not found in backup/` };
  }

  const studentBlocks: string[] = [];
  snapshot.classes.forEach((cls, classIdx) => {
    if (filterClassIdx !== null && !Number.isNaN(filterClassIdx) && classIdx !== filterClassIdx) return;
    cls.students.forEach((stu, studentIdx) => {
      if (filterStudentDbId !== null && !Number.isNaN(filterStudentDbId) && stu.studentDbId !== filterStudentDbId) return;
      const out = snapshotToTemplateMap({ snapshot, classIdx, studentIdx, editMode });
      const rendered = renderEmergencyTemplate(template, out);
      studentBlocks.push(
        `<div class="student-block" data-class-index="${classIdx}" data-student-db-id="${stu.studentDbId}">${rendered}</div>`,
      );
    });
  });

  if (studentBlocks.length === 0) {
    const msg = direction === 'rtl' ? 'لا توجد نتائج للعرض' : 'No results to display';
    const emptyBody = `<div style="padding: 60px; text-align: center; color: #666;">${msg}</div>`;
    const fullHtml = wrapEmergency
      ? wrapEmergency(emptyBody, snapshot, lang, direction)
      : `<!DOCTYPE html><html lang="${lang}" dir="${direction}"><body>${emptyBody}</body></html>`;
    return { ok: true, html: fullHtml, bytes: fullHtml.length, renderer: 'emergency_html' };
  }

  const body = controls + '\n' + studentBlocks.join('\n') + emergencyEditScript;
  const fullHtml = wrapEmergency
    ? wrapEmergency(body, snapshot, lang, direction)
    : `<!DOCTYPE html><html lang="${lang}" dir="${direction}"><body>${body}</body></html>`;
  return { ok: true, html: fullHtml, bytes: fullHtml.length, renderer: 'emergency_html' };
}
