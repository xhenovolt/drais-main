// src/components/drce/sections/ResultsTableSection.tsx
'use client';

import React, { useState } from 'react';
import type { DRCEResultsTableSection, DRCETheme, DRCEDataContext } from '@/lib/drce/schema';
import {
  resolveTableStyle,
  resolveTableHeaderCellStyle,
  resolveTableDataCellStyle,
} from '@/lib/drce/styleResolver';
import { isReligiousEducationSubject } from '@/lib/theology-subject-classifier';
import { resolveBinding } from '@/lib/drce/bindingResolver';
import { buildTotalsRowCellContent } from '@/lib/drce/totalsCalculator';
import { resolveLocalizedLabel } from '@/lib/drce/arabic';

function calculateTotals(
  results: Array<Record<string, any>>,
  columns: Array<{ id: string; binding?: string }>,
  ctx: DRCEDataContext,
): Record<string, number> {
  const totals: Record<string, number> = {};

  columns.forEach(col => {
    let sum = 0;
    let count = 0;

    results.forEach(row => {
      const binding = col.binding || '';
      if (!binding) return;
      const value = resolveBinding(binding, ctx, row as Record<string, unknown>);
      const numValue = parseFloat(String(value));
      if (!isNaN(numValue)) {
        sum += numValue;
        count++;
      }
    });

    totals[col.id] = count > 0 ? sum : 0;
  });

  return totals;
}

function calculateAverages(
  results: Array<Record<string, any>>,
  columns: Array<{ id: string; binding?: string }>,
  ctx: DRCEDataContext,
): Record<string, number> {
  const totals = calculateTotals(results, columns, ctx);
  const count = results.length;

  const averages: Record<string, number> = {};
  columns.forEach(col => {
    averages[col.id] = count > 0 ? totals[col.id] / count : 0;
  });

  return averages;
}

interface Props {
  section: DRCEResultsTableSection;
  theme: DRCETheme;
  ctx: DRCEDataContext;
  /** Optional callback when an editable cell is changed */
  onCellChange?: (columnId: string, rowIndex: number, newValue: string) => Promise<void>;
  /** Optional callback when a column should be hidden */
  onColumnHide?: (columnId: string) => Promise<void>;
}

export function ResultsTableSection({ section, ctx, onCellChange, onColumnHide }: Props) {
  const [editingCell, setEditingCell] = useState<{ col: string; row: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!section.visible) return null;

  const language = ctx.language ?? 'en';
  const isRTL = language === 'ar';
  const { style } = section;
  const tableStyle: React.CSSProperties = {
    ...resolveTableStyle(style),
    direction: isRTL ? 'rtl' : 'ltr'
  };

  let visibleCols = [...(section.columns || [])]
    .filter(c => c.visible)
    .sort((a, b) => a.order - b.order);

  // Reverse column order for RTL
  if (isRTL) {
    visibleCols = visibleCols.slice().reverse();
  }

  const allResults = ctx.results ?? [];
  const subjectFilter = section.subjectFilter ?? 'all';
  let results = subjectFilter === 'all'
    ? allResults
    : allResults.filter(r => {
        const type = (r.subjectType ?? 'primary').toLowerCase();
            const isIRE = isReligiousEducationSubject(String(r.subjectName || ''));
          return !isIRE && type !== 'primary' && type !== 'core' && type !== 'theology' && type !== 'islamic' && type !== 'religion';
        }
      });

  // Apply cell content edits from overrides
  const cellContentEdits = (section as any).__cellContentEdits || [];
  if (cellContentEdits.length > 0) {
    results = results.map((row, rowIndex) => {
      const editedRow = { ...row };
      cellContentEdits.forEach((edit: any) => {
        if (edit.rowIndex === rowIndex) {
          editedRow[edit.columnId] = edit.payload.content;
        }
      });
      return editedRow;
    });
  }

  const totalsConfig = section.totalsConfig;
  const totalsEnabled = totalsConfig?.enabled ?? true;  // Default to TRUE - always show totals
  const sumColumnIds = (totalsConfig?.sumColumnIds && totalsConfig.sumColumnIds.length > 0
    ? totalsConfig.sumColumnIds
    : visibleCols.filter(c => c.id.toLowerCase().includes('score') || c.id.toLowerCase().includes('total')).map(c => c.id));
  const totalColumns = visibleCols.filter(col => sumColumnIds.includes(col.id));
  const totals = calculateTotals(results, totalColumns, ctx);
  const averages = totalsConfig?.showAverage !== false ? calculateAverages(results, totalColumns, ctx) : {};

  // Calculate grand totals for the summary row
  const totalObtained = results.reduce((sum, result) => sum + (parseFloat(String(result.total || 0)) || 0), 0);
  const totalPossible = results.reduce((sum, result) => {
    const subject = ctx.subjects?.find(s => s.name === result.subjectName);
    return sum + (subject?.totalMarks ?? 100);
  }, 0);
  const percentage = totalPossible > 0 ? (totalObtained / totalPossible) * 100 : 0;
  const averageScore = results.length > 0 ? totalObtained / results.length : 0;

  // Validate subject totals
  const validationErrors: string[] = [];
  results.forEach((result, index) => {
    const subject = ctx.subjects?.find(s => s.name === result.subjectName);
    const subjectTotal = subject?.totalMarks ?? 100;
    const obtained = parseFloat(String(result.total || 0)) || 0;

    if (obtained > subjectTotal) {
      validationErrors.push(`Row ${index + 1} (${result.subjectName}): ${obtained} exceeds subject total ${subjectTotal}`);
    }
  });

  const handleCellBlur = async (
    e: React.FocusEvent<HTMLTableCellElement>,
    columnId: string,
    rowIndex: number,
  ) => {
    const newValue = e.currentTarget.textContent?.trim() || '';
    if (onCellChange) {
      setIsSaving(true);
      try {
        await onCellChange(columnId, rowIndex, newValue);
      } catch (error) {
        console.error('Failed to save cell change:', error);
      } finally {
        setIsSaving(false);
      }
    }
    setEditingCell(null);
  };

  return (
    <table style={{
      ...tableStyle,
      pageBreakInside: 'avoid',
    }}>
      <colgroup>
        {visibleCols.map(col => (
          <col key={col.id} style={{ width: col.width }} />
        ))}
      </colgroup>
      <thead style={{ pageBreakInside: 'avoid', pageBreakAfter: 'avoid' }}>
        <tr style={{ pageBreakInside: 'avoid' }}>
          {visibleCols.map(col => (
            <th
              key={col.id}
              style={resolveTableHeaderCellStyle(style, col.align, col.style)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start', gap: '4px' }}>
                <span>{resolveLocalizedLabel(ctx.language, col.header, col.headerAr)}</span>
                {onColumnHide && (
                  <button
                    onClick={() => onColumnHide(col.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '12px',
                      padding: '2px 4px',
                      borderRadius: '2px',
                      opacity: 0.7,
                    }}
                    onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseOut={(e) => e.currentTarget.style.opacity = '0.7'}
                    title={`Hide ${col.header} column`}
                  >
                    ×
                  </button>
                )}
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {results.map((row, i) => (
          <tr key={i}>
            {visibleCols.map(col => {
              let cellValue = resolveBinding(col.binding, ctx, row as unknown as Record<string, unknown>);
              
              // Apply cell content edits from overrides
              const cellContentEdits = (section as any).__cellContentEdits;
              if (cellContentEdits) {
                const edit = cellContentEdits.find((e: any) => 
                  e.targetId === section.id && 
                  e.columnId === col.id && 
                  e.rowIndex === i
                );
                if (edit) {
                  cellValue = edit.payload.content;
                }
              }
              
              // Editable when a column opts in (contentEditable: true) OR when
              // the preview is in edit mode — onCellChange is only wired up by
              // the snapshot previewer's Edit button, so in normal/print render
              // it is undefined and cells stay read-only.
              const isEditable = col.contentEditable === true || !!onCellChange;
              
              return (
                <td
                  key={col.id}
                  style={{
                    ...resolveTableDataCellStyle(style, col.align, col.style),
                    cursor: isEditable ? 'text' : 'default',
                  }}
                  contentEditable={isEditable}
                  suppressContentEditableWarning={isEditable}
                  onBlur={isEditable ? (e) => handleCellBlur(e, col.id, i) : undefined}
                  onFocus={() => isEditable && setEditingCell({ col: col.id, row: i })}
                >
                  {cellValue}
                </td>
              );
            })}
          </tr>
        ))}
        
        {/* Grand Total Row */}
        {totalsEnabled && (
          <tr style={{
            fontWeight: 'bold',
            backgroundColor: 'rgba(0, 0, 0, 0.08)',
            borderTop: '2px solid #000',
            pageBreakInside: 'avoid'
          }}>
            {visibleCols.map((col, idx) => {
              const isFirstCol = idx === 0;
              const cellContent = buildTotalsRowCellContent({
                column: col,
                totals,
                totalsConfig,
                totalObtained,
                totalPossible,
                percentage,
                averageScore,
                language,
                isFirstColumn: isFirstCol,
              });

              return (
                <td
                  key={col.id}
                  colSpan={isFirstCol && totalsConfig?.showTotalPossible ? 2 : 1}
                  style={{
                    ...resolveTableDataCellStyle(style, col.align, totalsConfig?.rowStyle),
                    fontWeight: 'bold',
                    backgroundColor: 'rgba(0, 0, 0, 0.08)',
                    borderTop: '2px solid #000',
                    padding: '8px',
                  }}
                >
                  {cellContent}
                </td>
              );
            })}
          </tr>
        )}
      </tbody>
    </table>
  );
}
