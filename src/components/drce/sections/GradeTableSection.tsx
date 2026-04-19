// src/components/drce/sections/GradeTableSection.tsx
'use client';

import React from 'react';
import type { DRCEGradeTableSection, DRCETheme } from '@/lib/drce/schema';
import { resolveGradeTableHeaderCellStyle, resolveGradeTableDataCellStyle } from '@/lib/drce/styleResolver';

interface Props {
  section: DRCEGradeTableSection;
  theme: DRCETheme;
}

// Standard UCE grade scale used in DRAIS schools
const GRADE_ROWS = [
  ['GRADE',   'D1', 'D2', 'C3', 'C4', 'C5', 'C6', 'P7', 'P8', 'F9'],
  ['MARKS',   '90-100', '80-89', '70-79', '60-69', '50-59', '45-49', '40-44', '35-39', '0-34'],
  ['REMARKS', 'Distinction 1', 'Distinction 2', 'Credit 3', 'Credit 4', 'Credit 5', 'Credit 6', 'Pass 7', 'Pass 8', 'Fail 9'],
];

export function GradeTableSection({ section, theme }: Props) {
  if (!section.visible) return null;
  const { style } = section;
  const thStyle = resolveGradeTableHeaderCellStyle(style);
  const tdStyle = resolveGradeTableDataCellStyle(style);

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, fontFamily: theme.fontFamily }}>
      <tbody>
        {GRADE_ROWS.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td key={ci} style={ci === 0 || ri === 0 ? thStyle : tdStyle}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
