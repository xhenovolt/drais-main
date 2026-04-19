// src/components/drce/sections/AssessmentSection.tsx
'use client';

import React from 'react';
import type { DRCEAssessmentSection, DRCETheme, DRCEDataContext } from '@/lib/drce/schema';
import { resolveBinding } from '@/lib/drce/bindingResolver';

interface Props {
  section: DRCEAssessmentSection;
  theme: DRCETheme;
  ctx: DRCEDataContext;
}

export function AssessmentSection({ section, theme, ctx }: Props) {
  if (!section.visible) return null;

  const visibleFields = [...section.fields]
    .filter(f => f.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', margin: '6px 0', fontFamily: theme.fontFamily }}>
      {visibleFields.map(field => (
        <div key={field.id} style={{ flex: '1 1 160px', display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ color: '#555', fontSize: theme.baseFontSize - 1 }}>{field.label}:</span>
          <span style={{ color: theme.secondaryColor, fontWeight: 'bold', fontSize: theme.baseFontSize }}>
            {resolveBinding(field.binding, ctx)}
          </span>
        </div>
      ))}
    </div>
  );
}
