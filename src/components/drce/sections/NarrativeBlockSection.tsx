'use client';
/**
 * CAFE Phase 4 — narrative_block section.
 *
 * Multi-line free-form paragraph bindable to any data path via the
 * resolveExpression grammar (same as banner/ribbon). Useful for
 * head-teacher remarks, programme descriptions, narrative competency
 * reports.
 */
import React from 'react';
import { resolveExpression } from '@/lib/drce/computed/resolveExpression';
import type {
  DRCENarrativeBlockSection as Section, DRCETheme, DRCEDataContext, DRCESection,
} from '@/lib/drce/schema';

interface Props { section: Section; theme: DRCETheme; ctx: DRCEDataContext }

export function NarrativeBlockSection({ section, ctx }: Props) {
  const style = section.style ?? {};
  const text = resolveExpression(section.content?.text ?? '', ctx);
  return (
    <div style={{
      background:   style.background ?? '#f9fafb',
      color:        style.color      ?? '#1f2937',
      fontSize:     style.fontSize   ?? 12,
      fontStyle:    style.fontStyle  ?? 'normal',
      textAlign:    style.textAlign  ?? 'left',
      padding:      style.padding    ?? '10px 14px',
      borderLeft:   style.borderLeft ?? '3px solid #6366f1',
      lineHeight:   style.lineHeight ?? 1.5,
      whiteSpace:   'pre-wrap',
    }}>
      {text}
    </div>
  );
}

export function defaultNarrativeBlock(): Omit<DRCESection, 'id' | 'order'> {
  return {
    type: 'narrative_block', visible: true,
    content: { text: 'Narrative summary — bind to any path, e.g. {comments.headTeacher} or {student.fullName} has demonstrated …' },
    style: {
      background: '#f9fafb', color: '#1f2937', fontSize: 12, fontStyle: 'italic',
      textAlign: 'left', padding: '10px 14px', borderLeft: '3px solid #6366f1',
      lineHeight: 1.5,
    },
  } as Omit<DRCESection, 'id' | 'order'>;
}
