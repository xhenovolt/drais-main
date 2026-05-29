'use client';
/**
 * CAFE Phase 4 — competency_table section.
 *
 * Renders a subjects × components grid showing the grade code per cell.
 * Reads `result.components[]` populated by the Phase 2 snapshot adapter.
 *
 * Determinism: pure function of (section, dataCtx). No I/O.
 */
import React from 'react';
import type {
  DRCECompetencyTableSection as Section, DRCETheme, DRCEDataContext, DRCESection,
} from '@/lib/drce/schema';

interface Props { section: Section; theme: DRCETheme; ctx: DRCEDataContext }

export function CompetencyTableSection({ section, ctx }: Props) {
  const style = section.style ?? {};
  const results = ctx.results ?? [];

  // Collect every unique component code across all results, preserving
  // the order in which they appear so report ordering is stable.
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
  const showRollup  = section.showRollup  !== false;

  if (!results.length) return <EmptyState message="No subjects with component data for this learner." />;
  if (!codes.length)   return <EmptyState message="No component data captured yet for this snapshot." />;

  return (
    <table style={{
      width: '100%', borderCollapse: 'collapse',
      fontSize: style.rowFontSize ?? 11,
    }}>
      <thead>
        <tr>
          {showSubject && (
            <th style={cellStyle(style, true)}>Subject</th>
          )}
          {codes.map(code => (
            <th key={code} style={cellStyle(style, true)}>
              {labelByCode.get(code) ?? code}
            </th>
          ))}
          {showRollup && <th style={cellStyle(style, true)}>Rollup</th>}
        </tr>
      </thead>
      <tbody>
        {results.map((r, i) => {
          const comps = ((r as { components?: Array<{ code: string; gradeCode: string | null; score: number | null; displayScore: string }> }).components ?? []);
          const byCode = new Map(comps.map(c => [c.code, c]));
          return (
            <tr key={i}>
              {showSubject && (
                <td style={cellStyle(style, false)}>{r.subjectName}</td>
              )}
              {codes.map(code => {
                const c = byCode.get(code);
                return (
                  <td key={code} style={cellStyle(style, false)}>
                    {c?.gradeCode ?? c?.displayScore ?? ''}
                  </td>
                );
              })}
              {showRollup && (
                <td style={cellStyle(style, false)}>
                  {r.total == null ? '' : String(r.total)}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function cellStyle(s: NonNullable<Section['style']>, header: boolean): React.CSSProperties {
  return {
    padding: `${s.padding ?? 4}px ${(s.padding ?? 4) + 2}px`,
    background: header ? (s.headerBackground ?? '#e5e7eb') : undefined,
    border: header ? (s.headerBorder ?? '1px solid #ccc') : (s.rowBorder ?? '1px solid #ddd'),
    fontSize: header ? (s.headerFontSize ?? 11) : (s.rowFontSize ?? 11),
    fontWeight: header ? 600 : undefined,
    textAlign: 'left',
  };
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{
      padding: '12px', border: '1px dashed #d1d5db', borderRadius: 4,
      color: '#6b7280', fontSize: 11, fontStyle: 'italic', textAlign: 'center',
    }}>
      {message}
    </div>
  );
}

export function defaultCompetencyTable(): Omit<DRCESection, 'id' | 'order'> {
  return {
    type: 'competency_table', visible: true,
    showSubject: true, showRollup: true,
    style: {
      headerBackground: '#e5e7eb',
      headerBorder: '1px solid #ccc',
      rowBorder: '1px solid #ddd',
      headerFontSize: 11, rowFontSize: 11, padding: 4,
    },
  } as Omit<DRCESection, 'id' | 'order'>;
}
