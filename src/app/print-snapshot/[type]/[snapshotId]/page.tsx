/**
 * /print-snapshot/{type}/{snapshotId}
 *
 * Naked DRCE rendering surface — no sidebar, no topbar, no app shell.
 * Used for two purposes:
 *   1. Browser print target — operator opens this URL in a new tab
 *      and clicks Print. The browser sees only the report.
 *   2. Puppeteer target — the /pdf Route Handler navigates a headless
 *      Chromium here, waits for hydration, captures PDF.
 *
 * WHY THIS PAGE EXISTS:
 *   The previous /print Route Handler used react-dom/server.
 *   renderToStaticMarkup() on DRCEDocumentRenderer. That component
 *   is `'use client'` (transitively pulls in client-only section
 *   plugins, an Error Boundary class component, QRCodeSVG). Next.js
 *   15's RSC runtime refuses to call client functions from server
 *   code, even via dynamic import, throwing:
 *     "Attempted to call DRCEDocumentRenderer() from the server but
 *      DRCEDocumentRenderer is on the client."
 *   Pages render client components correctly via standard SSR +
 *   hydration, so we render through a Page instead.
 *
 * Query params:
 *   ?class_id=<idx>      filter to one class (zero-based)
 *   ?student_id=<dbId>   filter to one student (numeric studentDbId)
 *   ?template=<id>       DRCE template id (built-in or numeric DB id)
 */
'use client';

import { use, useEffect, useState } from 'react';
import { DRCEDocumentRenderer } from '@/components/drce/DRCEDocumentRenderer';
import type { DRCEDocument } from '@/lib/drce/schema';
import { snapshotToDRCEDataContext } from '@/lib/snapshots/adapter/toDRCEDataContext';
import { applyOverrides, readHiddenSubjectIds, selectOverridesForStudent, type PersistedOverride } from '@/lib/drce/overrides';
import type { ReportSnapshot, SnapshotType } from '@/lib/snapshots/types';

interface PageProps {
  params: Promise<{ type: string; snapshotId: string }>;
}

interface State {
  snapshot:   ReportSnapshot | null;
  document:   DRCEDocument   | null;
  overrides:  PersistedOverride[];
  error:      string | null;
  loaded:     boolean;
}

const DEFAULT_DRCE_BY_TYPE: Record<SnapshotType, string> = {
  secular:  'drce-emergency-secular',
  theology: 'drce-emergency-theology',
  mixed:    'drce-emergency-secular',
};

export default function PrintSnapshotPage({ params }: PageProps) {
  const { type, snapshotId } = use(params);
  const [state, setState] = useState<State>({
    snapshot: null, document: null, overrides: [], error: null, loaded: false,
  });

  // Read URL params on the client. We avoid Next's searchParams prop so the
  // page stays naked-client and we can be sure puppeteer sees a hydrated tree.
  const [sp, setSp] = useState<URLSearchParams | null>(null);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSp(new URLSearchParams(window.location.search));
    }
  }, []);

  useEffect(() => {
    if (sp === null) return;
    let cancelled = false;
    const templateId = sp.get('template') || DEFAULT_DRCE_BY_TYPE[type as SnapshotType] || 'drce-emergency-secular';

    (async () => {
      try {
        const [snapRes, ovRes, docRes] = await Promise.all([
          fetch(`/api/snapshots/${encodeURIComponent(snapshotId)}`),
          fetch(`/api/snapshots/${encodeURIComponent(snapshotId)}/overrides`),
          // Resolve the DRCE template. Built-in ids resolve client-side
          // via /api/drce/registry; numeric ids hit /api/dvcf/documents.
          /^\d+$/.test(templateId)
            ? fetch(`/api/dvcf/documents/${encodeURIComponent(templateId)}`)
            : fetch(`/api/drce/builtin/${encodeURIComponent(templateId)}`),
        ]);
        if (cancelled) return;

        if (!snapRes.ok) throw new Error(`Snapshot load failed (${snapRes.status})`);
        const snapJson = await snapRes.json();
        const snapshot = snapJson.snapshot as ReportSnapshot;
        if (!snapshot) throw new Error('Snapshot payload missing');

        const ovJson  = ovRes.ok ? await ovRes.json() : { overrides: [] };
        const overrides = Array.isArray(ovJson.overrides) ? ovJson.overrides : [];

        if (!docRes.ok) throw new Error(`Template load failed (${docRes.status})`);
        const docJson = await docRes.json();
        const document = (docJson.document ?? docJson) as DRCEDocument;
        if (!document) throw new Error('Template payload missing');

        setState({ snapshot, document, overrides, error: null, loaded: true });
      } catch (e: any) {
        if (cancelled) return;
        setState(s => ({ ...s, error: e?.message || 'load failed', loaded: true }));
      }
    })();
    return () => { cancelled = true; };
  }, [sp, snapshotId, type]);

  // Tell puppeteer (and operators) we are ready to print. Puppeteer waits
  // for a [data-print-ready] element before capturing the PDF.
  useEffect(() => {
    if (state.loaded && state.snapshot && state.document) {
      const flag = document.createElement('div');
      flag.setAttribute('data-print-ready', '1');
      flag.style.display = 'none';
      document.body.appendChild(flag);
    }
  }, [state.loaded, state.snapshot, state.document]);

  if (state.error) {
    return (
      <div style={{ padding: 40, fontFamily: 'system-ui', maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ color: '#b91c1c' }}>Could not build this report</h1>
        <pre style={{ background: '#f3f4f6', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap', fontSize: 12 }}>
          {state.error}
        </pre>
      </div>
    );
  }
  if (!state.loaded || !state.snapshot || !state.document) {
    return <div style={{ padding: 40, color: '#666' }}>Loading…</div>;
  }

  const filterClassIdx = sp?.get('class_id') !== null ? Number(sp?.get('class_id')) : null;
  const filterStudentDbId = sp?.get('student_id') !== null ? Number(sp?.get('student_id')) : null;

  const blocks: React.ReactNode[] = [];
  state.snapshot.classes.forEach((cls, classIdx) => {
    if (filterClassIdx !== null && !Number.isNaN(filterClassIdx) && classIdx !== filterClassIdx) return;
    cls.students.forEach((stu, studentIdx) => {
      if (filterStudentDbId !== null && !Number.isNaN(filterStudentDbId) && stu.studentDbId !== filterStudentDbId) return;

      const studentOverrides = selectOverridesForStudent(state.overrides, stu.studentDbId);
      const overriddenDoc    = applyOverrides(state.document!, studentOverrides);
      const hiddenSubjectIds = readHiddenSubjectIds(overriddenDoc);
      const dataCtx = snapshotToDRCEDataContext(
        state.snapshot!, classIdx, studentIdx,
        { schoolName: state.snapshot!.meta.schoolName },
        hiddenSubjectIds,
      );

      blocks.push(
        <div key={`${classIdx}-${stu.studentDbId}`} className="student-block">
          <DRCEDocumentRenderer
            document={overriddenDoc}
            dataCtx={dataCtx}
            renderCtx={{
              school: state.snapshot!.meta.branding
                ? {
                    name:            state.snapshot!.meta.branding.schoolName,
                    arabic_name:     state.snapshot!.meta.branding.arabicName,
                    address:         state.snapshot!.meta.branding.address,
                    contact:         state.snapshot!.meta.branding.phone || state.snapshot!.meta.branding.email,
                    center_no:       state.snapshot!.meta.branding.centerNo,
                    registration_no: state.snapshot!.meta.branding.registrationNumber,
                    logo_url:        state.snapshot!.meta.branding.logoUrl,
                  }
                : { name: state.snapshot!.meta.schoolName },
              isPrint: true,
              language: state.snapshot!.meta.language,
              isRTL:    state.snapshot!.meta.numerals === 'arabic',
            }}
          />
        </div>
      );
    });
  });

  if (blocks.length === 0) {
    return <div style={{ padding: 40, color: '#666' }}>No results to display</div>;
  }

  return (
    <>
      <style>{`
        /* WYSIWYG: zero @page margin so the DRCE page (794 px wide at
           96 dpi = exact A4 width) is NOT shrunk by Chromium to fit
           printable area. The DRCE renderer's own theme.pagePadding
           provides the visual breathing room — same as in the editor.
           Without this, prints came out at ~90% scale relative to the
           editor preview. */
        @page { size: A4; margin: 0; }
        html, body {
          margin: 0;
          padding: 0;
          background: #fff;
          /* Stop Chrome/Safari from auto-scaling text up — the DRCE
             theme.baseFontSize is the authority. */
          -webkit-text-size-adjust: 100%;
          text-size-adjust: 100%;
        }
        .student-block {
          page-break-after: always;
          break-after: page;
          /* Keep each report card on its own physical page even if its
             content is shorter than A4. */
        }
        .student-block:last-of-type {
          page-break-after: auto;
          break-after: auto;
        }
        /* WYSIWYG: stop borders / backgrounds from being clipped by
           Chromium's default print color-adjust. */
        * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        @media print {
          .no-print { display: none !important; }
        }
        /* Screen-only viewport — centre the page like the editor canvas
           so the operator's screen view matches what they'll see when
           it lands on paper. */
        @media screen {
          body {
            background: #e5e7eb;
            padding: 24px 0;
          }
          .student-block {
            margin: 0 auto 24px auto;
            box-shadow: 0 4px 32px rgba(0,0,0,0.12);
            border-radius: 2px;
            background: #fff;
            /* Stop screen-rendered children from leaking outside the
               page width (rare but possible for images / oversized
               sections). */
            overflow: hidden;
          }
        }
        .print-toolbar {
          position: fixed; top: 12px; right: 12px; z-index: 9999;
          background: #fff; border: 1px solid #ccc; padding: 10px;
          border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.12);
          font: 12px Arial;
        }
        .print-toolbar button {
          padding: 8px 12px; background: #09a12a; color: #fff;
          border: 0; border-radius: 4px; cursor: pointer; font-weight: 700;
        }
      `}</style>
      <div className="no-print print-toolbar">
        <button onClick={() => window.print()}>🖨️ Print</button>
      </div>
      {blocks}
    </>
  );
}
