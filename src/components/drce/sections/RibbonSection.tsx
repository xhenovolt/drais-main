// src/components/drce/sections/RibbonSection.tsx
'use client';

import React from 'react';
import type { DRCERibbonSection, DRCETheme, DRCEDataContext } from '@/lib/drce/schema';
import { resolveToken } from '@/lib/drce/tokenResolver';
import { resolveLocalizedText } from '@/lib/drce/arabic';

interface Props {
  section: DRCERibbonSection;
  theme: DRCETheme;
  ctx: DRCEDataContext;
}

function RibbonPrimitive({
  text,
  section,
}: {
  text: string;
  section: DRCERibbonSection;
}) {
  const { style, content } = section;
  const width = style.width ?? 600;
  const height = style.height ?? 46;
  const bodyHeight = Math.max(14, height - (style.tailDepth ?? 14));
  const tailDepth = Math.max(0, style.tailDepth ?? 14);
  const chevronDepth = Math.max(0, style.chevronDepth ?? 16);
  const strokeWidth = Math.max(0, style.strokeWidth ?? 0);
  const layerCount = Math.max(1, style.layerCount ?? 1);
  const layerOffset = style.layerOffset ?? 3;
  const cornerRadius = Math.max(0, style.cornerRadius ?? 0);
  const textOffsetY = style.textOffsetY ?? 0;
  const svgScale = style.svgScale ?? 1;
  const rotation = style.rotation ?? 0;
  const fill = style.background ?? '#999';
  const stroke = style.strokeColor ?? 'transparent';
  const textColor = style.color ?? '#000';
  const fontSize = style.fontSize ?? 12;

  const makePath = (offset: number) => {
    const left = 0 + offset;
    const right = width - offset;
    const top = 0 + offset;
    const bottom = bodyHeight - offset;
    const centerX = width / 2;
    const tailAngle = Math.max(10, Math.min(80, style.tailAngle ?? 45));
    const tailHalf = tailDepth / Math.tan((tailAngle * Math.PI) / 180);
    const arrowLeft = centerX - Math.max(8, tailHalf);
    const arrowRight = centerX + Math.max(8, tailHalf);

    if (content.shape === 'chevron') {
      return `M ${left + cornerRadius} ${top}
              L ${right - chevronDepth} ${top}
              L ${right} ${(top + bottom) / 2}
              L ${right - chevronDepth} ${bottom}
              L ${left + cornerRadius} ${bottom}
              Z`;
    }
    if (content.shape === 'arrow-down') {
      return `M ${left + cornerRadius} ${top}
              L ${right - cornerRadius} ${top}
              L ${right} ${top + cornerRadius}
              L ${right} ${bottom}
              L ${arrowRight} ${bottom}
              L ${centerX} ${bottom + tailDepth}
              L ${arrowLeft} ${bottom}
              L ${left} ${bottom}
              L ${left} ${top + cornerRadius}
              Z`;
    }
    return `M ${left + cornerRadius} ${top}
            L ${right - cornerRadius} ${top}
            L ${right} ${top + cornerRadius}
            L ${right} ${bottom - cornerRadius}
            L ${right - cornerRadius} ${bottom}
            L ${left + cornerRadius} ${bottom}
            L ${left} ${bottom - cornerRadius}
            L ${left} ${top + cornerRadius}
            Z`;
  };

  const shadowEnabled = style.shadowEnabled ?? false;
  const shadowBlur = style.shadowBlur ?? 6;
  const shadowColor = style.shadowColor ?? 'rgba(0,0,0,0.2)';

  return (
    <div
      style={{
        margin: '2px 0',
        transform: `scale(${svgScale}) rotate(${rotation}deg)`,
        transformOrigin: 'center',
      }}
    >
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={`${height}px`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {shadowEnabled && (
          <defs>
            <filter id={`ribbon-shadow-${section.id}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1.2" stdDeviation={shadowBlur / 2.5} floodColor={shadowColor} />
            </filter>
          </defs>
        )}
        {Array.from({ length: layerCount }).map((_, idx) => {
          const reverseIndex = layerCount - idx - 1;
          const offset = reverseIndex * layerOffset;
          return (
            <path
              key={idx}
              d={makePath(offset)}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              filter={shadowEnabled ? `url(#ribbon-shadow-${section.id})` : undefined}
            />
          );
        })}
        <text
          x={width / 2}
          y={(bodyHeight / 2) + textOffsetY}
          dominantBaseline="middle"
          textAnchor="middle"
          fill={textColor}
          fontSize={fontSize}
          fontWeight={style.fontWeight ?? 'bold'}
        >
          {text}
        </text>
      </svg>
    </div>
  );
}

export function RibbonSection({ section, theme, ctx }: Props) {
  if (!section.visible) return null;
  const { style, content } = section;
  const text = resolveToken(
    ctx.language === 'ar'
      ? resolveLocalizedText(ctx.language, content.text, content.textAr)
      : content.text,
    ctx,
  );

  // Default shape to 'arrow-down' if missing or invalid
  const shape = content.shape ?? 'arrow-down';

  const cssStyle: React.CSSProperties = {
    backgroundColor: style.background ?? theme.accentColor,
    color: style.color ?? '#000',
    fontSize: style.fontSize ?? theme.baseFontSize,
    fontWeight: style.fontWeight ?? 'bold',
    padding: style.padding ?? '4px',
    textAlign: style.textAlign ?? 'center',
    direction: ctx.language === 'ar' ? 'rtl' : 'ltr',
  };

  if (shape === 'arrow-down' || shape === 'chevron') {
    return <RibbonPrimitive text={text} section={section} />;
  }
  return <div style={cssStyle}>{text}</div>;
}
