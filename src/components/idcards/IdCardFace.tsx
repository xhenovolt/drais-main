'use client';
/**
 * Renders ONE face of a v2 ID card from a design spec + a data record.
 * `unit` = 'mm' for print-exact output, or a number (px per mm) for on-screen
 * previews and the editor canvas. Same code path for both, so what the school
 * sees in preview is what prints.
 */
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { resolveTokens, type IdCardSpec, type IdCardElement, type CardRecord } from '@/lib/idcards/spec';

export type FaceUnit = 'mm' | number;

interface Props {
  spec: IdCardSpec;
  face: 'front' | 'back';
  record: CardRecord;
  logoUrl?: string;
  unit?: FaceUnit;
  /** Editor hook: wraps each element so it can be selected/dragged. */
  renderElementWrapper?: (el: IdCardElement, node: React.ReactNode, box: React.CSSProperties) => React.ReactNode;
}

export const printExact: React.CSSProperties = {
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
} as React.CSSProperties;

const len = (v: number, unit: FaceUnit) => (unit === 'mm' ? `${v}mm` : `${v * unit}px`);
const fontLen = (pt: number, unit: FaceUnit) => (unit === 'mm' ? `${pt}pt` : `${pt * (25.4 / 72) * unit}px`);

function initialsOf(record: CardRecord): string {
  const parts = (record.full_name || '').split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function IdCardFace({ spec, face, record, logoUrl, unit = 'mm', renderElementWrapper }: Props) {
  const side = face === 'back' && spec.back ? spec.back : spec.front;
  const { widthMm, heightMm } = spec.size;

  return (
    <div
      style={{
        position: 'relative', overflow: 'hidden', boxSizing: 'border-box',
        width: len(widthMm, unit), height: len(heightMm, unit),
        background: side.backgroundColor || '#ffffff',
        ...printExact,
      }}
    >
      {side.backgroundImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={side.backgroundImage.url} alt="" referrerPolicy="no-referrer" draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: side.backgroundImage.fit === 'stretch' ? 'fill' : 'cover', pointerEvents: 'none' }}
        />
      )}
      {side.elements.map((el) => {
        const box: React.CSSProperties = {
          position: 'absolute', left: len(el.x, unit), top: len(el.y, unit),
          width: len(el.w, unit), height: len(el.h, unit), boxSizing: 'border-box',
        };
        const node = renderElement(el, record, logoUrl, unit);
        return renderElementWrapper
          ? <React.Fragment key={el.id}>{renderElementWrapper(el, node, box)}</React.Fragment>
          : <div key={el.id} style={box}>{node}</div>;
      })}
    </div>
  );
}

function renderElement(el: IdCardElement, record: CardRecord, logoUrl: string | undefined, unit: FaceUnit): React.ReactNode {
  switch (el.kind) {
    case 'text': {
      let text = resolveTokens(el.text, record);
      if (el.uppercase) text = text.toUpperCase();
      return (
        <div style={{
          width: '100%', height: '100%', overflow: 'hidden', lineHeight: 1.15,
          fontSize: fontLen(el.fontSizePt, unit), fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? 'italic' : 'normal',
          color: el.color, textAlign: el.align ?? 'left', fontFamily: el.fontFamily || 'Inter, Arial, sans-serif',
          wordBreak: 'break-word',
        }}>{text}</div>
      );
    }
    case 'image': {
      const src = el.source === 'photo' ? record.photo_url : el.source === 'logo' ? logoUrl : el.src;
      const radius = el.shape === 'circle' ? '50%' : undefined;
      if (!src) {
        if (el.source === 'photo') {
          return (
            <div style={{
              width: '100%', height: '100%', borderRadius: radius, background: '#cbd5e1', color: '#475569',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
              fontSize: fontLen(Math.max(6, Math.min(el.w, el.h) * 0.9), unit), ...printExact,
            }}>{initialsOf(record)}</div>
          );
        }
        return null;
      }
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" referrerPolicy="no-referrer" draggable={false}
          style={{ width: '100%', height: '100%', objectFit: el.fit === 'contain' ? 'contain' : 'cover', borderRadius: radius, display: 'block' }} />
      );
    }
    case 'qr': {
      const value = resolveTokens(el.value, record);
      if (!value) return null;
      return <QRCodeSVG value={value} size={256} style={{ width: '100%', height: '100%', display: 'block' }} level="M" bgColor="#ffffff" fgColor="#000000" />;
    }
    case 'rect':
      return (
        <div style={{
          width: '100%', height: '100%', background: el.fill || 'transparent',
          border: el.stroke && el.strokeMm ? `${len(el.strokeMm, unit)} solid ${el.stroke}` : undefined,
          borderRadius: el.radiusMm ? len(el.radiusMm, unit) : undefined, boxSizing: 'border-box', ...printExact,
        }} />
      );
  }
}
