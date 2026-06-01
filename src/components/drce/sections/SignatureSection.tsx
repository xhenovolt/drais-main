// src/components/drce/sections/SignatureSection.tsx
//
// Signed-by block — one or more signatories side by side.
//
// Anatomy per signatory (top → bottom):
//   ┌─────────────────────────────┐
//   │  [signature image area]     │   ← reserved space; image OR blank line
//   │  ──────────────────────     │   ← signature line
//   │  Mr. Kalungi Steven         │   ← name (optional)
//   │  HEADTEACHER                │   ← role label (optional)
//   │  Date: 23 Oct 2026          │   ← date (optional, blank line if no value)
//   └─────────────────────────────┘
//
// The signature image is rendered when set; the line is ALWAYS rendered so
// paper-printed reports work whether or not an e-signature was uploaded.
'use client';

import React from 'react';
import type {
  DRCESignatureSection,
  DRCEDataContext,
  DRCESignatory,
} from '@/lib/drce/schema';
import { resolveBinding } from '@/lib/drce/bindingResolver';

interface Props {
  section: DRCESignatureSection;
  ctx:     DRCEDataContext;
}

/**
 * Resolve the signature image for a signatory. The image binding wins
 * when it resolves to a non-empty string; otherwise the static URL is
 * used. This mirrors the image shape's behaviour exactly.
 */
function resolveSignatureImage(s: DRCESignatory, ctx: DRCEDataContext): string {
  if (s.imageBinding) {
    const bound = resolveBinding(s.imageBinding, ctx);
    if (typeof bound === 'string' && bound.trim()) return bound;
  }
  return s.signatureImageUrl || '';
}

export function SignatureSection({ section, ctx }: Props) {
  if (!section.visible) return null;

  const style = section.style ?? {};
  const sigs  = section.signatories ?? [];
  if (sigs.length === 0) return null;

  const perRow         = Math.max(1, style.perRow ?? sigs.length);
  const gap            = style.gap ?? 24;
  const lineColor      = style.lineColor ?? '#111';
  const lineThickness  = style.lineThickness ?? 1;
  const signatureHeight = style.signatureHeight ?? 48;
  const imageFit       = style.imageFit ?? 'contain';
  const labelColor     = style.labelColor ?? '#444';
  const labelFontSize  = style.labelFontSize ?? 10;
  const labelWeight    = style.labelWeight ?? 700;
  const nameColor      = style.nameColor ?? '#111';
  const nameFontSize   = style.nameFontSize ?? 12;
  const padding        = style.padding ?? '8px 0';
  const background     = style.background ?? 'transparent';
  const showDateLabel  = style.showDateLabel !== false;
  const dateLabel      = style.dateLabel ?? 'Date:';

  return (
    <div
      style={{
        display:             'grid',
        gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))`,
        gap,
        padding,
        background,
        width:               '100%',
      }}
    >
      {sigs.map(sig => {
        const imageUrl = resolveSignatureImage(sig, ctx);
        const showDate = sig.showDate !== false;
        return (
          <div
            key={sig.id}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
          >
            {/* Signature image area — reserved height even when empty so all
                signatories align vertically. */}
            <div
              style={{
                height:         signatureHeight,
                display:        'flex',
                alignItems:     'flex-end',
                justifyContent: 'center',
                overflow:       'hidden',
              }}
            >
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt={sig.name || sig.roleLabel || 'signature'}
                  style={{
                    maxWidth:  '100%',
                    maxHeight: '100%',
                    objectFit: imageFit === 'stretch' ? 'fill' : imageFit,
                    display:   'block',
                  }}
                />
              )}
            </div>

            {/* Signature line — always rendered. */}
            <div
              style={{
                borderTop: `${lineThickness}px solid ${lineColor}`,
                marginTop: 2,
              }}
            />

            {/* Name (optional). */}
            {sig.name && (
              <div
                style={{
                  fontSize:   nameFontSize,
                  color:      nameColor,
                  marginTop:  4,
                  textAlign:  'center',
                  fontWeight: 600,
                }}
              >
                {sig.name}
              </div>
            )}

            {/* Role label (optional). */}
            {sig.roleLabel && (
              <div
                style={{
                  fontSize:       labelFontSize,
                  color:          labelColor,
                  textTransform:  'uppercase',
                  letterSpacing:  0.5,
                  fontWeight:     labelWeight,
                  textAlign:      'center',
                  marginTop:      1,
                }}
              >
                {sig.roleLabel}
              </div>
            )}

            {/* Date row. When showDate is true but no dateValue, render a
                blank inline line for hand-signing on paper. */}
            {showDate && (
              <div
                style={{
                  marginTop:  6,
                  fontSize:   Math.max(labelFontSize - 1, 9),
                  color:      labelColor,
                  display:    'flex',
                  gap:        4,
                  alignItems: 'baseline',
                  justifyContent: 'center',
                }}
              >
                {showDateLabel && <span>{dateLabel}</span>}
                {sig.dateValue
                  ? <span style={{ color: nameColor }}>{sig.dateValue}</span>
                  : <span style={{
                      display:     'inline-block',
                      minWidth:    80,
                      borderBottom: `${lineThickness}px solid ${lineColor}`,
                      height:      14,
                    }} />
                }
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
