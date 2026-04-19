// src/components/drce/sections/HeaderSection.tsx
'use client';

import React from 'react';
import Image from 'next/image';
import type { DRCEHeaderSection, DRCETheme } from '@/lib/drce/schema';
import { resolveHeaderStyle } from '@/lib/drce/styleResolver';
import { resolveToken } from '@/lib/drce/tokenResolver';
import type { DRCERenderContext } from '../types';

interface Props {
  section: DRCEHeaderSection;
  theme: DRCETheme;
  ctx: DRCERenderContext;
}

export function HeaderSection({ section, theme, ctx }: Props) {
  if (!section.visible) return null;
  const style = resolveHeaderStyle(section.style);
  const { school } = ctx;

  const logoImg = school.logo_url ? (
    <Image
      src={school.logo_url}
      alt="School Logo"
      width={64}
      height={64}
      style={{ maxHeight: 64, objectFit: 'contain' }}
      unoptimized
    />
  ) : (
    <div style={{
      width: 64, height: 64, borderRadius: 4,
      background: theme.primaryColor, opacity: 0.15,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 24,
    }}>🏫</div>
  );

  if (section.style.layout === 'centered') {
    return (
      <div style={style}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 4 }}>
          {logoImg}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 'bold', fontSize: theme.baseFontSize + 2, color: theme.primaryColor }}>
              {school.name}
            </div>
            {school.arabic_name && (
              <div style={{ fontSize: theme.baseFontSize, color: theme.primaryColor, direction: 'rtl' }}>
                {school.arabic_name}
              </div>
            )}
            {school.address && (
              <div style={{ fontSize: theme.baseFontSize - 1, color: '#666' }}>{school.address}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // three-column (default)
  return (
    <div style={style}>
      <div style={{ flex: '0 0 auto' }}>{logoImg}</div>
      <div style={{ flex: 1, textAlign: 'center', padding: '0 12px' }}>
        <div style={{ fontWeight: 'bold', fontSize: theme.baseFontSize + 2, color: theme.primaryColor }}>
          {school.name}
        </div>
        {school.arabic_name && (
          <div style={{ fontSize: theme.baseFontSize, color: theme.primaryColor, direction: 'rtl' }}>
            {school.arabic_name}
          </div>
        )}
        {school.address && (
          <div style={{ fontSize: theme.baseFontSize - 1, color: '#666' }}>{school.address}</div>
        )}
      </div>
      <div style={{ flex: '0 0 auto', textAlign: 'right', fontSize: theme.baseFontSize - 1, color: '#666' }}>
        {school.contact && <div>{school.contact}</div>}
        {school.center_no && <div>Centre: {school.center_no}</div>}
        {school.registration_no && <div>Reg: {school.registration_no}</div>}
      </div>
    </div>
  );
}
