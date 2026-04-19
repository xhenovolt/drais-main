// src/components/drce/sections/DividerSection.tsx
'use client';

import React from 'react';
import type { DRCEDividerSection } from '@/lib/drce/schema';

export function DividerSection({ section }: { section: DRCEDividerSection }) {
  if (!section.visible) return null;
  const { style } = section;
  return (
    <hr style={{
      border: 'none',
      borderTop: `${style.thickness ?? 1}px solid ${style.color ?? '#ccc'}`,
      margin: style.margin ?? '6px 0',
    }} />
  );
}
