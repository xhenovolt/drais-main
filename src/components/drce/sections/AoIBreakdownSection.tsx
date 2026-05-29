'use client';
/**
 * CAFE Phase 4 — aoi_breakdown section.
 *
 * Filtered competency view focused on Activity-of-Integration components
 * (or any component family identified by a code prefix). Useful for NLSC
 * where AoI is reported separately from theory/practical scores.
 */
import React from 'react';
import type {
  DRCEAoIBreakdownSection as Section, DRCETheme, DRCEDataContext, DRCESection,
} from '@/lib/drce/schema';

interface Props { section: Section; theme: DRCETheme; ctx: DRCEDataContext }

export function AoIBreakdownSection({ section, ctx }: Props) {
  const style = section.style ?? {};
  const prefix = (section.componentPrefix ?? 'aoi').toLowerCase();
  const accent = style.accentColor ?? '#d4a017';
  const results = ctx.results ?? [];

  const rows: Array<{ subject: string; componentName: string; valueText: string; gradeCode: string | null; score: number | null }> = [];
  for (const r of results) {
    const comps = (r as { components?: Array<{ code: string; name: string; valueText: string | null; gradeCode: string | null; score: number | null }> }).components ?? [];
    for (const c of comps) {
      if (!c.code.toLowerCase().startsWith(prefix)) continue;
      rows.push({
        subject: r.subjectName, componentName: c.name,
        valueText: c.valueText ?? '', gradeCode: c.gradeCode,
        score: c.score,
      });
    }
  }
  if (!rows.length) return (
    <div style={{
      padding: '10px 12px', borderLeft: `4px solid ${accent}`,
      background: '#fafafa', color: '#6b7280', fontSize: 11, fontStyle: 'italic',
    }}>
      No Activity-of-Integration data captured for this learner.
    </div>
  );

  return (
    <div style={{ borderLeft: `4px solid ${accent}`, paddingLeft: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: style.fontSize ?? 11 }}>
        <thead>
          <tr>
            <th style={cellHead(style)}>Subject</th>
            <th style={cellHead(style)}>AoI Component</th>
            <th style={cellHead(style)}>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={cellBody(style)}>{r.subject}</td>
              <td style={cellBody(style)}>{r.componentName}</td>
              <td style={cellBody(style)}>
                {r.valueText || r.gradeCode || (r.score != null ? String(r.score) : '')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cellHead(s: NonNullable<Section['style']>): React.CSSProperties {
  return {
    padding: 6, fontSize: s.fontSize ?? 11,
    background: s.headerBackground ?? '#f3f4f6',
    border: '1px solid #e5e7eb', fontWeight: 600, textAlign: 'left',
  };
}
function cellBody(s: NonNullable<Section['style']>): React.CSSProperties {
  return { padding: 6, fontSize: s.fontSize ?? 11, border: '1px solid #e5e7eb', textAlign: 'left' };
}

export function defaultAoIBreakdown(): Omit<DRCESection, 'id' | 'order'> {
  return {
    type: 'aoi_breakdown', visible: true, componentPrefix: 'aoi',
    style: { headerBackground: '#fef3c7', accentColor: '#d4a017', fontSize: 11 },
  } as Omit<DRCESection, 'id' | 'order'>;
}
