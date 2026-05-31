/**
 * Phase 3.4 — DRCE server-side print renderer.
 *
 * Converts a DRCEDocument + data context into a full HTML string suitable
 * for the print route, using react-dom/server's renderToStaticMarkup.
 *
 * This file lives in /lib (not /components) so Next.js does not include it
 * in the client bundle. Route Handlers that import it run in Node.js and are
 * not subject to the 'use client' bundling boundary.
 *
 * React 18 renderToStaticMarkup handles useState correctly: it renders the
 * initial state on the first (only) synchronous pass, which is exactly what
 * we want for print — editingCell=null and isSaving=false so no interactive
 * UI is emitted.
 */
import React from 'react';
import type { DRCEDocument, DRCEDataContext } from './schema';
import type { DRCERenderContext } from '@/components/drce/types';
import type { ReportSnapshot } from '@/lib/snapshots/types';
import type { PersistedOverride } from './overrides';
import {
  applyOverrides,
  readHiddenSubjectIds,
  selectOverridesForStudent,
} from './overrides';
import { snapshotToDRCEDataContext } from '@/lib/snapshots/adapter/toDRCEDataContext';

/**
 * Render one student's report card as an HTML string.
 * Applies per-student overrides and hidden-subject filtering before rendering.
 */
export async function renderStudentToDRCEHtml(args: {
  document:   DRCEDocument;
  snapshot:   ReportSnapshot;
  classIdx:   number;
  studentIdx: number;
  overrides:  readonly PersistedOverride[];
  renderCtx:  DRCERenderContext;
}): Promise<string> {
  const { document, snapshot, classIdx, studentIdx, overrides, renderCtx } = args;
  const cls = snapshot.classes[classIdx];
  const stu = cls?.students[studentIdx];
  if (!cls || !stu) throw new Error(`Invalid class/student index: ${classIdx}/${studentIdx}`);

  // Apply per-student overrides (structural removals + style patches)
  const studentOverrides = selectOverridesForStudent(overrides, stu.studentDbId);
  const overriddenDoc    = applyOverrides(document, studentOverrides);
  const hiddenSubjectIds = readHiddenSubjectIds(overriddenDoc);

  // Build data context from the frozen snapshot
  const schoolMeta = snapshot.meta.branding
    ? {
        schoolName:      snapshot.meta.branding.schoolName,
        schoolAddress:   snapshot.meta.branding.address,
        schoolContact:   snapshot.meta.branding.phone || snapshot.meta.branding.email,
        schoolEmail:     snapshot.meta.branding.email,
        centerNo:        snapshot.meta.branding.centerNo,
        registrationNo:  snapshot.meta.branding.registrationNumber,
        arabicName:      snapshot.meta.branding.arabicName,
        arabicAddress:   snapshot.meta.branding.arabicAddress,
        logoUrl:         snapshot.meta.branding.logoUrl,
        reportTitle:     `${snapshot.meta.termName} ${snapshot.meta.yearName}`,
      }
    : { schoolName: snapshot.meta.schoolName };

  const dataCtx: DRCEDataContext = snapshotToDRCEDataContext(
    snapshot, classIdx, studentIdx, schoolMeta, hiddenSubjectIds,
  );

  // Dynamic import so Node.js loads the component only in the Route Handler
  // context, avoiding any static analysis issues with 'use client' boundaries.
  const { DRCEDocumentRenderer } = await import('@/components/drce/DRCEDocumentRenderer');
  const { renderToStaticMarkup } = await import('react-dom/server');

  const element = React.createElement(DRCEDocumentRenderer, {
    document:  overriddenDoc,
    dataCtx,
    renderCtx,
  });

  return renderToStaticMarkup(element);
}

/**
 * Wrap a concatenated body of per-student DRCE HTML in a full print document.
 * The page-break CSS from DRCEDocumentRenderer applies naturally — each
 * student's container already sets `page-break-after: always`.
 */
export function wrapDRCEPrintDocument(args: {
  snapshot:  ReportSnapshot;
  body:      string;
  controls:  string;
}): string {
  const { snapshot, body, controls } = args;
  const isArabic = snapshot.meta.numerals === 'arabic';
  const lang      = isArabic ? 'ar' : 'en';
  const direction = isArabic ? 'rtl' : 'ltr';
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
    /* Reset */
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; padding: 16px; font-family: Arial, sans-serif; background: #fff; }
    @page { size: A4; margin: 1cm; }

    /* PHASE 1A fix G6 — make each student block its own paper page so
       Ctrl+P always produces N pages for N learners, regardless of
       whether the underlying DRCE document is single-page or
       multi-page. The per-page break inside DRCEDocumentRenderer
       still applies within a student. */
    .student-block {
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid-page;
    }
    .student-block:last-of-type {
      page-break-after: auto;
      break-after: auto;
    }

    /* DRCE pages already carry their own break-* styles; this guards the
       legacy unprefixed property for older Chromium. */
    .drce-page {
      page-break-after: always;
      break-after: page;
    }
    .drce-page:last-of-type {
      page-break-after: auto;
      break-after: auto;
    }

    @media print {
      .no-print { display: none !important; }
      body { padding: 0; }
      /* Remove visual gaps the editor preview adds between pages. */
      .drce-page { margin-bottom: 0 !important; }
    }
  </style>
</head>
<body>
${controls}
${body}
</body>
</html>`;
}
