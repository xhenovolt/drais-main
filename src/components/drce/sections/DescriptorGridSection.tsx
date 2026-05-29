'use client';
/**
 * CAFE Phase 4 — descriptor_grid section.
 *
 * Same grid shape as competency_table but renders descriptor TEXT instead
 * of grade codes — for narrative competency reports.
 */
import React from 'react';
import type {
  DRCEDescriptorGridSection as Section, DRCETheme, DRCEDataContext, DRCESection,
} from '@/lib/drce/schema';

interface Props { section: Section; theme: DRCETheme; ctx: DRCEDataContext }

export function DescriptorGridSection({ section, ctx }: Props) {
  const style = section.style ?? {};
  const results = ctx.results ?? [];

  const codeOrder: string[] = [];
  const seenCodes = new Set<string>();
  const labelByCode = new Map<string, string>();
  for (const r of results) {
    const comps = (r as { components?: Array<{ code: string; name: string }> }).components ?? [];
    for (const c of comps) {
      if (!seenCodes.has(c.code)) {
        seenCodes.add(c.code);
        codeOrder.push(c.code);
        labelByCode.set(c.code, c.name);
      }
    }
  }
  const codes = section.componentCodes?.length
    ? section.componentCodes.filter(c => seenCodes.has(c))
    : codeOrder;

  const showSubject = section.showSubject !== false;

  if (!results.length || !codes.length) return (
    <div style={{
      padding: '12px', border: '1px dashed #d1d5db', borderRadius: 4,
      color: '#6b7280', fontSize: 11, fontStyle: 'italic', textAlign: 'center',
    }}>
      No descriptor data for this learner yet.
    </div>
  );

  return (
    <table style={{
      width: '100%', borderCollapse: 'collapse',
      fontSize: style.fontSize ?? 11,
    }}>
      <thead>
        <tr>
          {showSubject && <th style={th(style)}>Subject</th>}
          {codes.map(code => <th key={code} style={th(style)}>{labelByCode.get(code) ?? code}</th>)}
        </tr>
      </thead>
      <tbody>
        {results.map((r, i) => {
          const comps = ((r as { components?: Array<{ code: string; valueText: string | null; gradeCode: string | null }> }).components ?? []);
          const byCode = new Map(comps.map(c => [c.code, c]));
          return (
            <tr key={i}>
              {showSubject && <td style={td(style)}>{r.subjectName}</td>}
              {codes.map(code => {
                const c = byCode.get(code);
                const text = c?.valueText || c?.gradeCode || '';
                return <td key={code} style={td(style)}>{text}</td>;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function th(s: NonNullable<Section['style']>): React.CSSProperties {
  return {
    padding: `${s.padding ?? 6}px`, fontSize: s.fontSize ?? 11,
    background: s.headerBackground ?? '#e5e7eb', fontWeight: 600,
    border: s.rowBorder ?? '1px solid #ddd', textAlign: 'left',
  };
}
function td(s: NonNullable<Section['style']>): React.CSSProperties {
  return {
    padding: `${s.padding ?? 6}px`, fontSize: s.fontSize ?? 11,
    border: s.rowBorder ?? '1px solid #ddd', textAlign: 'left',
    verticalAlign: 'top',
  };
}

export function defaultDescriptorGrid(): Omit<DRCESection, 'id' | 'order'> {
  return {
    type: 'descriptor_grid', visible: true, showSubject: true,
    style: { headerBackground: '#f3f4f6', rowBorder: '1px solid #e5e7eb', fontSize: 11, padding: 6 },
  } as Omit<DRCESection, 'id' | 'order'>;
}
