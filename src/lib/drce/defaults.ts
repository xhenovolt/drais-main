// ============================================================================
// src/lib/drce/defaults.ts
// Built-in DRCE templates as typed DRCEDocument objects.
// These are the canonical defaults — used as fallback when DB is unavailable
// and as the seed for migration from old report_templates format.
// ============================================================================

import type { DRCEDocument, DRCETheme, DRCEWatermark, DRCEGradeRow } from './schema';

// ─── Shared defaults ─────────────────────────────────────────────────────────

// Standard UCE (Uganda Certificate of Education) grade scale
export const DEFAULT_GRADE_ROWS: DRCEGradeRow[] = [
  { label: 'D1', min: 90,  max: 100, remark: 'Distinction 1' },
  { label: 'D2', min: 80,  max: 89,  remark: 'Distinction 2' },
  { label: 'C3', min: 70,  max: 79,  remark: 'Credit 3' },
  { label: 'C4', min: 60,  max: 69,  remark: 'Credit 4' },
  { label: 'C5', min: 50,  max: 59,  remark: 'Credit 5' },
  { label: 'C6', min: 45,  max: 49,  remark: 'Credit 6' },
  { label: 'P7', min: 40,  max: 44,  remark: 'Pass 7' },
  { label: 'P8', min: 35,  max: 39,  remark: 'Pass 8' },
  { label: 'F9', min: 0,   max: 34,  remark: 'Fail 9' },
];

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
  pageSize:       'a4',
  orientation:    'portrait',
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
      style: { layout: 'three-column', paddingBottom: 10, borderBottom: '1px solid #eee', opacity: 1, logoWidth: 64, logoHeight: 64 },
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
        { id: 'col-initials', header: 'Initials',  binding: 'result.initials',      width: '8%',  visible: true, order: 6, align: 'center', contentEditable: true, style: { color: '#0000FF', fontWeight: 'bold' } },
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
      aggregateConfig: {
        mode: 'grade_points',
        gradePointMap: { D1: 1, D2: 2, C3: 3, C4: 4, C5: 5, C6: 6, P7: 7, P8: 8, F9: 9 },
        divisionThresholds: [
          { maxValue: 12, label: 'Division I' },
          { maxValue: 23, label: 'Division II' },
          { maxValue: 29, label: 'Division III' },
          { maxValue: 34, label: 'Division IV' },
        ],
        divisionFallback: 'Division U',
      },
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
      grades: DEFAULT_GRADE_ROWS,
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
  pageSize:       'a4',
  orientation:    'portrait',
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
      style: { layout: 'three-column', paddingBottom: 12, borderBottom: '2px solid #0d9488', opacity: 1, logoWidth: 64, logoHeight: 64 },
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
        { id: 'col-initials', header: 'Initials',  binding: 'result.initials',     width: '8%',  visible: true, order: 6, align: 'center', contentEditable: true },
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
      aggregateConfig: {
        mode: 'grade_points',
        gradePointMap: { D1: 1, D2: 2, C3: 3, C4: 4, C5: 5, C6: 6, P7: 7, P8: 8, F9: 9 },
        divisionThresholds: [
          { maxValue: 12, label: 'Division I' },
          { maxValue: 23, label: 'Division II' },
          { maxValue: 29, label: 'Division III' },
          { maxValue: 34, label: 'Division IV' },
        ],
        divisionFallback: 'Division U',
      },
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
      grades: DEFAULT_GRADE_ROWS,
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
  pageSize:       'a4',
  orientation:    'portrait',
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
      style: { layout: 'three-column', paddingBottom: 8, borderBottom: '1px solid #ccc', opacity: 1, logoWidth: 64, logoHeight: 64 },
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
        { id: 'col-initials', header: 'Initials',  binding: 'result.initials',     width: '10%', visible: true, order: 5, align: 'center', contentEditable: true, style: { color: '#0000FF', fontWeight: 'bold' } },
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
      aggregateConfig: {
        mode: 'grade_points',
        gradePointMap: { D1: 1, D2: 2, C3: 3, C4: 4, C5: 5, C6: 6, P7: 7, P8: 8, F9: 9 },
        divisionThresholds: [
          { maxValue: 12, label: 'Division I' },
          { maxValue: 23, label: 'Division II' },
          { maxValue: 29, label: 'Division III' },
          { maxValue: 34, label: 'Division IV' },
        ],
        divisionFallback: 'Division U',
      },
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
      grades: DEFAULT_GRADE_ROWS,
    },
  ],
  shapes: [],
};

// ─── 4. Northgate Official (exact rpt.html replica, school_id = 6 only) ──────

// Northgate-specific grade scale (differs from DEFAULT at C5–F9 boundaries)
const NORTHGATE_OFFICIAL_GRADE_ROWS: DRCEGradeRow[] = [
  { label: 'D1', min: 90, max: 100, remark: 'Distinction 1' },
  { label: 'D2', min: 80, max: 89,  remark: 'Distinction 2' },
  { label: 'C3', min: 70, max: 79,  remark: 'Credit 3' },
  { label: 'C4', min: 60, max: 69,  remark: 'Credit 4' },
  { label: 'C5', min: 55, max: 59,  remark: 'Credit 5' },
  { label: 'C6', min: 50, max: 54,  remark: 'Credit 6' },
  { label: 'P7', min: 45, max: 49,  remark: 'Pass 7' },
  { label: 'P8', min: 40, max: 44,  remark: 'Pass 8' },
  { label: 'F9', min: 0,  max: 39,  remark: 'Fail 9' },
];

// Shared column set (Subject, EOT, Total, Grade, Comment, Initials — no MT)
const NORTHGATE_OFFICIAL_COLUMNS = [
  { id: 'col-subject',  header: 'Subject',  binding: 'result.subjectName',  width: '25%', visible: true, order: 0, align: 'left'   as const },
  { id: 'col-eot',      header: 'EOT',      binding: 'result.endTermScore', width: '10%', visible: true, order: 1, align: 'center' as const },
  { id: 'col-total',    header: 'Total',    binding: 'result.total',        width: '10%', visible: true, order: 2, align: 'center' as const },
  { id: 'col-grade',    header: 'Grade',    binding: 'result.grade',        width: '8%',  visible: true, order: 3, align: 'center' as const, style: { color: '#B22222' } },
  { id: 'col-comment',  header: 'Comment',  binding: 'result.comment',      width: '37%', visible: true, order: 4, align: 'left'   as const, style: { fontStyle: 'italic', color: '#0000FF', fontSize: 11 } as Record<string, string | number> },
  { id: 'col-initials', header: 'Initials', binding: 'result.initials',     width: '10%', visible: true, order: 5, align: 'center' as const, contentEditable: true, style: { color: '#0000FF', fontWeight: 'bold' } },
];

const NORTHGATE_OFFICIAL_TABLE_STYLE = {
  headerBackground: '#f2f2f2', headerBorder: '1px solid #333',
  rowBorder: '1px solid #333', headerFontSize: 11, rowFontSize: 11,
  headerTextTransform: 'uppercase' as const, padding: 4,
};

/**
 * Northgate Official — exact structural replica of rpt.html.
 * school_id = 6: visible only to Northgate users.
 * Seed into dvcf_documents via scripts/seed-northgate-official-template.mjs.
 */
export const NORTHGATE_OFFICIAL_DOCUMENT: DRCEDocument = {
  $schema: 'drce/v1',
  meta: {
    id:           '0',                    // overwritten by DB on insert
    name:         'Northgate Official',
    school_id:    6,                      // Northgate School only
    version:      1,
    created_at:   '2026-04-20T00:00:00Z',
    updated_at:   '2026-04-20T00:00:00Z',
    report_type:  'mid_term',
    is_default:   false,
    template_key: 'northgate_official',
  },
  theme: {
    primaryColor:   '#0000FF',
    secondaryColor: '#B22222',
    accentColor:    '#999999',
    fontFamily:     'Arial, sans-serif',
    baseFontSize:   12,
    pagePadding:    '10px 10px',
    pageBackground: '#ffffff',
    pageBorder:     { enabled: true, color: '#cccccc', width: 1, style: 'solid', radius: 0 },
    pageSize:       'a4',
    orientation:    'portrait',
  },
  watermark: {
    enabled: false, type: 'text', content: 'CONFIDENTIAL', imageUrl: null,
    opacity: 0.08, position: 'center', rotation: -30, fontSize: 72,
    color: '#000000', scope: 'page',
  },
  sections: [
    // 1 ── School header (name, address, logo)
    {
      id: 'ng-header', type: 'header', visible: true, order: 0,
      style: {
        layout: 'left-logo', paddingBottom: 5,
        borderBottom: 'none', opacity: 1,
        logoWidth: 80, logoHeight: 80,
      },
    },
    // 2 ── Blue report-title banner
    {
      id: 'ng-banner', type: 'banner', visible: true, order: 1,
      content: { text: '{meta.reportTitle}' },
      style: {
        backgroundColor: '#0000FF', color: '#ffffff', fontSize: 14,
        fontWeight: 'bold', textAlign: 'center', padding: '5px',
        letterSpacing: '0.12em', textTransform: 'uppercase', borderRadius: 0,
      },
    },
    // 3 ── Student information block
    {
      id: 'ng-student-info', type: 'student_info', visible: true, order: 2,
      fields: [
        { id: 'f-name',     label: 'Name',       binding: 'student.fullName',    visible: true, order: 0 },
        { id: 'f-gender',   label: 'Gender',      binding: 'student.gender',      visible: true, order: 1 },
        { id: 'f-class',    label: 'Class',       binding: 'student.className',   visible: true, order: 2 },
        { id: 'f-stream',   label: 'Stream',      binding: 'student.streamName',  visible: true, order: 3 },
        { id: 'f-position', label: 'Position',    binding: 'assessment.position', visible: true, order: 4 },
        { id: 'f-admno',    label: 'Student No.', binding: 'student.admissionNo', visible: true, order: 5 },
        { id: 'f-term',     label: 'Term',        binding: 'meta.term',           visible: true, order: 6 },
      ],
      style: {
        border: 'none', borderRadius: 0, padding: '4px 8px',
        background: '#ffffff', labelColor: '#555555',
        valueColor: '#B22222', valueFontWeight: 'bold', valueFontSize: 14,
        showBarcode: true, showPhoto: true, fieldsPerRow: 4,
      },
    },
    // 4 ── Ribbon: Principal Subjects
    {
      id: 'ng-ribbon-principal', type: 'ribbon', visible: true, order: 3,
      content: { text: 'Principal Subjects Comprising the General Assessment', shape: 'arrow-down' },
      style: {
        background: '#999999', color: '#000000', fontWeight: 'bold',
        fontSize: 12, padding: '4px 0', textAlign: 'center',
      },
    },
    // 5 ── Principal results table (EOT only)
    {
      id: 'ng-results-principal', type: 'results_table', visible: true, order: 4,
      subjectFilter: 'primary',
      columns: NORTHGATE_OFFICIAL_COLUMNS.map(c => ({ ...c, id: `p-${c.id}` })),
      style: NORTHGATE_OFFICIAL_TABLE_STYLE,
    },
    // 6 ── Ribbon: Other Subjects
    {
      id: 'ng-ribbon-other', type: 'ribbon', visible: true, order: 5,
      content: { text: 'Other subjects (Not part of Assessment)', shape: 'arrow-down' },
      style: {
        background: '#999999', color: '#000000', fontWeight: 'bold',
        fontSize: 12, padding: '4px 0', textAlign: 'center',
      },
    },
    // 7 ── Other subjects results table
    {
      id: 'ng-results-other', type: 'results_table', visible: true, order: 6,
      subjectFilter: 'secondary',
      columns: NORTHGATE_OFFICIAL_COLUMNS.map(c => ({ ...c, id: `o-${c.id}` })),
      style: NORTHGATE_OFFICIAL_TABLE_STYLE,
    },
    // 8 ── Position & Assessment block
    {
      id: 'ng-assessment', type: 'assessment', visible: true, order: 7,
      fields: [
        { id: 'a-class-pos',  label: 'Class',      binding: 'assessment.classPosition',  visible: true, order: 0 },
        { id: 'a-stream-pos', label: 'Stream',     binding: 'assessment.streamPosition', visible: true, order: 1 },
        { id: 'a-aggregates', label: 'Aggregates', binding: 'assessment.aggregates',     visible: true, order: 2 },
        { id: 'a-division',   label: 'Division',   binding: 'assessment.division',       visible: true, order: 3 },
      ],
      style: { layout: 'table', positionFields: 2, assessmentLabel: 'Grade Assessment', headerBackground: '#f2f2f2', valueColor: '#B22222' },
      aggregateConfig: {
        mode: 'grade_points',
        gradePointMap: { D1: 1, D2: 2, C3: 3, C4: 4, C5: 5, C6: 6, P7: 7, P8: 8, F9: 9 },
        divisionThresholds: [
          { maxValue: 12, label: 'Division I' },
          { maxValue: 23, label: 'Division II' },
          { maxValue: 29, label: 'Division III' },
          { maxValue: 34, label: 'Division IV' },
        ],
        divisionFallback: 'Division U',
      },
    },
    // 9 ── Comments (arrow-chevron labels, blue italic text)
    {
      id: 'ng-comments', type: 'comments', visible: true, order: 8,
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
    // 10 ── Grade scale (Northgate-specific boundaries)
    {
      id: 'ng-grade-table', type: 'grade_table', visible: true, order: 9,
      style: { headerBackground: '#f2f2f2', border: '1px solid #000' },
      grades: NORTHGATE_OFFICIAL_GRADE_ROWS,
    },
  ],
  shapes: [],
};

// ─── Clone Variants ────────────────────────────────────────────────────────────

/**
 * Default Clone — same as DRAIS_DEFAULT but with an outer page border and slight spacing adjustments.
 * Serves as the "second default" option in DRCE.
 */
export const DEFAULT_CLONE_DOCUMENT: DRCEDocument = {
  $schema: 'drce/v1',
  meta: {
    id:           '8',
    name:         'Default Clone',
    school_id:    null,
    version:      1,
    created_at:   '2026-01-01T00:00:00Z',
    updated_at:   '2026-01-01T00:00:00Z',
    report_type:  'end_of_term',
    is_default:   false,
    template_key: 'default-clone',
  },
  theme: {
    ...DRAIS_THEME,
    pageBorder: { enabled: true, color: '#cccccc', width: 1, style: 'solid' as const, radius: 0 },
    pagePadding: '18px 20px',
  },
  watermark: DEFAULT_WATERMARK,
  sections: DRAIS_DEFAULT_DOCUMENT.sections.map(section => {
    if (section.type === 'header') {
      return {
        ...section,
        style: {
          ...section.style,
          paddingBottom: 12,
          borderBottom: '2px solid #0000FF',
          gap: 14,
          showLogo: true,
          showName: true,
          showArabicName: true,
          showAddress: true,
          showContact: true,
          showCentreNo: true,
          showRegistrationNo: true,
        },
      };
    }
    return { ...section };
  }),
  shapes: [],
};

/**
 * Arabic Clone — RTL variant with distinct styling (gold/green theme, Arabic labels).
 * Serves as the Arabic "second default" option in DRCE.
 */
export const ARABIC_CLONE_DOCUMENT: DRCEDocument = {
  $schema: 'drce/v1',
  meta: {
    id:           '9',
    name:         'Arabic Clone',
    school_id:    null,
    version:      1,
    created_at:   '2026-01-01T00:00:00Z',
    updated_at:   '2026-01-01T00:00:00Z',
    report_type:  'end_of_term',
    is_default:   false,
    template_key: 'arabic-clone',
  },
  theme: {
    primaryColor:   '#006633',
    secondaryColor: '#B22222',
    accentColor:    '#D4AF37',
    fontFamily:     'Traditional Arabic, Arial, sans-serif',
    baseFontSize:   12,
    pagePadding:    '16px 18px',
    pageBackground: '#ffffff',
    pageBorder: { enabled: false, color: '#cccccc', width: 1, style: 'solid' as const, radius: 0 },
    pageSize: 'a4',
    orientation: 'portrait',
  },
  watermark: { ...DEFAULT_WATERMARK, content: 'مجهول' },
  sections: [
    {
      id: 'section-header', type: 'header', visible: true, order: 0,
      style: {
        layout: 'three-column',
        paddingBottom: 12,
        borderBottom: '2px solid #006633',
        opacity: 1,
        logoWidth: 70,
        logoHeight: 70,
        gap: 16,
      },
    },
    {
      id: 'section-banner', type: 'banner', visible: true, order: 1,
      content: { text: '{reportTitle}' },
      style: {
        backgroundColor: '#006633',
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'right',
        padding: '10px',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        borderRadius: 4,
      },
    },
    {
      id: 'section-student-info', type: 'student_info', visible: true, order: 2,
      fields: [
        { id: 'f-name',   label: 'الاسم',        binding: 'student.fullName',    visible: true, order: 0 },
        { id: 'f-gender', label: 'الجنس',         binding: 'student.gender',      visible: true, order: 1 },
        { id: 'f-class',  label: 'الصف',         binding: 'student.className',   visible: true, order: 2 },
        { id: 'f-stream', label: 'المجموعة',      binding: 'student.streamName',  visible: true, order: 3 },
        { id: 'f-admno',  label: 'رقم القيد',     binding: 'student.admissionNo', visible: true, order: 4 },
        { id: 'f-term',   label: 'الفصل',         binding: 'meta.term',           visible: true, order: 5 },
      ],
      style: {
        border: '2px solid #006633',
        borderRadius: 8,
        padding: '12px',
        background: '#f8fbf8',
        labelColor: '#006633',
        valueColor: '#B22222',
        valueFontWeight: 'bold',
        valueFontSize: 14,
        showBarcode: true,
        showPhoto: true,
        fieldsPerRow: 3,
      },
    },
    {
      id: 'section-ribbon-1', type: 'ribbon', visible: true, order: 3,
      content: { text: 'النتائج الأكاديمية', shape: 'arrow-down' },
      style: {
        background: '#D4AF37',
        color: '#006633',
        fontWeight: 'bold',
        fontSize: 12,
        padding: '6px 0',
        textAlign: 'center',
      },
    },
    {
      id: 'section-results', type: 'results_table', visible: true, order: 4,
      columns: [
        { id: 'col-subject',  header: 'المادة',  binding: 'result.subjectName',  width: '25%', visible: true, order: 0, align: 'right' as const },
        { id: 'col-mid',      header: '中期',     binding: 'result.midTermScore', width: '10%', visible: true, order: 1, align: 'center' as const },
        { id: 'col-eot',      header: 'نهائي',    binding: 'result.endTermScore', width: '10%', visible: true, order: 2, align: 'center' as const },
        { id: 'col-total',    header: 'المجموع',  binding: 'result.total',        width: '10%', visible: true, order: 3, align: 'center' as const },
        { id: 'col-grade',    header: 'الدرجة',    binding: 'result.grade',        width: '8%',  visible: true, order: 4, align: 'center' as const, style: { color: '#B22222', fontWeight: 'bold' } },
        { id: 'col-comment',  header: 'التعليق',  binding: 'result.comment',      width: '27%', visible: true, order: 5, align: 'right' as const, style: { fontStyle: 'italic', color: '#006633' } },
        { id: 'col-initials', header: 'الرمز',    binding: 'result.initials',     width: '10%', visible: true, order: 6, align: 'center' as const, contentEditable: true },
      ],
      style: {
        headerBackground: '#f0f8f0',
        headerBorder: '2px solid #006633',
        rowBorder: '1px solid #c8e6c9',
        headerFontSize: 11,
        rowFontSize: 11,
        headerTextTransform: 'none' as const,
        padding: 5,
      },
    },
    {
      id: 'section-assessment', type: 'assessment', visible: true, order: 5,
      fields: [
        { id: 'a-class-pos',  label: 'الترتيب في الصف',  binding: 'assessment.classPosition',  visible: true, order: 0 },
        { id: 'a-aggregates', label: 'المجاميع',         binding: 'assessment.aggregates',     visible: true, order: 1 },
        { id: 'a-division',   label: 'التقدير',         binding: 'assessment.division',       visible: true, order: 2 },
      ],
      style: {},
      aggregateConfig: {
        mode: 'grade_points',
        gradePointMap: { D1: 1, D2: 2, C3: 3, C4: 4, C5: 5, C6: 6, P7: 7, P8: 8, F9: 9 },
        divisionThresholds: [
          { maxValue: 12, label: 'Division I' },
          { maxValue: 23, label: 'Division II' },
          { maxValue: 29, label: 'Division III' },
          { maxValue: 34, label: 'Division IV' },
        ],
        divisionFallback: 'Division U',
      },
    },
    {
      id: 'section-comments', type: 'comments', visible: true, order: 6,
      items: [
        { id: 'c-class', label: 'تعليق المعلم:',     binding: 'comments.classTeacher', visible: true, order: 0 },
        { id: 'c-dos',   label: 'تعليق المشرف:',     binding: 'comments.dos',          visible: true, order: 1 },
        { id: 'c-head',  label: 'تعليق المدير:',      binding: 'comments.headTeacher',  visible: true, order: 2 },
      ],
      style: {
        ribbonBackground: '#D4AF37',
        ribbonColor: '#006633',
        textColor: '#006633',
        textFontStyle: 'italic' as const,
      },
    },
    {
      id: 'section-grade-table', type: 'grade_table', visible: true, order: 7,
      style: { headerBackground: '#f0f8f0', border: '2px solid #006633' },
      grades: DEFAULT_GRADE_ROWS,
    },
  ],
  shapes: [],
};

// ─── Exports ──────────────────────────────────────────────────────────────────

export const BUILT_IN_DOCUMENTS: DRCEDocument[] = [
  DRAIS_DEFAULT_DOCUMENT,
  MODERN_CLEAN_DOCUMENT,
  NORTHGATE_CLASSIC_DOCUMENT,
  DEFAULT_CLONE_DOCUMENT,
  ARABIC_CLONE_DOCUMENT,
  // NORTHGATE_OFFICIAL_DOCUMENT is NOT in built-ins — it is school_id-scoped
  // and seeded via scripts/seed-northgate-official-template.mjs
];

/** Find a built-in document by its DB id or template_key */
export function getBuiltInDocument(idOrKey: number | string): DRCEDocument | undefined {
  if (typeof idOrKey === 'number' || /^\d+$/.test(String(idOrKey))) {
    return BUILT_IN_DOCUMENTS.find(d => d.meta.id === String(idOrKey));
  }
  return BUILT_IN_DOCUMENTS.find(d => d.meta.template_key === idOrKey);
}
