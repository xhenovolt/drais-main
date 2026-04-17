"use client";
/**
 * IDCardPreview — renders a single, pixel-accurate student ID card.
 *
 * Dimensions follow ISO/IEC 7810 ID-1 (credit card):
 *   85.6 mm × 54 mm  →  at 96 dpi screen: 323.6 × 204.1 px
 *   We use CSS mm units so print output is also exact.
 *
 * PRINT SAFE: all colours/fonts are inline-styled so @media print works.
 */

import React from 'react';
import type { IDCardConfig } from '@/lib/idCardConfig';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface IDCardStudent {
  id: number;
  first_name: string;
  last_name: string;
  other_name?: string;
  admission_no?: string;
  class_name?:  string;
  stream_name?: string;
  gender?:      string;
  date_of_birth?: string;
  photo_url?:   string;
}

export interface IDCardMeta {
  schoolName:  string;
  schoolLogo?: string;
  academicYear?: string;
}

interface Props {
  student:  IDCardStudent;
  meta:     IDCardMeta;
  config:   IDCardConfig;
  /** Scale factor for preview — does NOT affect print output */
  scale?:   number;
  /** When true, wraps in a print-safe container (no extra chrome) */
  printMode?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDob(dob?: string): string {
  if (!dob) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(dob));
  } catch { return dob; }
}

function resolveFooterText(template: string, schoolName: string): string {
  return template.replace(/\{schoolName\}/gi, schoolName);
}

function AvatarPlaceholder({ size, bgColor, textColor, initials }: {
  size: number; bgColor: string; textColor: string; initials: string;
}) {
  return (
    <div style={{
      width: size, height: size,
      borderRadius: '50%',
      background: bgColor,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.32, fontWeight: 700, color: textColor,
      flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export const IDCardPreview = React.forwardRef<HTMLDivElement, Props>(
  function IDCardPreview({ student, meta, config, scale = 1, printMode = false }, ref) {
    const {
      bgColor, accentColor, textColor, labelColor,
      footerBgColor, footerTextColor,
      fontSize, fontWeight, fontFamily,
      showDob, showGender, showClass, showAdmissionNo,
      showSignatureLine, showFooter, footerText,
      schoolLogoUrl, borderRadius, borderWidth, borderColor,
    } = config;

    const logoSrc    = schoolLogoUrl || meta.schoolLogo || '';
    const photoSrc   = student.photo_url || '';
    const initials   = `${student.first_name?.[0] ?? ''}${student.last_name?.[0] ?? ''}`.toUpperCase();
    const fullName   = [student.first_name, student.other_name, student.last_name].filter(Boolean).join(' ');
    const className  = [student.class_name, student.stream_name].filter(Boolean).join(' — ');
    const footerLine = showFooter ? resolveFooterText(footerText, meta.schoolName) : '';

    const cardStyle: React.CSSProperties = {
      // ISO ID-1 dimensions
      width:  '85.6mm',
      height: '54mm',
      borderRadius: `${borderRadius}px`,
      border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : 'none',
      background: bgColor,
      fontFamily,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      transform: scale !== 1 ? `scale(${scale})` : undefined,
      transformOrigin: scale !== 1 ? 'top left' : undefined,
      boxShadow: printMode ? 'none' : '0 8px 32px rgba(0,0,0,0.35)',
      flexShrink: 0,
    };

    return (
      <div ref={ref} style={cardStyle} className="id-card-root">

        {/* ── Decorative top-accent bar ───────────────────────────────────── */}
        <div style={{
          height: '4mm',
          background: `linear-gradient(90deg, ${accentColor}CC, ${accentColor})`,
          flexShrink: 0,
        }} />

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          gap: '3mm',
          padding: '2.5mm 3mm 1.5mm',
          overflow: 'hidden',
        }}>

          {/* ── Left column: logo + photo ──────────────────────────────────── */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2mm',
            flexShrink: 0,
            width: '22mm',
          }}>
            {/* School Logo */}
            <div style={{
              width: '10mm', height: '10mm',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
              border: `1px solid ${accentColor}60`,
              flexShrink: 0,
            }}>
              {logoSrc
                ? <img src={logoSrc} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 7, fontWeight: 700, color: accentColor }}>
                    {meta.schoolName.slice(0, 2).toUpperCase()}
                  </span>
              }
            </div>

            {/* Student Photo */}
            <div style={{
              width: '18mm', height: '20mm',
              borderRadius: '3px',
              overflow: 'hidden',
              border: `1.5px solid ${accentColor}80`,
              background: 'rgba(255,255,255,0.08)',
              flexShrink: 0,
            }}>
              {photoSrc
                ? <img
                    src={photoSrc}
                    alt={fullName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
                  />
                : <div style={{
                    width: '100%', height: '100%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(255,255,255,0.07)',
                    fontSize: 16, fontWeight: 700, color: accentColor,
                  }}>
                    {initials}
                  </div>
              }
            </div>
          </div>

          {/* ── Divider ───────────────────────────────────────────────────── */}
          <div style={{
            width: 1,
            background: `${accentColor}40`,
            flexShrink: 0,
            margin: '0 0.5mm',
          }} />

          {/* ── Right column: text info ────────────────────────────────────── */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflow: 'hidden',
            minWidth: 0,
          }}>
            {/* School Name */}
            <div>
              <p style={{
                margin: 0, padding: 0,
                fontSize: `${Math.max(fontSize - 1, 7)}px`,
                fontWeight: 700,
                color: accentColor,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {meta.schoolName}
              </p>
              {meta.academicYear && (
                <p style={{
                  margin: 0, padding: 0,
                  fontSize: `${Math.max(fontSize - 3, 6)}px`,
                  color: labelColor,
                  lineHeight: 1.2,
                  marginBottom: '1mm',
                }}>
                  {meta.academicYear}
                </p>
              )}
              {/* Accent rule */}
              <div style={{ height: 1, background: `${accentColor}50`, margin: '1mm 0' }} />
            </div>

            {/* Student fields */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.8mm', justifyContent: 'center' }}>
              <FieldRow
                label="NAME" value={fullName}
                fontSize={fontSize} fontWeight={fontWeight}
                labelColor={labelColor} textColor={textColor}
                bold
              />
              {showAdmissionNo && student.admission_no && (
                <FieldRow label="REG NO" value={student.admission_no}
                  fontSize={fontSize} fontWeight={fontWeight}
                  labelColor={labelColor} textColor={textColor}
                />
              )}
              {showClass && className && (
                <FieldRow label="CLASS" value={className}
                  fontSize={fontSize} fontWeight={fontWeight}
                  labelColor={labelColor} textColor={textColor}
                />
              )}
              {showGender && student.gender && (
                <FieldRow label="GENDER" value={student.gender.charAt(0).toUpperCase() + student.gender.slice(1).toLowerCase()}
                  fontSize={fontSize} fontWeight={fontWeight}
                  labelColor={labelColor} textColor={textColor}
                />
              )}
              {showDob && student.date_of_birth && (
                <FieldRow label="D.O.B" value={formatDob(student.date_of_birth)}
                  fontSize={fontSize} fontWeight={fontWeight}
                  labelColor={labelColor} textColor={textColor}
                />
              )}
            </div>

            {/* Signature line */}
            {showSignatureLine && (
              <div style={{ marginTop: '1mm' }}>
                <div style={{ height: 1, background: `${accentColor}60`, width: '65%', margin: '0 0 0.5mm' }} />
                <p style={{ margin: 0, fontSize: `${Math.max(fontSize - 3, 5)}px`, color: labelColor }}>
                  Authorised Signature
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        {showFooter && footerLine && (
          <div style={{
            background: footerBgColor,
            padding: '0.6mm 3mm',
            textAlign: 'center',
            flexShrink: 0,
          }}>
            <p style={{
              margin: 0, padding: 0,
              fontSize: `${Math.max(fontSize - 3, 5)}px`,
              color: footerTextColor,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              letterSpacing: '0.03em',
            }}>
              {footerLine}
            </p>
          </div>
        )}
      </div>
    );
  }
);

// ─── Helper: field row ────────────────────────────────────────────────────────

function FieldRow({
  label, value, fontSize, fontWeight, labelColor, textColor, bold = false,
}: {
  label: string; value: string;
  fontSize: number; fontWeight: string;
  labelColor: string; textColor: string;
  bold?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1mm', lineHeight: 1.25, minWidth: 0 }}>
      <span style={{
        fontSize: `${Math.max(fontSize - 3, 5)}px`,
        color: labelColor,
        fontWeight: 500,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.04em',
        flexShrink: 0,
        minWidth: '8mm',
      }}>
        {label}
      </span>
      <span style={{
        fontSize: `${fontSize}px`,
        color: textColor,
        fontWeight: bold ? 700 : (fontWeight as any),
        whiteSpace: 'nowrap' as const,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        flex: 1,
        minWidth: 0,
      }}>
        {value}
      </span>
    </div>
  );
}
