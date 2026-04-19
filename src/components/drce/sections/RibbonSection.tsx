// src/components/drce/sections/RibbonSection.tsx
'use client';

import React from 'react';
import type { DRCERibbonSection, DRCETheme, DRCEDataContext } from '@/lib/drce/schema';
import { resolveToken } from '@/lib/drce/tokenResolver';

interface Props {
  section: DRCERibbonSection;
  theme: DRCETheme;
  ctx: DRCEDataContext;
}

// Arrow-down concave polygon (mirrors the SVG in rpt.html)
function ArrowDownRibbon({ text, style }: { text: string; style: React.CSSProperties }) {
  const bg = (style.backgroundColor as string) || '#999';
  const color = (style.color as string) || '#000';
  const fontSize = (style.fontSize as number) || 12;
  return (
    <div style={{ textAlign: 'center', margin: '0 0 2px 0', position: 'relative', height: 32 }}>
      <svg viewBox="0 0 400 32" width="100%" height="32" preserveAspectRatio="none">
        <polygon
          points="0,0 400,0 400,20 200,32 0,20"
          fill={bg}
        />
      </svg>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 24, color, fontSize, fontWeight: 'bold',
      }}>
        {text}
      </div>
    </div>
  );
}

function ChevronRibbon({ text, style }: { text: string; style: React.CSSProperties }) {
  const bg = (style.backgroundColor as string) || '#999';
  const color = (style.color as string) || '#000';
  const fontSize = (style.fontSize as number) || 12;
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', margin: '2px 0' }}>
      <div style={{
        flex: 1, background: bg, color, fontSize,
        fontWeight: 'bold', padding: '4px 12px 4px 8px',
        clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)',
      }}>
        {text}
      </div>
    </div>
  );
}

export function RibbonSection({ section, theme, ctx }: Props) {
  if (!section.visible) return null;
  const { style, content } = section;
  const text = resolveToken(content.text, ctx);

  const cssStyle: React.CSSProperties = {
    backgroundColor: style.background ?? theme.accentColor,
    color: style.color ?? '#000',
    fontSize: style.fontSize ?? theme.baseFontSize,
    fontWeight: style.fontWeight ?? 'bold',
    padding: style.padding ?? '4px',
    textAlign: style.textAlign ?? 'center',
  };

  if (content.shape === 'arrow-down') return <ArrowDownRibbon text={text} style={cssStyle} />;
  if (content.shape === 'chevron') return <ChevronRibbon text={text} style={cssStyle} />;
  return <div style={cssStyle}>{text}</div>;
}
