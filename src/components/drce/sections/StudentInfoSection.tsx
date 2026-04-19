// src/components/drce/sections/StudentInfoSection.tsx
'use client';

import React from 'react';
import type { DRCEStudentInfoSection, DRCETheme, DRCEDataContext } from '@/lib/drce/schema';
import {
  resolveStudentInfoBoxStyle,
  resolveStudentInfoLabelStyle,
  resolveStudentInfoValueStyle,
} from '@/lib/drce/styleResolver';
import { resolveBinding } from '@/lib/drce/bindingResolver';

interface Props {
  section: DRCEStudentInfoSection;
  theme: DRCETheme;
  ctx: DRCEDataContext;
}

export function StudentInfoSection({ section, ctx }: Props) {
  if (!section.visible) return null;
  const { style } = section;
  const boxStyle = resolveStudentInfoBoxStyle(style);
  const labelStyle = resolveStudentInfoLabelStyle(style);
  const valueStyle = resolveStudentInfoValueStyle(style);

  const visibleFields = [...section.fields]
    .filter(f => f.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <div style={boxStyle}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        {visibleFields.map(field => (
          <div key={field.id} style={{ flex: '1 1 180px', display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={labelStyle}>{field.label}:</span>
            <span style={valueStyle}>{resolveBinding(field.binding, ctx)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
