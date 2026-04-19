// ============================================================================
// src/lib/drce/defaults.ts
// Built-in DRCE templates as typed DRCEDocument objects.
// These are the canonical defaults — used as fallback when DB is unavailable
// and as the seed for migration from old report_templates format.
// ============================================================================

import type { DRCEDocument, DRCETheme, DRCEWatermark } from './schema';

// ─── Shared defaults ─────────────────────────────────────────────────────────

const DEFAULT_WATERMARK: DRCEWatermark = {
  enabled:   false,
  type:      'text',
  content:   'CONFIDENTIAL',
  imageUrl:  null,
  opacity:   0.08,
  position:  'center',
  rotation:  -30,
  fontSize:  72,
  color:     '#000000',
  scope:     'page',
};

const DEFAULT_PAGE_BORDER = {
  enabled: false,
  color:   '#cccccc',
  width:   1,
  style:   'solid' as const,
  radius:  0,
};

// ─── 1. DRAIS Default Template ────────────────────────────────────────────────

const DRAIS_THEME: DRCETheme = {
  primaryColor:   '#0000FF',
  secondaryColor: '#B22222',
  accentColor:    '#999999',
  fontFamily:     'Arial, sans-serif',
  baseFontSize:   12,
  pagePadding:    '16px 18px',
  pageBackground: '#ffffff',
  pageBorder:     DEFAULT_PAGE_BORDER,
};

export const DRAIS_DEFAULT_DOCUMENT: DRCEDocument = {
  $schema: 'drce/v1',
  meta: {
    id:           '1',
    name:         'Default Template',
    school_id:    null,
    version:      1,
    created_at:   '2026-01-01T00:00:00Z',
    updated_at:   '2026-01-01T00:00:00Z',
    report_type:  'end_of_term',
    is_default:   true,
    template_key: 'drais_default',
  },
  theme:     DRAIS_THEME,
  watermark: DEFAULT_WATERMARK,
  sections: [
    {
      id: 'section-header', type: 'header', visible: true, order: 0,
      style: { layout: 'three-column', paddingBottom: 10, borderBottom: '1px solid #eee', opacity: 1 },
    },
    {
      id: 'section-banner', type: 'banner', visible: true, order: 1,
      content: { text: '{reportTitle}' },
      style: {
        backgroundColor: '#0000FF', color: '#ffffff', fontSize: 16,
        fontWeight: 'bold', textAlign: 'center', padding: '8px',
        letterSpacing: '0.1em', textTransform: 'uppercase', borderRadius: 0,
      },
    },
    {
      id: 'section-student-info', type: 'student_info', visible: true, order: 2,
      fields: [
        { id: 'f-name',   label: 'Name',        binding: 'student.fullName',    visible: true, order: 0 },
        { id: 'f-gender', label: 'Sex',          binding: 'student.gender',      visible: true, order: 1 },
        { id: 'f-class',  label: 'Class',        binding: 'student.className',   visible: true, order: 2 },
        { id: 'f-stream', label: 'Stream',       binding: 'student.streamName',  visible: true, order: 3 },
        { id: 'f-admno',  label: 'Student No.',  binding: 'student.admissionNo', visible: true, order: 4 },
        { id: 'f-term',   label: 'Term',         binding: 'meta.term',           visible: true, order: 5 },
      ],
      style: {
        border: '1px dashed #999', borderRadius: 0, padding: '8px',
        background: '#ffffff', labelColor: '#555555',
        valueColor: '#B22222', valueFontWeight: 'bold', valueFontSize: 14,
      },
    },
    {
      id: 'section-ribbon-1', type: 'ribbon', visible: true, order: 3,
      content: { text: 'Principal Subjects Comprising the General Assessment', shape: 'arrow-down' },
      style: {
        background: '#999999', color: '#000000', fontWeight: 'bold',
        fontSize: 12, padding: '4px 0', textAlign: 'center',
      },
    },
    {
      id: 'section-results', type: 'results_table', visible: true, order: 4,
      columns: [
        { id: 'col-subject',  header: 'Subject',  binding: 'result.subjectName',   width: '25%', visible: true, order: 0, align: 'left'   },
        { id: 'col-mid',      header: 'MT',        binding: 'result.midTermScore',  width: '8%',  visible: true, order: 1, align: 'center' },
        { id: 'col-eot',      header: 'EOT',       binding: 'result.endTermScore',  width: '8%',  visible: true, order: 2, align: 'center' },
        { id: 'col-total',    header: 'Total',     binding: 'result.total',         width: '8%',  visible: true, order: 3, align: 'center' },
        { id: 'col-grade',    header: 'Grade',     binding: 'result.grade',         width: '8%',  visible: true, order: 4, align: 'center', style: { color: '#B22222' } },
        { id: 'col-comment',  header: 'Comment',   binding: 'result.comment',       width: '35%', visible: true, order: 5, align: 'left',   style: { fontStyle: 'italic', color: '#0000FF' } },
        { id: 'col-initials', header: 'Initials',  binding: 'result.initials',      width: '8%',  visible: true, order: 6, align: 'center', style: { color: '#0000FF', fontWeight: 'bold' } },
      ],
      style: {
        headerBackground: '#f2f2f2', headerBorder: '1px solid #333',
        rowBorder: '1px solid #333', headerFontSize: 11, rowFontSize: 11,
        headerTextTransform: 'uppercase', padding: 4,
      },
    },
    {
      id: 'section-assessment', type: 'assessment', visible: true, order: 5,
      fields: [
        { id: 'a-class-pos',  label: 'Class Position',  binding: 'assessment.classPosition',  visible: true, order: 0 },
        { id: 'a-aggregates', label: 'Aggregates',       binding: 'assessment.aggregates',     visible: true, order: 1 },
        { id: 'a-division',   label: 'Division',         binding: 'assessment.division',       visible: true, order: 2 },
      ],
      style: {},
    },
    {
      id: 'section-comments', type: 'comments', visible: true, order: 6,
      items: [
        { id: 'c-class', label: 'Class teacher comment:', binding: 'comments.classTeacher', visible: true, order: 0 },
        { id: 'c-dos',   label: 'DOS Comment:',           binding: 'comments.dos',          visible: true, order: 1 },
        { id: 'c-head',  label: 'Headteacher comment:',   binding: 'comments.headTeacher',  visible: true, order: 2 },
      ],
      style: {
        ribbonBackground: '#dddddd', ribbonColor: '#000000',
        textColor: '#0000FF', textFontStyle: 'italic',
      },
    },
    {
      id: 'section-grade-table', type: 'grade_table', visible: true, order: 7,
      style: { headerBackground: '#f2f2f2', border: '1px solid #000' },
    },
  ],
  shapes: [],
};

// ─── 2. Modern Clean (Teal) ───────────────────────────────────────────────────

const MODERN_THEME: DRCETheme = {
  primaryColor:   '#0d9488',  // teal-600
  secondaryColor: '#064e3b',  // emerald-900
  accentColor:    '#d1fae5',  // emerald-100
  fontFamily:     "'Segoe UI', Arial, sans-serif",
  baseFontSize:   12,
  pagePadding:    '20px 22px',
  pageBackground: '#ffffff',
  pageBorder:     { ...DEFAULT_PAGE_BORDER, enabled: false },
};

export const MODERN_CLEAN_DOCUMENT: DRCEDocument = {
  $schema: 'drce/v1',
  meta: {
    id:           '2',
    name:         'Modern Clean',
    school_id:    null,
    version:      1,
    created_at:   '2026-01-01T00:00:00Z',
    updated_at:   '2026-01-01T00:00:00Z',
    report_type:  'end_of_term',
    is_default:   false,
    template_key: 'modern_clean',
  },
  theme:     MODERN_THEME,
  watermark: DEFAULT_WATERMARK,
  sections: [
    {
      id: 'section-header', type: 'header', visible: true, order: 0,
      style: { layout: 'three-column', paddingBottom: 12, borderBottom: '2px solid #0d9488', opacity: 1 },
    },
    {
      id: 'section-banner', type: 'banner', visible: true, order: 1,
      content: { text: '{reportTitle}' },
      style: {
        backgroundColor: '#0d9488', color: '#ffffff', fontSize: 15,
        fontWeight: 'bold', textAlign: 'center', padding: '10px',
        letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: 4,
      },
    },
    {
      id: 'section-student-info', type: 'student_info', visible: true, order: 2,
      fields: [
        { id: 'f-name',   label: 'Name',        binding: 'student.fullName',    visible: true, order: 0 },
        { id: 'f-gender', label: 'Sex',          binding: 'student.gender',      visible: true, order: 1 },
        { id: 'f-class',  label: 'Class',        binding: 'student.className',   visible: true, order: 2 },
        { id: 'f-stream', label: 'Stream',       binding: 'student.streamName',  visible: true, order: 3 },
        { id: 'f-admno',  label: 'Student No.',  binding: 'student.admissionNo', visible: true, order: 4 },
        { id: 'f-term',   label: 'Term',         binding: 'meta.term',           visible: true, order: 5 },
      ],
      style: {
        border: '1px solid #d1fae5', borderRadius: 4, padding: '10px',
        background: '#f0fdf4', labelColor: '#047857',
        valueColor: '#064e3b', valueFontWeight: 'bold', valueFontSize: 13,
      },
    },
    {
      id: 'section-ribbon-1', type: 'ribbon', visible: true, order: 3,
      content: { text: 'Academic Performance', shape: 'flat' },
      style: {
        background: '#d1fae5', color: '#065f46', fontWeight: 'bold',
        fontSize: 12, padding: '6px 0', textAlign: 'center',
      },
    },
    {
      id: 'section-results', type: 'results_table', visible: true, order: 4,
      columns: [
        { id: 'col-subject',  header: 'Subject',  binding: 'result.subjectName',  width: '30%', visible: true, order: 0, align: 'left'   },
        { id: 'col-mid',      header: 'MT',        binding: 'result.midTermScore', width: '8%',  visible: true, order: 1, align: 'center' },
        { id: 'col-eot',      header: 'EOT',       binding: 'result.endTermScore', width: '8%',  visible: true, order: 2, align: 'center' },
        { id: 'col-total',    header: 'Total',     binding: 'result.total',        width: '8%',  visible: true, order: 3, align: 'center' },
        { id: 'col-grade',    header: 'Grade',     binding: 'result.grade',        width: '8%',  visible: true, order: 4, align: 'center', style: { color: '#0d9488', fontWeight: 'bold' } },
        { id: 'col-comment',  header: 'Comment',   binding: 'result.comment',      width: '30%', visible: true, order: 5, align: 'left',   style: { fontStyle: 'italic', color: '#065f46' } },
        { id: 'col-initials', header: 'Initials',  binding: 'result.initials',     width: '8%',  visible: true, order: 6, align: 'center' },
      ],
      style: {
        headerBackground: '#d1fae5', headerBorder: '1px solid #6ee7b7',
        rowBorder: '1px solid #d1fae5', headerFontSize: 11, rowFontSize: 11,
        headerTextTransform: 'uppercase', padding: 5,
      },
    },
    {
      id: 'section-assessment', type: 'assessment', visible: true, order: 5,
      fields: [
        { id: 'a-class-pos',  label: 'Class Position', binding: 'assessment.classPosition', visible: true, order: 0 },
        { id: 'a-aggregates', label: 'Aggregates',      binding: 'assessment.aggregates',    visible: true, order: 1 },
        { id: 'a-division',   label: 'Division',        binding: 'assessment.division',      visible: true, order: 2 },
      ],
      style: {},
    },
    {
      id: 'section-comments', type: 'comments', visible: true, order: 6,
      items: [
        { id: 'c-class', label: 'Class teacher comment:', binding: 'comments.classTeacher', visible: true, order: 0 },
        { id: 'c-head',  label: 'Headteacher comment:',   binding: 'comments.headTeacher',  visible: true, order: 1 },
      ],
      style: {
        ribbonBackground: '#d1fae5', ribbonColor: '#065f46',
        textColor: '#047857', textFontStyle: 'italic',
      },
    },
    {
      id: 'section-grade-table', type: 'grade_table', visible: true, order: 7,
      style: { headerBackground: '#d1fae5', border: '1px solid #6ee7b7' },
    },
  ],
  shapes: [],
};

// ─── 3. Northgate Classic ─────────────────────────────────────────────────────

const NORTHGATE_THEME: DRCETheme = {
  primaryColor:   '#0000FF',
  secondaryColor: '#B22222',
  accentColor:    '#999999',
  fontFamily:     'Arial, sans-serif',
  baseFontSize:   11,
  pagePadding:    '14px 16px',
  pageBackground: '#ffffff',
  pageBorder:     DEFAULT_PAGE_BORDER,
};

export const NORTHGATE_CLASSIC_DOCUMENT: DRCEDocument = {
  $schema: 'drce/v1',
  meta: {
    id:           '3',
    name:         'Northgate Classic',
    school_id:    null,
    version:      1,
    created_at:   '2026-01-01T00:00:00Z',
    updated_at:   '2026-01-01T00:00:00Z',
    report_type:  'end_of_term',
    is_default:   false,
    template_key: 'northgate_classic',
  },
  theme:     NORTHGATE_THEME,
  watermark: DEFAULT_WATERMARK,
  sections: [
    {
      id: 'section-header', type: 'header', visible: true, order: 0,
      style: { layout: 'three-column', paddingBottom: 8, borderBottom: '1px solid #ccc', opacity: 1 },
    },
    {
      id: 'section-banner', type: 'banner', visible: true, order: 1,
      content: { text: '{reportTitle}' },
      style: {
        backgroundColor: '#0000FF', color: '#ffffff', fontSize: 14,
        fontWeight: 'bold', textAlign: 'center', padding: '6px',
        letterSpacing: '0.12em', textTransform: 'uppercase', borderRadius: 0,
      },
    },
    {
      id: 'section-student-info', type: 'student_info', visible: true, order: 2,
      fields: [
        { id: 'f-name',    label: 'NAME',       binding: 'student.fullName',    visible: true, order: 0 },
        { id: 'f-gender',  label: 'SEX',         binding: 'student.gender',      visible: true, order: 1 },
        { id: 'f-class',   label: 'CLASS',       binding: 'student.className',   visible: true, order: 2 },
        { id: 'f-stream',  label: 'STREAM',      binding: 'student.streamName',  visible: true, order: 3 },
        { id: 'f-admno',   label: 'NO.',         binding: 'student.admissionNo', visible: true, order: 4 },
        { id: 'f-term',    label: 'TERM',        binding: 'meta.term',           visible: true, order: 5 },
        { id: 'f-year',    label: 'YEAR',        binding: 'meta.year',           visible: true, order: 6 },
      ],
      style: {
        border: '1px dashed #aaa', borderRadius: 0, padding: '6px',
        background: '#ffffff', labelColor: '#333333',
        valueColor: '#B22222', valueFontWeight: 'bold', valueFontSize: 13,
      },
    },
    {
      id: 'section-ribbon-1', type: 'ribbon', visible: true, order: 3,
      content: { text: 'Principal Subjects Comprising the General Assessment', shape: 'arrow-down' },
      style: {
        background: '#999999', color: '#000000', fontWeight: 'bold',
        fontSize: 12, padding: '4px 0', textAlign: 'center',
      },
    },
    {
      id: 'section-results', type: 'results_table', visible: true, order: 4,
      columns: [
        { id: 'col-subject',  header: 'Subject',  binding: 'result.subjectName',  width: '25%', visible: true, order: 0, align: 'left'   },
        { id: 'col-eot',      header: 'EOT',       binding: 'result.endTermScore', width: '10%', visible: true, order: 1, align: 'center' },
        { id: 'col-total',    header: 'Total',     binding: 'result.total',        width: '10%', visible: true, order: 2, align: 'center' },
        { id: 'col-grade',    header: 'Grade',     binding: 'result.grade',        width: '8%',  visible: true, order: 3, align: 'center', style: { color: '#B22222' } },
        { id: 'col-comment',  header: 'Comment',   binding: 'result.comment',      width: '37%', visible: true, order: 4, align: 'left',   style: { fontStyle: 'italic', color: '#0000FF', fontSize: 11 } as Record<string, string | number> },
        { id: 'col-initials', header: 'Initials',  binding: 'result.initials',     width: '10%', visible: true, order: 5, align: 'center', style: { color: '#0000FF', fontWeight: 'bold' } },
      ],
      style: {
        headerBackground: '#f2f2f2', headerBorder: '1px solid #000',
        rowBorder: '1px solid #000', headerFontSize: 10, rowFontSize: 11,
        headerTextTransform: 'uppercase', padding: 3,
      },
    },
    {
      id: 'section-assessment', type: 'assessment', visible: true, order: 5,
      fields: [
        { id: 'a-class-pos',   label: 'Class Position',  binding: 'assessment.classPosition',  visible: true, order: 0 },
        { id: 'a-stream-pos',  label: 'Stream Position', binding: 'assessment.streamPosition', visible: true, order: 1 },
        { id: 'a-aggregates',  label: 'Aggregates',      binding: 'assessment.aggregates',     visible: true, order: 2 },
        { id: 'a-division',    label: 'Division',        binding: 'assessment.division',       visible: true, order: 3 },
      ],
      style: {},
    },
    {
      id: 'section-comments', type: 'comments', visible: true, order: 6,
      items: [
        { id: 'c-class', label: 'Class teacher comment:', binding: 'comments.classTeacher', visible: true, order: 0 },
        { id: 'c-dos',   label: 'DOS Comment:',           binding: 'comments.dos',          visible: true, order: 1 },
        { id: 'c-head',  label: 'Headteacher comment:',   binding: 'comments.headTeacher',  visible: true, order: 2 },
      ],
      style: {
        ribbonBackground: '#dddddd', ribbonColor: '#000000',
        textColor: '#0000FF', textFontStyle: 'italic',
      },
    },
    {
      id: 'section-grade-table', type: 'grade_table', visible: true, order: 7,
      style: { headerBackground: '#f2f2f2', border: '1px solid #000' },
    },
  ],
  shapes: [],
};

// ─── Exports ──────────────────────────────────────────────────────────────────

export const BUILT_IN_DOCUMENTS: DRCEDocument[] = [
  DRAIS_DEFAULT_DOCUMENT,
  MODERN_CLEAN_DOCUMENT,
  NORTHGATE_CLASSIC_DOCUMENT,
];

/** Find a built-in document by its DB id or template_key */
export function getBuiltInDocument(idOrKey: number | string): DRCEDocument | undefined {
  if (typeof idOrKey === 'number' || /^\d+$/.test(String(idOrKey))) {
    return BUILT_IN_DOCUMENTS.find(d => d.meta.id === String(idOrKey));
  }
  return BUILT_IN_DOCUMENTS.find(d => d.meta.template_key === idOrKey);
}
