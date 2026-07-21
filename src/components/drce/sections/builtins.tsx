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
import { newFieldId, newColumnId, newItemId } from '@/lib/drce/ids';

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
import { ContainerSection, defaultContainer } from './ContainerSection';
import { ShapeSection, defaultShapeSection } from './ShapeSection';
import { HeaderBlockSection, defaultHeaderBlock } from './HeaderBlockSection';
import { BlockRefSection, defaultBlockRef } from './BlockRefSection';
import { TableSection, defaultTable } from './TableSection';
// CAFE Phase 4
import { CompetencyTableSection, defaultCompetencyTable } from './CompetencyTableSection';
import { DescriptorGridSection, defaultDescriptorGrid }   from './DescriptorGridSection';
import { AoIBreakdownSection, defaultAoIBreakdown }       from './AoIBreakdownSection';
import { SkillsBlockSection, defaultSkillsBlock }         from './SkillsBlockSection';
import { ProjectOutcomesSection, defaultProjectOutcomes } from './ProjectOutcomesSection';
import { NarrativeBlockSection, defaultNarrativeBlock }   from './NarrativeBlockSection';
import { SignatureSection }                                from './SignatureSection';

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
    fields: [{ id: newFieldId(), label: 'Name', binding: 'student.fullName', visible: true, order: 0 }],
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
      { id: newColumnId(), header: 'Subject', binding: 'result.subjectName', width: '30%', visible: true, order: 0, align: 'left' },
      { id: newColumnId(), header: 'Grade',   binding: 'result.grade',       width: '15%', visible: true, order: 1, align: 'center' },
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
      renderCtx={p.renderCtx}
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
    fields: [{ id: newFieldId(), label: 'Class Position', binding: 'assessment.classPosition', visible: true, order: 0 }],
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
    items: [{ id: newItemId(), label: 'Teacher Comment', binding: 'comments.classTeacher', visible: true, order: 0 }],
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
  type:  'signature_block',
  label: 'Signatures',
  icon:  '✍️',
  description: 'Signed-by panel — headteacher / class teacher row with name, role and date.',
  defaultProps: () => ({
    type: 'signature_block',
    visible: true,
    signatories: [
      { id: newItemId(), roleLabel: 'HEADTEACHER',   name: '', showDate: true },
      { id: newItemId(), roleLabel: 'CLASS TEACHER', name: '', showDate: true },
    ],
    style: {
      perRow:           2,
      gap:              32,
      lineColor:        '#111',
      lineThickness:    1,
      signatureHeight:  48,
      imageFit:         'contain',
      labelColor:       '#444',
      labelFontSize:    10,
      labelWeight:      700,
      nameColor:        '#111',
      nameFontSize:     12,
      padding:          '8px 0',
      background:       'transparent',
      showDateLabel:    true,
      dateLabel:        'Date:',
    },
  } as Omit<DRCESection, 'id' | 'order'>),
  Render: ((p: SectionRenderProps) =>
    <SignatureSection section={p.section as any} ctx={enhanced(p) as any} />) as any,
});

registerSection({
  type:  'table',
  label: 'Table',
  icon:  '🧮',
  description: 'Spreadsheet-style DataGrid with per-cell editing, formulas (=SUM, =AVG, =IF), and arbitrary dataSource binding.',
  defaultProps: defaultTable,
  Render: ((p: SectionRenderProps) =>
    <TableSection section={p.section as any} theme={p.theme} ctx={enhanced(p) as any} />) as any,
});

registerSection({
  type:  'block_ref',
  label: 'Block (from library)',
  icon:  '📚',
  description: 'Reference a shared block from the library. Inlined at render time; editing the block updates every document that references it.',
  defaultProps: defaultBlockRef,
  Render: ((p: SectionRenderProps) =>
    <BlockRefSection section={p.section as any} />) as any,
});

registerSection({
  type:  'header_block',
  label: 'Header block',
  icon:  '🧩',
  description: 'One header element (logo, name, address, contact, motto, QR, custom). Drop several into a row container for true header composition.',
  defaultProps: defaultHeaderBlock,
  Render: ((p: SectionRenderProps) =>
    <HeaderBlockSection section={p.section as any} ctx={enhanced(p) as any} />) as any,
});

registerSection({
  type:  'shape',
  label: 'Shape',
  icon:  '⬛',
  description: 'A single decorative shape, placed inside a container (typically absolute) instead of the legacy overlay.',
  defaultProps: defaultShapeSection,
  Render: ((p: SectionRenderProps) =>
    <ShapeSection section={p.section as any} />) as any,
});

registerSection({
  type:  'container',
  label: 'Container',
  icon:  '🧱',
  description: 'Group child sections. Layouts: stack (C.1), row/grid/absolute (C.2). Containers can hold containers.',
  defaultProps: defaultContainer,
  Render: ((p: SectionRenderProps) =>
    <ContainerSection
      section={p.section as any}
      theme={p.theme}
      dataCtx={enhanced(p) as any}
      renderCtx={p.renderCtx}
      onCellChange={p.onCellChange}
      onColumnHide={p.onColumnHide}
    />) as any,
});

registerSection({
  type:  'next_term_begins',
  label: 'Next Term Begins',
  icon:  '📅',
  description: 'Date the next term starts (prefers inferred calendar; falls back to manual override).',
  defaultProps: () => ({
    type: 'next_term_begins', visible: true,
    content: { text: 'Next term begins', customDate: '', source: 'auto_from_terms' },
    style: { background: '#e0f2fe', color: '#0c4a6e', fontSize: 14, fontWeight: '600',
      textAlign: 'center', padding: '10px 12px', borderRadius: 6, borderColor: '#06b6d4',
      borderWidth: 1, icon: '📅' },
  } as Omit<DRCESection, 'id' | 'order'>),
  Render: ((p: SectionRenderProps) =>
    <NextTermBeginsSection section={p.section as any} nextTermBegins={p.dataCtx.meta.nextTermBegins} language={p.renderCtx.language} />) as any,
});

// ─── CAFE Phase 4 — competency-aware section types ──────────────────────────

registerSection({
  type:  'competency_table',
  label: 'Competency Table',
  icon:  '🧮',
  description: 'Subjects × components grid showing grade codes. Reads result.components from the snapshot — perfect for NLSC competency reports.',
  defaultProps: defaultCompetencyTable,
  Render: ((p: SectionRenderProps) =>
    <CompetencyTableSection section={p.section as any} theme={p.theme} ctx={p.dataCtx} />) as any,
});

registerSection({
  type:  'descriptor_grid',
  label: 'Descriptor Grid',
  icon:  '📋',
  description: 'Same grid as Competency Table but renders descriptor text per cell — for narrative competency reports.',
  defaultProps: defaultDescriptorGrid,
  Render: ((p: SectionRenderProps) =>
    <DescriptorGridSection section={p.section as any} theme={p.theme} ctx={p.dataCtx} />) as any,
});

registerSection({
  type:  'aoi_breakdown',
  label: 'AoI Breakdown',
  icon:  '🎯',
  description: 'Activity-of-Integration breakdown — competency components whose code matches the configured prefix (default "aoi").',
  defaultProps: defaultAoIBreakdown,
  Render: ((p: SectionRenderProps) =>
    <AoIBreakdownSection section={p.section as any} theme={p.theme} ctx={p.dataCtx} />) as any,
});

registerSection({
  type:  'skills_block',
  label: 'Generic Skills',
  icon:  '🌟',
  description: 'Student-level generic competencies (Communication · Collaboration · ICT · …). Storage is a future CAFE phase; renders a placeholder until data exists.',
  defaultProps: defaultSkillsBlock,
  Render: ((p: SectionRenderProps) =>
    <SkillsBlockSection section={p.section as any} theme={p.theme} ctx={p.dataCtx} />) as any,
});

registerSection({
  type:  'project_outcomes',
  label: 'Project Outcomes',
  icon:  '🏆',
  description: 'Integrated project portfolio — title, descriptor, outcome, evidence link. Storage is a future CAFE phase; renders a placeholder until data exists.',
  defaultProps: defaultProjectOutcomes,
  Render: ((p: SectionRenderProps) =>
    <ProjectOutcomesSection section={p.section as any} theme={p.theme} ctx={p.dataCtx} />) as any,
});

registerSection({
  type:  'narrative_block',
  label: 'Narrative',
  icon:  '✍️',
  description: 'Multi-line paragraph bindable to any data path. Useful for head-teacher remarks and narrative competency summaries.',
  defaultProps: defaultNarrativeBlock,
  Render: ((p: SectionRenderProps) =>
    <NarrativeBlockSection section={p.section as any} theme={p.theme} ctx={p.dataCtx} />) as any,
});
