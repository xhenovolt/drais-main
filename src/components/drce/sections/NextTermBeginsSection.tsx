// src/components/drce/sections/NextTermBeginsSection.tsx
'use client';

import React from 'react';
import type { DRCENextTermBeginsSection } from '@/lib/drce/schema';
import { resolveLocalizedText } from '@/lib/drce/arabic';

export function NextTermBeginsSection({
  section,
  nextTermBegins,
  language,
}: {
  section: DRCENextTermBeginsSection;
  nextTermBegins?: string;
  language?: 'en' | 'ar';
}) {
  if (!section.visible) return null;

  const style = section.style ?? ({} as DRCENextTermBeginsSection['style']);
  const content = section.content ?? ({ text: 'Next term begins' } as DRCENextTermBeginsSection['content']);

  // Source: explicit, else inferred (manual when a custom date exists, else auto).
  const source = content.source ?? (content.customDate ? 'manual' : 'auto_from_terms');
  if (source === 'hidden') return null;

  // Resolve the raw date string safely per source. Never throws.
  const rawDate =
    source === 'manual' ? (content.customDate || '')
    : (nextTermBegins || '');   // auto: from the term resolver (blank in the editor)

  const dateText = (() => {
    if (!rawDate) return '';     // blank is valid — just show the label
    const date = new Date(rawDate);
    if (isNaN(date.getTime())) return rawDate; // unparseable → show as-is, no crash
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  })();
     
  const containerStyle: React.CSSProperties = {
    background: style.background || '#f0f0f0',
    color: style.color || '#000',
    fontSize: style.fontSize || 14,
    fontWeight: style.fontWeight ? parseInt(style.fontWeight.toString()) : 500,
    textAlign: style.textAlign || 'center',
    direction: language === 'ar' ? 'rtl' : 'ltr',
    padding: style.padding || '12px 16px',
    borderRadius: style.borderRadius || 4,
    border: style.borderWidth && style.borderColor 
      ? `${style.borderWidth}px solid ${style.borderColor}` 
      : 'none',
    marginBottom: '12px'
  };

  return (
    <div style={containerStyle}>
      {style.icon && <span style={{ marginRight: '8px' }}>{style.icon}</span>}
      <span>
        {resolveLocalizedText(language, content.text, content.textAr)}
        {dateText && <> • {dateText}</>}
      </span>
    </div>
  );
}
