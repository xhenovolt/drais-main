/**
 * Built-in DRCE section plugins — Phase D.
 *
 * Registers every existing section type as a plugin descriptor. The Render
 * function for each is a thin wrapper around the already-existing section
 * component — no behaviour change, no render-output change, no schema change.
 * The renderer (DRCEDocumentRenderer) consults this registry instead of a
 * hardcoded switch; new section types can register elsewhere without
 * editing the renderer.
 *
 * Importing this module triggers registration as a side-effect. Import once
 * at the top of `DRCEDocumentRenderer.tsx` (and in tests as needed).
 */
'use client';

import React from 'react';
import type {
  DRCESection,
} from '@/lib/drce/schema';
import { registerSection, type SectionRenderProps } from '@/lib/drce/section-registry';

import { HeaderSection }         from './HeaderSection';
import { BannerSection }         from './BannerSection';
import { StudentInfoSection }    from './StudentInfoSection';
import { RibbonSection }         from './RibbonSection';
import { ResultsTableSection }   from './ResultsTableSection';
import { AssessmentSection }     from './AssessmentSection';
import { CommentsSection }       from './CommentsSection';
import { GradeTableSection }     from './GradeTableSection';
import { SpacerSection }         from './SpacerSection';
import { DividerSection }        from './DividerSection';
import { NextTermBeginsSection } from './NextTermBeginsSection';

// ─── Helper: enhanced data context with language hint (matches old renderer) ─

function enhanced(p: SectionRenderProps) {
  return { ...p.dataCtx, language: p.renderCtx.language };
}

// ─── Registrations ──────────────────────────────────────────────────────────

registerSection({
  type:  'header',
  label: 'Header',
  icon:  '🏫',
  description: 'School identity row: logo, name, address, contact.',
  defaultProps: () => ({
    type: 'header', visible: true,
    style: { layout: 'three-column', paddingBottom: 10, borderBottom: '1px solid #eee', opacity: 1, logoWidth: 64, logoHeight: 64 },
  } as Omit<DRCESection, 'id' | 'order'>),
  Render: ((p: SectionRenderProps) =>
    <HeaderSection section={p.section as any} theme={p.theme} ctx={p.renderCtx as any} />) as any,
});

registerSection({
  type:  'banner',
  label: 'Banner',
  icon:  '🎉',
  description: 'Full-width title or announcement band.',
  defaultProps: () => ({
    type: 'banner', visible: true, content: { text: 'New Banner' },
    style: { backgroundColor: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 'bold',
      textAlign: 'center', padding: '8px', letterSpacing: '0.05em',
      textTransform: 'uppercase', borderRadius: 0 },
  } as Omit<DRCESection, 'id' | 'order'>),
  Render: ((p: SectionRenderProps) =>
    <BannerSection section={p.section as any} theme={p.theme} ctx={enhanced(p) as any} />) as any,
});

registerSection({
  type:  'student_info',
  label: 'Student Info',
  icon:  '👤',
  description: 'Identity panel: name, class, photo, barcode.',
  defaultProps: () => ({
    type: 'student_info', visible: true,
    fields: [{ id: `f-${Date.now()}`, label: 'Name', binding: 'student.fullName', visible: true, order: 0 }],
    style: { border: '1px solid #ccc', borderRadius: 4, padding: '12px 14px',
      background: '#f9f9f9', labelColor: '#555', valueColor: '#000',
      valueFontWeight: 'bold', valueFontSize: 13 },
  } as Omit<DRCESection, 'id' | 'order'>),
  Render: ((p: SectionRenderProps) =>
    <StudentInfoSection section={p.section as any} theme={p.theme} ctx={enhanced(p) as any} />) as any,
});

registerSection({
  type:  'ribbon',
  label: 'Ribbon',
  icon:  '🎀',
  description: 'Decorative band with chevron/flat shape.',
  defaultProps: () => ({
    type: 'ribbon', visible: true, content: { text: 'New Ribbon', shape: 'flat' },
    style: { background: '#e5e7eb', color: '#111', fontWeight: 'bold',
      fontSize: 13, padding: '4px 0', textAlign: 'center' },
  } as Omit<DRCESection, 'id' | 'order'>),
  Render: ((p: SectionRenderProps) =>
    <RibbonSection section={p.section as any} theme={p.theme} ctx={enhanced(p) as any} />) as any,
});

registerSection({
  type:  'results_table',
  label: 'Results Table',
  icon:  '📊',
  description: 'Per-subject results with configurable columns and totals.',
  defaultProps: () => ({
    type: 'results_table', visible: true,
    columns: [
      { id: `col-${Date.now()}-1`, header: 'Subject', binding: 'result.subjectName', width: '30%', visible: true, order: 0, align: 'left' },
      { id: `col-${Date.now()}-2`, header: 'Grade',   binding: 'result.grade',       width: '15%', visible: true, order: 1, align: 'center' },
    ],
    style: { headerBackground: '#e5e7eb', headerBorder: '1px solid #ccc',
      rowBorder: '1px solid #ddd', headerFontSize: 11, rowFontSize: 11,
      headerTextTransform: 'uppercase', padding: 4 },
  } as Omit<DRCESection, 'id' | 'order'>),
  Render: ((p: SectionRenderProps) =>
    <ResultsTableSection
      section={p.section as any}
      theme={p.theme}
      ctx={enhanced(p) as any}
      onCellChange={p.onCellChange ? (columnId, rowIndex, newValue) => p.onCellChange!(p.section.id, columnId, rowIndex, newValue) : undefined}
      onColumnHide={p.onColumnHide ? (columnId) => p.onColumnHide!(p.section.id, columnId) : undefined}
    />) as any,
});

registerSection({
  type:  'assessment',
  label: 'Assessment',
  icon:  '🎓',
  description: 'Aggregate row: class position, average, grade.',
  defaultProps: () => ({
    type: 'assessment', visible: true,
    fields: [{ id: `af-${Date.now()}`, label: 'Class Position', binding: 'assessment.classPosition', visible: true, order: 0 }],
    style: {
      layout: 'table', width: '100%', positionFields: 1,
      assessmentLabel: 'Grade Assessment', tableLayout: 'fixed',
      cellPadding: '2px 8px', headerFontSize: 11, labelFontSize: 10,
      valueFontSize: 12, valueFontWeight: 'bold',
      border: '1px solid #ccc', borderRadius: 8, padding: '10px 20px',
      background: '#f9f9f9', headerBackground: '#f2f2f2',
      borderColor: '#cccccc', labelColor: '#444444', valueColor: '#000000',
      itemMinWidth: 160, rowGap: 4, columnGap: 16,
    } as Record<string, unknown>,
  } as Omit<DRCESection, 'id' | 'order'>),
  Render: ((p: SectionRenderProps) =>
    <AssessmentSection section={p.section as any} theme={p.theme} ctx={enhanced(p) as any} />) as any,
});

registerSection({
  type:  'comments',
  label: 'Comments',
  icon:  '💬',
  description: 'Class-teacher / DOS / head-teacher comments.',
  defaultProps: () => ({
    type: 'comments', visible: true,
    items: [{ id: `ci-${Date.now()}`, label: 'Teacher Comment', binding: 'comments.classTeacher', visible: true, order: 0 }],
    style: { ribbonBackground: '#6b7280', ribbonColor: '#fff', textColor: '#333', textFontStyle: 'italic' },
  } as Omit<DRCESection, 'id' | 'order'>),
  Render: ((p: SectionRenderProps) =>
    <CommentsSection section={p.section as any} theme={p.theme} ctx={enhanced(p) as any} />) as any,
});

registerSection({
  type:  'grade_table',
  label: 'Grade Table',
  icon:  '🅰️',
  description: 'Grade legend: score ranges and their letter grades.',
  defaultProps: () => ({
    type: 'grade_table', visible: true,
    grades: [],
    style: { headerBackground: '#e5e7eb', border: '1px solid #ccc' },
  } as Omit<DRCESection, 'id' | 'order'>),
  Render: ((p: SectionRenderProps) =>
    <GradeTableSection section={p.section as any} theme={p.theme} ctx={enhanced(p) as any} />) as any,
});

registerSection({
  type:  'spacer',
  label: 'Spacer',
  icon:  '↕️',
  description: 'Vertical whitespace.',
  defaultProps: () => ({
    type: 'spacer', visible: true,
    style: { height: 20 },
  } as Omit<DRCESection, 'id' | 'order'>),
  Render: ((p: SectionRenderProps) =>
    <SpacerSection section={p.section as any} />) as any,
});

registerSection({
  type:  'divider',
  label: 'Divider',
  icon:  '➖',
  description: 'Horizontal rule between sections.',
  defaultProps: () => ({
    type: 'divider', visible: true,
    style: { color: '#cccccc', thickness: 1, margin: '8px 0' },
  } as Omit<DRCESection, 'id' | 'order'>),
  Render: ((p: SectionRenderProps) =>
    <DividerSection section={p.section as any} />) as any,
});

registerSection({
  type:  'next_term_begins',
  label: 'Next Term Begins',
  icon:  '📅',
  description: 'Date the next term starts (prefers inferred calendar; falls back to manual override).',
  defaultProps: () => ({
    type: 'next_term_begins', visible: true,
    content: { text: 'Next term begins', customDate: '' },
    style: { background: '#e0f2fe', color: '#0c4a6e', fontSize: 14, fontWeight: '600',
      textAlign: 'center', padding: '10px 12px', borderRadius: 6, borderColor: '#06b6d4',
      borderWidth: 1, icon: '📅' },
  } as Omit<DRCESection, 'id' | 'order'>),
  Render: ((p: SectionRenderProps) =>
    <NextTermBeginsSection section={p.section as any} nextTermBegins={p.dataCtx.meta.nextTermBegins} />) as any,
});
