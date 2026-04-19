// src/components/drce/sections/BannerSection.tsx
'use client';

import React from 'react';
import type { DRCEBannerSection, DRCETheme, DRCEDataContext } from '@/lib/drce/schema';
import { resolveBannerStyle } from '@/lib/drce/styleResolver';
import { resolveToken } from '@/lib/drce/tokenResolver';

interface Props {
  section: DRCEBannerSection;
  theme: DRCETheme;
  ctx: DRCEDataContext;
}

export function BannerSection({ section, theme, ctx }: Props) {
  if (!section.visible) return null;
  const style = resolveBannerStyle(theme, section.style);
  const text = resolveToken(section.content.text, ctx);
  return <div style={style}>{text}</div>;
}
