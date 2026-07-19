"use client";
/**
 * Phase E — one header element.
 *
 * Each block renders one piece of a header (logo, school name, motto, QR …).
 * Schools compose a header by putting several of these inside a `container`
 * (typically `row` with justify: 'space-between'), unlocking layouts the
 * legacy DRCEHeaderSection slot map cannot express (founder photo +
 * multi-lingual name + verification QR, custom orderings, etc.).
 *
 * Backwards-compatible: the legacy DRCEHeaderSection keeps rendering exactly
 * as before. This block is purely additive.
 */
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type {
  DRCEHeaderBlockSection as Section,
  DRCEDataContext,
  DRCESection,
} from '@/lib/drce/schema';
import { resolveExpression } from '@/lib/drce/computed/resolveExpression';

function blockText(section: Section, ctx: DRCEDataContext): string {
  const meta = ctx.meta;
  switch (section.kind) {
    case 'school_name':      return meta.schoolName ?? '';
    case 'arabic_name':      return meta.arabicName ?? '';
    case 'address':          return meta.schoolAddress ?? '';
    case 'contact':          return meta.schoolContact ?? '';
    case 'center_no':        return meta.centerNo ?? '';
    case 'registration_no':  return meta.registrationNo ?? '';
    case 'motto':            return section.text
      ? resolveExpression(section.text, ctx)
      : ((meta as unknown as { motto?: string }).motto ?? '');
    case 'custom_text':      return section.text ? resolveExpression(section.text, ctx) : '';
    default:                 return '';
  }
}

function blockStyle(section: Section): React.CSSProperties {
  const s = section.style ?? {};
  return {
    fontSize:     s.fontSize,
    fontWeight:   s.fontWeight,
    color:        s.color,
    background:   s.background,
    padding:      s.padding,
    textAlign:    s.align,
    width:        s.width,
    height:       s.height,
    border:       s.border,
    borderRadius: s.borderRadius,
  };
}

export function HeaderBlockSection({ section, ctx }: { section: Section; ctx: DRCEDataContext }) {
  const style = blockStyle(section);

  if (section.kind === 'logo') {
    const url = ctx.meta.logoUrl;
    if (!url) return null;
    return (
      <img
        src={url}
        alt="School logo"
        style={{ width: style.width ?? 64, height: style.height ?? 64, objectFit: 'contain', ...style }}
      />
    );
  }

  if (section.kind === 'custom_image') {
    if (!section.imageUrl) return null;
    return (
      <img
        src={section.imageUrl}
        alt=""
        style={{ width: style.width ?? 64, height: style.height ?? 64, objectFit: 'contain', ...style }}
      />
    );
  }

  if (section.kind === 'qr') {
    const value = section.qrValue
      ? resolveExpression(section.qrValue, ctx)
      : (ctx.meta.reportTitle ?? '');
    if (!value) return null;
    const size = Number(style.width ?? style.height ?? 72);
    return (
      <div style={style}>
        <QRCodeSVG value={value} size={size} level="M" />
      </div>
    );
  }

  // All text-bearing kinds collapse here.
  const text = blockText(section, ctx);
  if (!text) return null;
  return <div style={{ ...style, direction: ctx.language === 'ar' ? 'rtl' : 'ltr' }}>{text}</div>;
}

export function defaultHeaderBlock(): Omit<DRCESection, 'id' | 'order'> {
  return {
    type: 'header_block', visible: true, kind: 'school_name',
    style: { fontSize: 16, fontWeight: 'bold', align: 'center' },
  } as Omit<DRCESection, 'id' | 'order'>;
}
