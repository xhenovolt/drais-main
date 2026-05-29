'use client';
/**
 * CAFE Phase 4 — skills_block section.
 *
 * Renders student-level generic skills (Communication, Collaboration, ICT, …).
 * Reads `student.genericSkills` — storage lands in a later CAFE phase. Until
 * then, the section renders a clearly-marked placeholder so template authors
 * can lay out reports against the future data shape.
 */
import React from 'react';
import type {
  DRCESkillsBlockSection as Section, DRCETheme, DRCEDataContext, DRCESection,
} from '@/lib/drce/schema';

interface Props { section: Section; theme: DRCETheme; ctx: DRCEDataContext }

interface SkillEntry { code: string; label: string; level: string | null; descriptor: string | null }

export function SkillsBlockSection({ section, ctx }: Props) {
  const style = section.style ?? {};
  const heading = section.heading ?? 'Generic Skills';
  // ctx.student.genericSkills is the future shape. We accept either an array
  // or an object so storage decisions later don't break templates already
  // authored against this section.
  const rawSkills =
    ((ctx.student as unknown) as { genericSkills?: SkillEntry[] | Record<string, SkillEntry> }).genericSkills;
  const skills: SkillEntry[] =
    Array.isArray(rawSkills) ? rawSkills :
    (rawSkills && typeof rawSkills === 'object') ? Object.values(rawSkills) :
    [];
  const filtered = section.skillCodes?.length
    ? skills.filter(s => section.skillCodes!.includes(s.code))
    : skills;

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 4 }}>
      <div style={{
        padding: '6px 8px',
        background: style.headerBackground ?? '#f3f4f6',
        fontSize: style.fontSize ?? 11, fontWeight: 600,
        borderBottom: style.rowBorder ?? '1px solid #e5e7eb',
      }}>
        {heading}
      </div>
      {filtered.length === 0 ? (
        <div style={{ padding: 10, fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>
          Generic skills tracking is a future CAFE storage feature. Templates can already
          bind <code style={{ background: '#f3f4f6', padding: '0 4px' }}>student.genericSkills</code> —
          rendered values will appear here once entry storage ships.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: style.fontSize ?? 11 }}>
          <tbody>
            {filtered.map((s, i) => (
              <tr key={i} style={{ borderTop: i === 0 ? 'none' : (style.rowBorder ?? '1px solid #f3f4f6') }}>
                <td style={{ padding: 6, fontWeight: 600, width: '40%' }}>{s.label}</td>
                <td style={{ padding: 6 }}>{s.level ?? s.descriptor ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function defaultSkillsBlock(): Omit<DRCESection, 'id' | 'order'> {
  return {
    type: 'skills_block', visible: true, heading: 'Generic Skills',
    style: { headerBackground: '#f3f4f6', rowBorder: '1px solid #f3f4f6', fontSize: 11 },
  } as Omit<DRCESection, 'id' | 'order'>;
}
