// src/components/drce/sections/HeaderSection.tsx
'use client';

import React from 'react';
import Image from 'next/image';
import { MediaImg } from '@/components/media/MediaImg';
import type { DRCEHeaderSection, DRCETheme, DRCEHeaderComponentStyle } from '@/lib/drce/schema';
import { resolveHeaderStyle } from '@/lib/drce/styleResolver';
import type { DRCERenderContext } from '../types';

interface Props {
  section: DRCEHeaderSection;
  theme: DRCETheme;
  ctx: DRCERenderContext;
}

// Resolve component style with defaults
function resolveComponentStyle(
  componentStyle: DRCEHeaderComponentStyle | undefined,
  theme: DRCETheme,
): React.CSSProperties {
  if (!componentStyle) return {};

  return {
    padding: componentStyle.padding,
    margin: componentStyle.margin,
    background: componentStyle.background,
    fontSize: componentStyle.fontSize !== undefined ? componentStyle.fontSize : 'inherit',
    color: componentStyle.color ?? 'inherit',
    fontWeight: componentStyle.fontWeight,
    textAlign: componentStyle.align as any,
    ...(componentStyle.border?.enabled && {
      border: `${componentStyle.border.width}px ${componentStyle.border.style} ${componentStyle.border.color}`,
      borderRadius: componentStyle.border.radius,
    }),
  };
}

function renderComponent(
  id: string,
  content: React.ReactNode,
  componentStyle: DRCEHeaderComponentStyle | undefined,
  theme: DRCETheme,
) {
  if (!content) return null;

  const style = resolveComponentStyle(componentStyle, theme);
  const position = componentStyle?.position ?? 'auto';

  return (
    <div key={id} style={{ ...style, gridArea: position !== 'auto' ? position : undefined }}>
      {content}
    </div>
  );
}

export function HeaderSection({ section, theme, ctx }: Props) {
  if (!section.visible) return null;

  const containerStyle = resolveHeaderStyle(section.style);
  const { school, language = 'en', isRTL = false } = ctx;
  const gap = section.style.gap ?? 12;

  // Determine what components should be visible
  const showLogo = section.style.showLogo !== false;
  const showName = section.style.showName !== false;
  const showArabicName = section.style.showArabicName !== false && school.arabic_name;
  const showAddress = section.style.showAddress !== false && school.address;
  const showContact = section.style.showContact !== false && school.contact;
  const showCentreNo = section.style.showCentreNo !== false && school.center_no;
  const showRegistrationNo = section.style.showRegistrationNo !== false && school.registration_no;

  // Render logo component
  const logoImg = showLogo ? (
    school.logo_url ? (
      <MediaImg
        src={school.logo_url}
        alt="School Logo"
        width={section.style.logoWidth ?? 64}
        height={section.style.logoHeight ?? 64}
        style={{
          maxHeight: section.style.logoHeight ?? 64,
          objectFit: 'contain',
          width: 'auto',
        }}
      />
    ) : (
      <div
        style={{
          width: section.style.logoWidth ?? 64,
          height: section.style.logoHeight ?? 64,
          borderRadius: 4,
          background: theme.primaryColor,
          opacity: 0.15,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
        }}
      >
        🏫
      </div>
    )
  ) : null;

  // Handle traditional layouts (backward compatibility)
  if (
    section.style.layout === 'centered' ||
    section.style.layout === 'left-logo' ||
    section.style.layout === 'three-column'
  ) {
    if (section.style.layout === 'centered') {
      return (
        <div style={{ ...containerStyle, direction: isRTL ? 'rtl' : 'ltr' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 4 }}>
            {logoImg && <div>{logoImg}</div>}
            <div style={{ textAlign: 'center' }}>
              {showName && language === 'en' && (
                <div
                  style={{
                    fontWeight: 'bold',
                    fontSize: theme.baseFontSize + 2,
                    color: theme.primaryColor,
                    ...resolveComponentStyle(section.style.nameStyle, theme),
                  }}
                >
                  {school.name}
                </div>
              )}
              {showArabicName && language === 'ar' && (
                <div
                  style={{
                    fontWeight: 'bold',
                    fontSize: theme.baseFontSize + 2,
                    color: theme.primaryColor,
                    direction: 'rtl',
                    fontFamily: 'Noto Naskh Arabic, serif',
                    ...resolveComponentStyle(section.style.arabicNameStyle, theme),
                  }}
                >
                  {school.arabic_name}
                </div>
              )}
              {/* Show both if we have both and template allows */}
              {showName && showArabicName && language === 'en' && school.arabic_name && (
                <div
                  style={{
                    fontSize: theme.baseFontSize,
                    color: theme.primaryColor,
                    direction: 'rtl',
                    fontFamily: 'Noto Naskh Arabic, serif',
                    ...resolveComponentStyle(section.style.arabicNameStyle, theme),
                  }}
                >
                  {school.arabic_name}
                </div>
              )}
              {showAddress && (
                <div
                  style={{
                    fontSize: theme.baseFontSize - 1,
                    color: '#666',
                    direction: isRTL ? 'rtl' : 'ltr',
                    ...resolveComponentStyle(section.style.addressStyle, theme),
                  }}
                >
                  {language === 'ar' && school.address ? school.address : school.address}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (section.style.layout === 'left-logo') {
      return (
        <div style={containerStyle}>
          <div style={{ flex: '4', paddingRight: 12 }}>
            {showName && (
              <div
                style={{
                  fontWeight: 'bold',
                  fontSize: theme.baseFontSize + 10,
                  color: theme.primaryColor,
                  margin: 0,
                  ...resolveComponentStyle(section.style.nameStyle, theme),
                }}
              >
                {school.name}
              </div>
            )}
            {showArabicName && (
              <div
                style={{
                  fontSize: theme.baseFontSize,
                  color: theme.primaryColor,
                  direction: 'rtl',
                  ...resolveComponentStyle(section.style.arabicNameStyle, theme),
                }}
              >
                {school.arabic_name}
              </div>
            )}
            {showAddress && (
              <div
                style={{
                  fontSize: theme.baseFontSize + 1,
                  fontWeight: 'bold',
                  fontStyle: 'italic',
                  margin: '2px 0',
                  ...resolveComponentStyle(section.style.addressStyle, theme),
                }}
              >
                {school.address}
              </div>
            )}
            {showContact && (
              <div
                style={{
                  fontSize: theme.baseFontSize + 1,
                  fontWeight: 'bold',
                  fontStyle: 'italic',
                  margin: '2px 0',
                  ...resolveComponentStyle(section.style.contactStyle, theme),
                }}
              >
                {school.contact}
              </div>
            )}
          </div>
          <div style={{ flex: '0 0 auto', textAlign: 'right' }}>
            {logoImg}
          </div>
        </div>
      );
    }

    // three-column (default)
    return (
      <div style={containerStyle}>
        <div style={{ flex: '0 0 auto' }}>
          {logoImg}
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '0 12px' }}>
          {showName && (
            <div
              style={{
                fontWeight: 'bold',
                fontSize: theme.baseFontSize + 2,
                color: theme.primaryColor,
                ...resolveComponentStyle(section.style.nameStyle, theme),
              }}
            >
              {school.name}
            </div>
          )}
          {showArabicName && (
            <div
              style={{
                fontSize: theme.baseFontSize,
                color: theme.primaryColor,
                direction: 'rtl',
                ...resolveComponentStyle(section.style.arabicNameStyle, theme),
              }}
            >
              {school.arabic_name}
            </div>
          )}
          {showAddress && (
            <div
              style={{
                fontSize: theme.baseFontSize - 1,
                color: '#666',
                ...resolveComponentStyle(section.style.addressStyle, theme),
              }}
            >
              {school.address}
            </div>
          )}
        </div>
        <div style={{ flex: '0 0 auto', textAlign: 'right', fontSize: theme.baseFontSize - 1, color: '#666' }}>
          {showContact && school.contact && <div>{school.contact}</div>}
          {showCentreNo && school.center_no && <div>Centre: {school.center_no}</div>}
          {showRegistrationNo && school.registration_no && <div>Reg: {school.registration_no}</div>}
        </div>
      </div>
    );
  }

  // flex-grid layout: allows custom positioning of each component
  if (section.style.layout === 'flex-grid' || section.style.layout === 'custom') {
    return (
      <div
        style={{
          ...containerStyle,
          display: 'flex',
          flexWrap: 'wrap',
          gap: `${gap}px`,
          alignItems: 'flex-start',
          ...(section.style.headerBorder?.enabled && {
            border: `${section.style.headerBorder.width}px ${section.style.headerBorder.style} ${section.style.headerBorder.color}`,
            borderRadius: section.style.headerBorder.radius,
            padding: '12px',
          }),
        }}
      >
        {/* Logo */}
        {logoImg && (
          <div
            style={{
              order: section.style.logoStyle?.position === 'right' ? 3 : 1,
              ...resolveComponentStyle(section.style.logoStyle, theme),
            }}
          >
            {logoImg}
          </div>
        )}

        {/* Name + Arabic + Address (center column) */}
        <div
          style={{
            flex: 1,
            minWidth: 200,
            order: section.style.nameStyle?.position === 'right' ? 3 : 2,
          }}
        >
          {showName && (
            <div
              style={{
                fontWeight: 'bold',
                fontSize: theme.baseFontSize + 2,
                color: theme.primaryColor,
                ...resolveComponentStyle(section.style.nameStyle, theme),
              }}
            >
              {school.name}
            </div>
          )}
          {showArabicName && (
            <div
              style={{
                fontSize: theme.baseFontSize,
                color: theme.primaryColor,
                direction: 'rtl',
                marginTop: 4,
                ...resolveComponentStyle(section.style.arabicNameStyle, theme),
              }}
            >
              {school.arabic_name}
            </div>
          )}
          {showAddress && (
            <div
              style={{
                fontSize: theme.baseFontSize - 1,
                color: '#666',
                marginTop: 4,
                ...resolveComponentStyle(section.style.addressStyle, theme),
              }}
            >
              {school.address}
            </div>
          )}
        </div>

        {/* Contact info (right column) */}
        <div
          style={{
            order: 3,
            minWidth: 100,
            textAlign: 'right',
            fontSize: theme.baseFontSize - 1,
            color: '#666',
          }}
        >
          {showContact && school.contact && (
            <div style={resolveComponentStyle(section.style.contactStyle, theme)}>
              {school.contact}
            </div>
          )}
          {showCentreNo && school.center_no && (
            <div style={resolveComponentStyle(section.style.centreNoStyle, theme)}>
              Centre: {school.center_no}
            </div>
          )}
          {showRegistrationNo && school.registration_no && (
            <div style={resolveComponentStyle(section.style.registrationNoStyle, theme)}>
              Reg: {school.registration_no}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback to three-column
  return (
    <div style={containerStyle}>
      <div style={{ flex: '0 0 auto' }}>{logoImg}</div>
      <div style={{ flex: 1, textAlign: 'center', padding: '0 12px' }}>
        {showName && (
          <div style={{ fontWeight: 'bold', fontSize: theme.baseFontSize + 2, color: theme.primaryColor }}>
            {school.name}
          </div>
        )}
      </div>
    </div>
  );
}
