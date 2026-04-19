// src/components/drce/sections/ResultsTableSection.tsx
'use client';

import React from 'react';
import type { DRCEResultsTableSection, DRCETheme, DRCEDataContext } from '@/lib/drce/schema';
import {
  resolveTableStyle,
  resolveTableHeaderCellStyle,
  resolveTableDataCellStyle,
} from '@/lib/drce/styleResolver';
import { resolveBinding } from '@/lib/drce/bindingResolver';

interface Props {
  section: DRCEResultsTableSection;
  theme: DRCETheme;
  ctx: DRCEDataContext;
}

export function ResultsTableSection({ section, ctx }: Props) {
  if (!section.visible) return null;

  const { style } = section;
  const tableStyle = resolveTableStyle(style);

  const visibleCols = [...section.columns]
    .filter(c => c.visible)
    .sort((a, b) => a.order - b.order);

  const results = ctx.results ?? [];

  return (
    <table style={tableStyle}>
      <colgroup>
        {visibleCols.map(col => (
          <col key={col.id} style={{ width: col.width }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {visibleCols.map(col => (
            <th
              key={col.id}
              style={resolveTableHeaderCellStyle(style, col.align, col.style)}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {results.map((row, i) => (
          <tr key={i}>
            {visibleCols.map(col => (
              <td
                key={col.id}
                style={resolveTableDataCellStyle(style, col.align, col.style)}
              >
                {resolveBinding(col.binding, ctx, row as unknown as Record<string, unknown>)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
