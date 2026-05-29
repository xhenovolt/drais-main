'use client';
/**
 * CAFE Phase 4 — project_outcomes section.
 *
 * Renders the student's integrated-project portfolio. Reads
 * `student.projects` — storage lands in a later CAFE phase. Placeholder
 * surface today so authors can lay out templates against the future shape.
 */
import React from 'react';
import type {
  DRCEProjectOutcomesSection as Section, DRCETheme, DRCEDataContext, DRCESection,
} from '@/lib/drce/schema';

interface Props { section: Section; theme: DRCETheme; ctx: DRCEDataContext }

interface ProjectEntry {
  title: string; descriptor: string | null; outcome: string | null;
  evidenceUrl?: string | null; gradeCode?: string | null;
}

export function ProjectOutcomesSection({ section, ctx }: Props) {
  const style = section.style ?? {};
  const accent = style.accentColor ?? '#1d4ed8';
  const heading = section.heading ?? 'Integrated Projects';
  const raw = ((ctx.student as unknown) as { projects?: ProjectEntry[] }).projects;
  const projects = Array.isArray(raw) ? raw : [];

  return (
    <div style={{ borderLeft: `3px solid ${accent}`, paddingLeft: 10 }}>
      <div style={{
        fontSize: (style.fontSize ?? 11) + 2, fontWeight: 700,
        background: style.headerBackground ?? 'transparent',
        padding: '4px 6px', marginBottom: 6,
      }}>
        {heading}
      </div>
      {projects.length === 0 ? (
        <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', padding: '4px 6px' }}>
          Project portfolio tracking is a future CAFE storage feature.
          Templates can bind <code style={{ background: '#f3f4f6', padding: '0 4px' }}>student.projects</code>;
          entries will appear here once project storage ships.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {projects.map((p, i) => (
            <li key={i} style={{
              padding: '6px 0',
              borderTop: i === 0 ? 'none' : '1px solid #f3f4f6',
              fontSize: style.fontSize ?? 11,
            }}>
              <strong>{p.title}</strong>
              {p.gradeCode && <span style={{ marginLeft: 8, color: accent, fontWeight: 600 }}>· {p.gradeCode}</span>}
              {p.descriptor && <div style={{ color: '#6b7280', marginTop: 2 }}>{p.descriptor}</div>}
              {p.outcome    && <div style={{ marginTop: 2 }}>{p.outcome}</div>}
              {section.showEvidence && p.evidenceUrl && (
                <a href={p.evidenceUrl} style={{ color: accent, fontSize: 10 }}>Evidence ↗</a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function defaultProjectOutcomes(): Omit<DRCESection, 'id' | 'order'> {
  return {
    type: 'project_outcomes', visible: true, heading: 'Integrated Projects',
    style: { accentColor: '#1d4ed8', fontSize: 11 },
  } as Omit<DRCESection, 'id' | 'order'>;
}
