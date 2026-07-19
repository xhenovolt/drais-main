// src/components/drce/sections/AssessmentSection.tsx
'use client';

import React from 'react';
import type { DRCEAssessmentSection, DRCETheme, DRCEDataContext } from '@/lib/drce/schema';
import { resolveBinding } from '@/lib/drce/bindingResolver';
import { resolveLocalizedText, resolveLocalizedLabel } from '@/lib/drce/arabic';

interface Props {
  section: DRCEAssessmentSection;
  theme: DRCETheme;
  ctx: DRCEDataContext;
}

export function AssessmentSection({ section, theme, ctx }: Props) {
  if (!section.visible) return null;

  const style = section.style as Record<string, unknown>;
  const isRTL = ctx.language === 'ar';
  const layout = String(style.layout ?? 'table');
  const labelColor = String(style.labelColor ?? '#444444');
  const valueColor = String(style.valueColor ?? theme.secondaryColor);
  const headerBackground = String(style.headerBackground ?? '#f2f2f2');
  const borderColor = String(style.borderColor ?? '#ccc');
  const headerFontSize = Number(style.headerFontSize ?? 11);
  const labelFontSize = Number(style.labelFontSize ?? 10);
  const valueFontSize = Number(style.valueFontSize ?? 12);
  const valueFontWeight = String(style.valueFontWeight ?? 'bold');
  const cellPadding = String(style.cellPadding ?? '2px 8px');
  const rowGap = Number(style.rowGap ?? 4);
  const columnGap = Number(style.columnGap ?? 16);
  const itemMinWidth = Number(style.itemMinWidth ?? 160);
  const tableLayout = String(style.tableLayout ?? 'fixed');
  const groupHeader = resolveLocalizedText(ctx.language, String(style.assessmentLabel ?? 'Grade Assessment'), String(style.assessmentLabelAr ?? ''));
  const positionLabel = resolveLocalizedText(ctx.language, String(style.positionLabel ?? 'Position'), String(style.positionLabelAr ?? ''));

  const visibleFields = [...(section.fields || [])]
    .filter(f => f.visible)
    .sort((a, b) => a.order - b.order);

  if (layout === 'flex' || visibleFields.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: `${rowGap}px ${columnGap}px`,
          margin: 0,
          width: '100%',
          fontFamily: theme.fontFamily,
          boxSizing: 'border-box',
        }}
      >
        {visibleFields.map(field => (
          <div
            key={field.id}
            style={{
              flex: `1 1 ${itemMinWidth}px`,
              minWidth: itemMinWidth,
              display: 'flex',
              alignItems: 'baseline',
              gap: 4,
            }}
          >
            <span style={{ color: labelColor, fontSize: labelFontSize }}>
              {resolveLocalizedText(ctx.language, field.label, field.labelAr)}:
            </span>
            <span style={{ color: valueColor, fontWeight: valueFontWeight, fontSize: valueFontSize }}>
              {resolveBinding(field.binding, ctx)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Table layout: first `positionFields` columns = "Position", rest = "Grade Assessment"
  const positionCount = Math.min(Number(style.positionFields ?? 2), visibleFields.length);
  const posFields = visibleFields.slice(0, positionCount);
  const assFields = visibleFields.slice(positionCount);

  const cell: React.CSSProperties = {
    border: `1px solid ${borderColor}`,
    padding: cellPadding,
    fontSize: labelFontSize,
    fontFamily: theme.fontFamily,
    boxSizing: 'border-box',
  };
  const headerCell: React.CSSProperties = {
    ...cell,
    background: headerBackground,
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: headerFontSize,
  };
  const labelCell: React.CSSProperties = { ...cell, textAlign: 'center', fontSize: labelFontSize, color: labelColor };
  const valueCell: React.CSSProperties = {
    ...cell,
    color: valueColor,
    fontWeight: valueFontWeight,
    textAlign: 'center',
    fontSize: valueFontSize,
  };

  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        margin: 0,
        fontFamily: theme.fontFamily,
        tableLayout: tableLayout === 'auto' ? 'auto' : 'fixed',
        direction: isRTL ? 'rtl' : 'ltr',
      }}
    >
      <tbody>
        {/* Header row: Position | Grade Assessment */}
        <tr>
          {posFields.length > 0 && (
            <td style={headerCell} colSpan={posFields.length}>{positionLabel}</td>
          )}
          {assFields.length > 0 && (
            <td style={headerCell} colSpan={assFields.length}>
              {groupHeader}
            </td>
          )}
        </tr>
        {/* Label row */}
        <tr>
          {visibleFields.map(f => (
            <td key={f.id} style={labelCell}>{resolveLocalizedLabel(ctx.language, f.label, f.labelAr)}</td>
          ))}
        </tr>
        {/* Value row */}
        <tr>
          {visibleFields.map(f => (
            <td key={f.id} style={valueCell}>
              {resolveBinding(f.binding, ctx) ?? '—'}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
