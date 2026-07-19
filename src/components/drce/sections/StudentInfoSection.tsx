// src/components/drce/sections/StudentInfoSection.tsx
// Layout mirrors rpt.html exactly:
//   [ barcode | photo | field-grid ]
// The field-grid is a mini table — first `fieldsPerRow` fields go in row 1,
// the rest fill row 2 with the last cell spanning remaining columns.
'use client';

import React from 'react';
import type { DRCEStudentInfoSection, DRCETheme, DRCEDataContext } from '@/lib/drce/schema';
import {
  resolveStudentInfoBoxStyle,
  resolveStudentInfoLabelStyle,
  resolveStudentInfoValueStyle,
} from '@/lib/drce/styleResolver';
import { resolveBinding } from '@/lib/drce/bindingResolver';
import { resolveLocalizedText } from '@/lib/drce/arabic';

interface Props {
  section: DRCEStudentInfoSection;
  theme: DRCETheme;
  ctx: DRCEDataContext;
}

// ── Inline SVG barcode (tight bounding box, print-safe) ──────────────────────
//
// Whitespace fix (2026-06): the previous version sized the outer SVG to a
// fixed `width` while letting the bars span their natural `totalW`, then
// set preserveAspectRatio="xMidYMin meet" — which scaled the bars down
// to fit and produced large empty bands around them. The new version
// computes each bar in unit fractions of `width`, so the bars fill the
// box exactly. The author resizes via style.barcodeWidth and the bars
// track the box perfectly.
function InlineBarcode({
  value,
  width = 44,
  height = 52,
  labelSpacing = 1,
  labelFontSize = 7,
}: {
  value: string | null | undefined;
  width?: number;
  height?: number;
  labelSpacing?: number;
  labelFontSize?: number;
}) {
  const pattern = [3, 1, 2, 1, 3, 1, 2, 2, 1, 2];
  const safeValue = (value || '').slice(0, 18);
  // Pass 1 — accumulate natural unit widths so we can rescale to fill `width`.
  const units: Array<{ w: number; bar: boolean }> = [];
  let totalUnits = 0;
  for (let i = 0; i < safeValue.length; i++) {
    const code = safeValue.charCodeAt(i) % 10;
    const bw = pattern[code];
    units.push({ w: bw, bar: true });
    units.push({ w: 1.5, bar: false });
    totalUnits += bw + 1.5;
    if (i % 3 === 2) {
      units.push({ w: 1, bar: false });
      totalUnits += 1;
    }
  }
  const labelText = value || '';
  const labelY = height + labelSpacing + labelFontSize;
  const totalHeight = height + labelSpacing + labelFontSize + 1;
  if (totalUnits === 0) {
    return (
      <svg width={width} height={totalHeight} style={{ display: 'block', background: '#fff' }} aria-label="Barcode (empty)" />
    );
  }
  const unitPx = width / totalUnits;
  const bars: React.ReactNode[] = [];
  let x = 0;
  let idx = 0;
  for (const u of units) {
    const w = u.w * unitPx;
    if (u.bar) {
      bars.push(<rect key={idx} x={x} y={0} width={w} height={height} fill="#111" />);
    }
    x += w;
    idx++;
  }
  return (
    <svg
      width={width}
      height={totalHeight}
      viewBox={`0 0 ${width} ${totalHeight}`}
      preserveAspectRatio="none"
      style={{ display: 'block', margin: 0, background: '#fff' }}
      aria-label={`Barcode ${labelText}`}
    >
      {bars}
      <text
        x={width / 2}
        y={labelY}
        textAnchor="middle"
        fontSize={labelFontSize}
        fill="#444"
      >
        {labelText}
      </text>
    </svg>
  );
}

export function StudentInfoSection({ section, ctx }: Props) {
  if (!section.visible) return null;
  const { style } = section;
  const language = ctx.language ?? 'en';
  const isRTL = language === 'ar';

  // Guard against null student data
  const student = (ctx.student || {}) as Partial<DRCEDataContext['student']>;

  // Strip outer box border — we don't want a border around the whole student section
  const boxStyle: React.CSSProperties = { ...resolveStudentInfoBoxStyle(style), border: 'none', direction: isRTL ? 'rtl' : 'ltr' };
  const labelStyle: React.CSSProperties = { ...resolveStudentInfoLabelStyle(style), textAlign: isRTL ? 'right' : 'left' };
  const valueStyle: React.CSSProperties = { ...resolveStudentInfoValueStyle(style), textAlign: isRTL ? 'right' : 'left' };

  const showBarcode     = style.showBarcode     !== false;
  const showPhoto       = style.showPhoto       !== false;
  const fieldsPerRow    = style.fieldsPerRow    ?? 4;
  const barcodeRotation = style.barcodeRotation ?? 0;
  const barcodeWidth    = style.barcodeWidth    ?? 44;
  const barcodeHeight   = style.barcodeHeight   ?? 64;
  const barcodeLabelSpacing = style.barcodeLabelSpacing ?? 1;
  const barcodeLabelFontSize = style.barcodeLabelFontSize ?? 7;
  // Cell width adjusts to barcode width with some padding
  const barcodeCellWidth = barcodeWidth + 2;

  // Map field labels through translation system
  const visibleFields = [...(section.fields || [])]
    .filter(f => f.visible)
    .sort((a, b) => a.order - b.order)
    .map(f => ({
      ...f,
      label: resolveLocalizedLabel(ctx.language, f.label, f.labelAr),
    }));

  const row1 = visibleFields.slice(0, fieldsPerRow);
  const row2 = visibleFields.slice(fieldsPerRow);

  // Last cell in row 2 spans remaining columns so the grid stays aligned.
  const lastColSpan = row2.length > 0 ? fieldsPerRow - (row2.length - 1) : 1;

  // No cell borders — values sit on dotted underlines only
  const cellPad: React.CSSProperties = {
    padding: '3px 6px',
    verticalAlign: 'bottom',
  };

  const valueUnderlineStyle: React.CSSProperties = {
    ...valueStyle,
    borderBottom: '1.5px dotted #555',
    display: 'inline-block',
    minWidth: 70,
    paddingBottom: 1,
  };

  return (
    <div style={boxStyle}>
      <table style={{ width: '100%', borderCollapse: 'collapse', direction: isRTL ? 'rtl' : 'ltr' }}>
        <tbody>
          <tr>
            {/* ── Barcode column ────────────────────────────────── */}
            {showBarcode && (
              <td style={{
                width: barcodeCellWidth,
                textAlign: 'center',
                verticalAlign: 'middle',
                padding: '0 1px 0 0',
                order: isRTL ? 999 : 'auto',
              }}>
                 {/* Barcode + student number grouped so they rotate together */}
                 <div style={{
                   display: 'inline-block',
                   transform: `rotate(${barcodeRotation}deg)`,
                   transformOrigin: 'center center',
                 }}>
                   <InlineBarcode
                     value={student.admissionNo}
                     width={barcodeWidth}
                     height={barcodeHeight}
                     labelSpacing={barcodeLabelSpacing}
                     labelFontSize={barcodeLabelFontSize}
                   />
                 </div>
              </td>
            )}

            {/* ── Photo column ──────────────────────────────────── */}
             {showPhoto && (
               <td style={{ width: 94, textAlign: 'center', verticalAlign: 'middle', padding: '0 2px 0 0' }}>
                 <img
                   src={student.photoUrl || '/default-avatar.png'}
                   alt={student.fullName || 'Student'}
                   style={{
                     width: 88, height: 98,
                     objectFit: 'cover',
                     border: '1px solid #000',
                     display: 'block',
                     margin: 'auto',
                   }}
                   onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/default-avatar.png'; }}
                 />
               </td>
             )}

            {/* ── Field-grid column ─────────────────────────────── */}
            <td style={{ padding: 0, verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {/* Row 1 */}
                  <tr>
                    {row1.map(field => (
                      <td key={field.id} style={cellPad}>
                        <span style={{ ...labelStyle, fontSize: 9, display: 'block', marginBottom: 1 }}>{field.label}:</span>
                        <span style={valueUnderlineStyle}>
                          {resolveBinding(field.binding, ctx) || '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'}
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* Row 2 — only rendered when there are overflow fields */}
                  {row2.length > 0 && (
                    <tr>
                      {row2.map((field, idx) => {
                        const isLast = idx === row2.length - 1;
                        return (
                          <td
                            key={field.id}
                            colSpan={isLast ? lastColSpan : 1}
                            style={cellPad}
                          >
                            <span style={{ ...labelStyle, fontSize: 9, display: 'block', marginBottom: 1 }}>{field.label}:</span>
                            <span style={valueUnderlineStyle}>
                              {resolveBinding(field.binding, ctx) || '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
