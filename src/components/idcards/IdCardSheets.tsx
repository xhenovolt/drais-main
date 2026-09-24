'use client';
/**
 * Print sheets for ID cards. Geometry comes from the pure layout module
 * (src/lib/idcards/layout.ts), which is unit-tested; this component only draws it.
 *
 * Two variants:
 *  - "preview": on-screen, zoomed, capped to a few cards so 2000-row jobs stay fast.
 *  - "print"  : full-size, rendered into a portal on <body> right before
 *               window.print(); @media print hides everything else and @page is
 *               set to the chosen sheet, so the Print dialog / Save-as-PDF matches
 *               the preview. No server PDF needed (works in Electron & Android too).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IdCardFace } from './IdCardFace';
import { layoutPages, type PrintMode, type SheetSpec } from '@/lib/idcards/layout';
import type { CardRecord, IdCardSpec } from '@/lib/idcards/spec';

interface Props {
  spec: IdCardSpec;
  records: CardRecord[];
  logoUrl?: string;
  sheet: SheetSpec;
  mode: PrintMode;
  cutMarks?: boolean;
  variant?: 'preview' | 'print';
  previewScale?: number;
  /** preview only: render at most this many cards (layout is still computed for the shown subset) */
  maxCards?: number;
}

export function IdCardSheets({
  spec, records, logoUrl, sheet, mode, cutMarks = true, variant = 'preview', previewScale = 0.5, maxCards = 12,
}: Props) {
  const shown = variant === 'preview' ? records.slice(0, maxCards) : records;
  const plan = useMemo(() => {
    try {
      return { ok: true as const, ...layoutPages({ count: shown.length, card: spec.size, sheet, mode, hasBack: !!spec.back }) };
    } catch (e: any) {
      return { ok: false as const, error: e.message as string };
    }
  }, [shown.length, spec.size, spec.back, sheet, mode]);

  if (!plan.ok) return <div style={{ color: '#b91c1c', padding: 12 }}>{plan.error}</div>;
  const isPrint = variant === 'print';
  const root = isPrint ? 'idc-print-root' : 'idc-preview-root';

  return (
    <div className={root}>
      <style>{`
        ${isPrint ? `@page { size: ${sheet.widthMm}mm ${sheet.heightMm}mm; margin: 0; }` : ''}
        .${root} .idc-page { position: relative; width: ${sheet.widthMm}mm; height: ${sheet.heightMm}mm; background: #fff; overflow: hidden; break-after: page; page-break-after: always; ${isPrint ? '' : `box-shadow: 0 1px 6px rgba(0,0,0,.25); margin-bottom: ${16 / previewScale}px;`} }
        .${root} .idc-page:last-child { break-after: auto; page-break-after: auto; }
        .${root} .idc-cell { position: absolute; ${cutMarks ? 'outline: 0.1mm solid rgba(0,0,0,0.35);' : ''} }
        ${isPrint ? `
        @media screen { .idc-print-root { display: none; } }
        @media print {
          body > *:not(.idc-print-root) { display: none !important; }
          .idc-print-root { display: block !important; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
        }` : ''}
      `}</style>
      <div style={isPrint ? undefined : ({ zoom: previewScale } as React.CSSProperties)}>
        {plan.pages.map((page, pi) => (
          <div className="idc-page" key={pi} data-page-kind={page.kind}>
            {page.cells.map((c) => (
              <div className="idc-cell" key={`${c.index}-${c.face}`} style={{ left: `${c.xMm}mm`, top: `${c.yMm}mm` }}>
                <IdCardFace spec={spec} face={c.face} record={shown[c.index]} logoUrl={logoUrl} unit="mm" />
              </div>
            ))}
          </div>
        ))}
      </div>
      {!isPrint && records.length > shown.length && (
        <p style={{ fontSize: 12, color: '#64748b' }}>Showing the first {shown.length} of {records.length} cards. All {records.length} will print.</p>
      )}
    </div>
  );
}

/**
 * Mount the print variant on <body>, call window.print(), then unmount.
 * `trigger` increments each time the user presses Print.
 */
export function PrintPortal({ trigger, ...props }: Omit<Props, 'variant'> & { trigger: number }) {
  const [active, setActive] = useState(false);
  useEffect(() => { if (trigger > 0) setActive(true); }, [trigger]);
  useEffect(() => {
    if (!active) return;
    const done = () => setActive(false);
    window.addEventListener('afterprint', done);
    // let the portal paint (images/QRs) before the dialog opens
    const t = window.setTimeout(() => window.print(), 400);
    return () => { window.removeEventListener('afterprint', done); window.clearTimeout(t); };
  }, [active]);
  if (!active || typeof document === 'undefined') return null;
  return createPortal(<IdCardSheets {...props} variant="print" />, document.body);
}
