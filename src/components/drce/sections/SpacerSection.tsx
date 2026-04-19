// src/components/drce/sections/SpacerSection.tsx
'use client';

import React from 'react';
import type { DRCESpacerSection } from '@/lib/drce/schema';

export function SpacerSection({ section }: { section: DRCESpacerSection }) {
  if (!section.visible) return null;
  return <div style={{ height: section.style.height ?? 12 }} />;
}
