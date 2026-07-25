/**
 * src/app/api/dvcf/migrate-templates/route.ts
 *
 * Migrates all hardcoded report templates to DRCE format.
 * POST to seed templates into dvcf_documents table.
 *
 * Usage: POST /api/dvcf/migrate-templates?seed=true
 */

import { getConnection } from '@/lib/db';
import type { DRCEDocument } from '@/lib/drce/schema';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';

// ─── Template Definitions ───────────────────────────────────────────────────

const DEFAULT_GRADE_ROWS = [
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

const DEFAULT_WATERMARK = {
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

// Templates
const MODERN_TEMPLATE_DRCE: DRCEDocument = {
  $schema: 'drce/v1',
  meta: {
    id: 'modern',
    name: 'Modern (Default)',
    school_id: null,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    report_type: 'end_of_term',
    is_default: true,
    template_key: 'modern_default',
  },
  theme: {
    primaryColor:   '#228b22',
    secondaryColor: '#d61515',
    accentColor:    '#1a4be7',
    fontFamily:     'Segoe UI, sans-serif',
    baseFontSize:   14,
    pagePadding:    '16px 18px',
    pageBackground: '#ffffff',
    pageBorder:     DEFAULT_PAGE_BORDER,
    pageSize:       'a4',
    orientation:    'portrait',
  },
  watermark: DEFAULT_WATERMARK,
  sections: [
    {
      id: 'section-header',
      type: 'header',
      visible: true,
      order: 0,
      style: {
        layout: 'three-column',
        paddingBottom: 10,
        borderBottom: 'none',
        opacity: 0.8,
        logoWidth: 64,
        logoHeight: 64,
      },
    },
    {
      id: 'section-banner',
      type: 'banner',
      visible: true,
      order: 1,
      content: { text: '{reportTitle}' },
      style: {
        backgroundColor: 'rgb(34, 139, 34)',
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center',
        padding: '8px',
        marginTop: 8,
        marginBottom: 4,
        borderRadius: 0,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      },
    },
    {
      id: 'section-student-info',
      type: 'student_info',
      visible: true,
      order: 2,
      fields: [
        { id: 'f-name',   label: 'Name',        binding: 'student.fullName',    visible: true, order: 0 },
        { id: 'f-gender', label: 'Sex',         binding: 'student.gender',      visible: true, order: 1 },
        { id: 'f-class',  label: 'Class',       binding: 'student.className',   visible: true, order: 2 },
        { id: 'f-stream', label: 'Stream',      binding: 'student.streamName',  visible: true, order: 3 },
        { id: 'f-admno',  label: 'Student No.', binding: 'student.admissionNo', visible: true, order: 4 },
        { id: 'f-term',   label: 'Term',        binding: 'meta.term',           visible: true, order: 5 },
      ],
      style: {
        border: '2px solid #1a4be7',
        borderRadius: 10,
        padding: '18px 16px',
        background: '#f8faff',
        boxShadow: '0 1px 6px #e6f0fa',
        margin: '18px 0',
      },
    },
    {
      id: 'section-ribbon-1',
      type: 'ribbon',
      visible: true,
      order: 3,
      content: { text: 'Marks attained in each subject', shape: 'flat' },
      style: {
        background: 'linear-gradient(to right, #d3d3d3, #a9a9a9)',
        color: '#000000',
        fontWeight: 'bold',
        fontSize: 14,
        padding: '4px',
        marginSidesPercent: '15%',
        borderRadius: 0,
        textAlign: 'center',
        boxShadow: 'none',
      },
    },
    {
      id: 'section-results',
      type: 'results_table',
      visible: true,
      order: 4,
      columns: [
        { id: 'col-subject',  header: 'SUBJECT',  binding: 'result.subjectName',  width: '25%', visible: true, order: 0, align: 'left' },
        { id: 'col-mid',      header: 'MT',       binding: 'result.midTermScore', width: '10%', visible: true, order: 1, align: 'center' },
        { id: 'col-eot',      header: 'EOT',      binding: 'result.endTermScore', width: '10%', visible: true, order: 2, align: 'center' },
        { id: 'col-total',    header: 'TOTAL',    binding: 'result.total',        width: '10%', visible: true, order: 3, align: 'center' },
        { id: 'col-grade',    header: 'GRADE',    binding: 'result.grade',        width: '8%',  visible: true, order: 4, align: 'center' },
        { id: 'col-comment',  header: 'COMMENT',  binding: 'result.comment',      width: '25%', visible: true, order: 5, align: 'left' },
        { id: 'col-initials', header: 'INITIALS', binding: 'result.initials',     width: '12%', visible: true, order: 6, align: 'center', contentEditable: true },
      ],
      style: {
        headerBackground: '#f0f8ff',
        headerBorder: '1px solid #000000',
        rowBorder: '1px solid #000000',
        padding: 6,
        headerFontSize: 12,
        rowFontSize: 14,
      },
    },
    {
      id: 'section-assessment',
      type: 'assessment',
      visible: true,
      order: 5,
      fields: [
        { id: 'a-class-pos',  label: 'Class Position', binding: 'assessment.classPosition', visible: true, order: 0 },
        { id: 'a-aggregates', label: 'Aggregates',      binding: 'assessment.aggregates',    visible: true, order: 1 },
        { id: 'a-division',   label: 'Division',        binding: 'assessment.division',      visible: true, order: 2 },
      ],
      style: {
        border: '1px solid #000000',
        borderRadius: 8,
        padding: '10px 20px',
      },
    },
    {
      id: 'section-comments',
      type: 'comments',
      visible: true,
      order: 6,
      items: [
        { id: 'c-class', label: 'Class teacher comment:', binding: 'comments.classTeacher', visible: true, order: 0 },
        { id: 'c-head',  label: 'Headteacher comment:',   binding: 'comments.headTeacher',  visible: true, order: 1 },
      ],
      style: {
        borderTop: '2px dashed #999999',
        paddingTop: 15,
        marginTop: 30,
        ribbonBackground: 'rgb(145, 140, 140)',
        ribbonColor: '#000000',
        textColor: '#1a4be7',
        textFontStyle: 'italic',
      },
    },
    {
      id: 'section-grade-table',
      type: 'grade_table',
      visible: true,
      order: 7,
      style: {
        headerBackground: '#f0f0f0',
        border: '1px solid #04081a',
        headerFontSize: 11,
        rowFontSize: 11,
      },
      grades: DEFAULT_GRADE_ROWS,
    },
  ],
  shapes: [],
};

const ARABIC_TEMPLATE_DRCE: DRCEDocument = {
  ...structuredClone(MODERN_TEMPLATE_DRCE),
  meta: {
    ...MODERN_TEMPLATE_DRCE.meta,
    id: 'arabic',
    name: 'Arabic Template',
    template_key: 'arabic_template',
  },
  theme: {
    ...MODERN_TEMPLATE_DRCE.theme,
    primaryColor: '#0000FF',
    secondaryColor: '#B22222',
  },
};

const MODERN_CLEAN_DRCE: DRCEDocument = {
  $schema: 'drce/v1',
  meta: {
    id: 'modern-clean',
    name: 'Modern Clean',
    school_id: null,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    report_type: 'end_of_term',
    is_default: false,
    template_key: 'modern_clean_template',
  },
  theme: {
    primaryColor:   '#0f6b55',
    secondaryColor: '#15803d',
    accentColor:    '#16a34a',
    fontFamily:     'Arial, Helvetica, sans-serif',
    baseFontSize:   13,
    pagePadding:    '20px 24px',
    pageBackground: '#f8fffc',
    pageBorder:     DEFAULT_PAGE_BORDER,
    pageSize:       'a4',
    orientation:    'portrait',
  },
  watermark: DEFAULT_WATERMARK,
  sections: [
    {
      id: 'section-header',
      type: 'header',
      visible: true,
      order: 0,
      style: {
        layout: 'centered',
        paddingBottom: 14,
        borderBottom: '3px solid #16a34a',
        opacity: 1,
        logoWidth: 68,
        logoHeight: 68,
      },
    },
    {
      id: 'section-banner',
      type: 'banner',
      visible: true,
      order: 1,
      content: { text: '{reportTitle}' },
      style: {
        backgroundColor: '#0f6b55',
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 'bold',
        textAlign: 'left',
        padding: '6px 16px',
        marginTop: 12,
        marginBottom: 6,
        borderRadius: 4,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      },
    },
    {
      id: 'section-student-info',
      type: 'student_info',
      visible: true,
      order: 2,
      fields: [
        { id: 'f-name',   label: 'Name',        binding: 'student.fullName',    visible: true, order: 0 },
        { id: 'f-gender', label: 'Sex',         binding: 'student.gender',      visible: true, order: 1 },
        { id: 'f-class',  label: 'Class',       binding: 'student.className',   visible: true, order: 2 },
        { id: 'f-stream', label: 'Stream',      binding: 'student.streamName',  visible: true, order: 3 },
        { id: 'f-admno',  label: 'Student No.', binding: 'student.admissionNo', visible: true, order: 4 },
        { id: 'f-term',   label: 'Term',        binding: 'meta.term',           visible: true, order: 5 },
      ],
      style: {
        border: '2px solid #16a34a',
        borderRadius: 4,
        padding: '14px 20px',
        background: '#f0fdf4',
        boxShadow: 'none',
        margin: '14px 0',
      },
    },
    {
      id: 'section-ribbon-1',
      type: 'ribbon',
      visible: true,
      order: 3,
      content: { text: 'Academic Performance', shape: 'flat' },
      style: {
        background: '#dcfce7',
        color: '#14532d',
        fontWeight: 'bold',
        fontSize: 12,
        padding: '6px 12px',
        marginSidesPercent: '5%',
        borderRadius: 4,
        textAlign: 'left',
        boxShadow: 'none',
      },
    },
    {
      id: 'section-results',
      type: 'results_table',
      visible: true,
      order: 4,
      columns: [
        { id: 'col-subject',  header: 'Subject',  binding: 'result.subjectName',  width: '30%', visible: true, order: 0, align: 'left' },
        { id: 'col-mid',      header: 'MT',       binding: 'result.midTermScore', width: '8%',  visible: true, order: 1, align: 'center' },
        { id: 'col-eot',      header: 'EOT',      binding: 'result.endTermScore', width: '8%',  visible: true, order: 2, align: 'center' },
        { id: 'col-total',    header: 'Total',    binding: 'result.total',        width: '8%',  visible: true, order: 3, align: 'center' },
        { id: 'col-grade',    header: 'Grade',    binding: 'result.grade',        width: '8%',  visible: true, order: 4, align: 'center', style: { color: '#0d9488', fontWeight: 'bold' } },
        { id: 'col-comment',  header: 'Comment',  binding: 'result.comment',      width: '30%', visible: true, order: 5, align: 'left', style: { fontStyle: 'italic', color: '#065f46' } },
        { id: 'col-initials', header: 'Initials', binding: 'result.initials',     width: '8%',  visible: true, order: 6, align: 'center', contentEditable: true },
      ],
      style: {
        headerBackground: '#dcfce7',
        headerBorder: '1px solid #6ee7b7',
        rowBorder: '1px solid #d1fae5',
        padding: 5,
        headerFontSize: 11,
        rowFontSize: 13,
      },
    },
    {
      id: 'section-assessment',
      type: 'assessment',
      visible: true,
      order: 5,
      fields: [
        { id: 'a-class-pos',  label: 'Class Position', binding: 'assessment.classPosition', visible: true, order: 0 },
        { id: 'a-aggregates', label: 'Aggregates',      binding: 'assessment.aggregates',    visible: true, order: 1 },
        { id: 'a-division',   label: 'Division',        binding: 'assessment.division',      visible: true, order: 2 },
      ],
      style: {
        border: '1px solid #16a34a',
        borderRadius: 4,
        padding: '8px 16px',
      },
    },
    {
      id: 'section-comments',
      type: 'comments',
      visible: true,
      order: 6,
      items: [
        { id: 'c-class', label: 'Class teacher comment:', binding: 'comments.classTeacher', visible: true, order: 0 },
        { id: 'c-head',  label: 'Headteacher comment:',   binding: 'comments.headTeacher',  visible: true, order: 1 },
      ],
      style: {
        borderTop: '2px solid #16a34a',
        paddingTop: 12,
        marginTop: 24,
        ribbonBackground: '#0f766e',
        ribbonColor: '#ffffff',
        textColor: '#1e3a5f',
        textFontStyle: 'italic',
      },
    },
    {
      id: 'section-grade-table',
      type: 'grade_table',
      visible: true,
      order: 7,
      style: {
        headerBackground: '#dcfce7',
        border: '1px solid #6ee7b7',
        headerFontSize: 11,
        rowFontSize: 11,
      },
      grades: DEFAULT_GRADE_ROWS,
    },
  ],
  shapes: [],
};

const NORTHGATE_CLASSIC_DRCE: DRCEDocument = {
  $schema: 'drce/v1',
  meta: {
    id: 'northgate',
    name: 'Northgate Classic',
    school_id: null,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    report_type: 'end_of_term',
    is_default: false,
    template_key: 'northgate_classic_template',
  },
  theme: {
    primaryColor:   '#1e40af',
    secondaryColor: '#dc2626',
    accentColor:    '#0369a1',
    fontFamily:     'Times New Roman, serif',
    baseFontSize:   12,
    pagePadding:    '18px 20px',
    pageBackground: '#ffffff',
    pageBorder:     DEFAULT_PAGE_BORDER,
    pageSize:       'a4',
    orientation:    'portrait',
  },
  watermark: DEFAULT_WATERMARK,
  sections: [
    {
      id: 'section-header',
      type: 'header',
      visible: true,
      order: 0,
      style: {
        layout: 'three-column',
        paddingBottom: 12,
        borderBottom: '2px solid #1e40af',
        opacity: 0.9,
        logoWidth: 60,
        logoHeight: 60,
      },
    },
    {
      id: 'section-banner',
      type: 'banner',
      visible: true,
      order: 1,
      content: { text: '{reportTitle}' },
      style: {
        backgroundColor: '#1e40af',
        color: '#ffffff',
        fontSize: 15,
        fontWeight: 'bold',
        textAlign: 'center',
        padding: '8px 16px',
        marginTop: 10,
        marginBottom: 8,
        borderRadius: 0,
        letterSpacing: '0.05em',
      },
    },
    {
      id: 'section-student-info',
      type: 'student_info',
      visible: true,
      order: 2,
      fields: [
        { id: 'f-name',   label: 'Name',        binding: 'student.fullName',    visible: true, order: 0 },
        { id: 'f-gender', label: 'Sex',         binding: 'student.gender',      visible: true, order: 1 },
        { id: 'f-class',  label: 'Class',       binding: 'student.className',   visible: true, order: 2 },
        { id: 'f-admno',  label: 'Admission',   binding: 'student.admissionNo', visible: true, order: 3 },
        { id: 'f-term',   label: 'Term',        binding: 'meta.term',           visible: true, order: 4 },
      ],
      style: {
        border: '1px solid #999999',
        borderRadius: 0,
        padding: '10px 14px',
        background: '#f5f5f5',
        boxShadow: 'none',
        margin: '10px 0',
      },
    },
    {
      id: 'section-results',
      type: 'results_table',
      visible: true,
      order: 3,
      columns: [
        { id: 'col-subject',  header: 'Subject',  binding: 'result.subjectName',  width: '28%', visible: true, order: 0, align: 'left' },
        { id: 'col-mid',      header: 'MT',       binding: 'result.midTermScore', width: '10%', visible: true, order: 1, align: 'center' },
        { id: 'col-eot',      header: 'EOT',      binding: 'result.endTermScore', width: '10%', visible: true, order: 2, align: 'center' },
        { id: 'col-total',    header: 'Total',    binding: 'result.total',        width: '10%', visible: true, order: 3, align: 'center' },
        { id: 'col-grade',    header: 'Grade',    binding: 'result.grade',        width: '8%',  visible: true, order: 4, align: 'center' },
        { id: 'col-comment',  header: 'Comment',  binding: 'result.comment',      width: '26%', visible: true, order: 5, align: 'left' },
        { id: 'col-initials', header: 'Init',     binding: 'result.initials',     width: '8%',  visible: true, order: 6, align: 'center', contentEditable: true },
      ],
      style: {
        headerBackground: '#e5e5e5',
        headerBorder: '1px solid #999999',
        rowBorder: '1px solid #cccccc',
        padding: 4,
        headerFontSize: 10,
        rowFontSize: 11,
      },
    },
    {
      id: 'section-assessment',
      type: 'assessment',
      visible: true,
      order: 4,
      fields: [
        { id: 'a-class-pos',  label: 'Position', binding: 'assessment.classPosition', visible: true, order: 0 },
        { id: 'a-division',   label: 'Division', binding: 'assessment.division',      visible: true, order: 1 },
      ],
      style: {
        border: '1px solid #999999',
        borderRadius: 0,
        padding: '8px 12px',
      },
    },
    {
      id: 'section-grade-table',
      type: 'grade_table',
      visible: true,
      order: 5,
      style: {
        headerBackground: '#e5e5e5',
        border: '1px solid #999999',
        headerFontSize: 9,
        rowFontSize: 10,
      },
      grades: DEFAULT_GRADE_ROWS,
    },
  ],
  shapes: [],
};

const DUAL_CURRICULUM_DRCE: DRCEDocument = {
  $schema: 'drce/v1',
  meta: {
    id: 'dual_curriculum',
    name: 'Dual Curriculum',
    school_id: null,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    report_type: 'end_of_term',
    is_default: false,
    template_key: 'dual_curriculum_template',
  },
  theme: {
    primaryColor:   '#2d5016',
    secondaryColor: '#c41e3a',
    accentColor:    '#003da5',
    fontFamily:     'Segoe UI, sans-serif',
    baseFontSize:   11,
    pagePadding:    '14px 16px',
    pageBackground: '#ffffff',
    pageBorder:     DEFAULT_PAGE_BORDER,
    pageSize:       'a4',
    orientation:    'landscape',
  },
  watermark: DEFAULT_WATERMARK,
  sections: [
    {
      id: 'section-header',
      type: 'header',
      visible: true,
      order: 0,
      style: {
        layout: 'three-column',
        paddingBottom: 8,
        borderBottom: '2px solid #2d5016',
        opacity: 0.95,
        logoWidth: 54,
        logoHeight: 54,
      },
    },
    {
      id: 'section-banner',
      type: 'banner',
      visible: true,
      order: 1,
      content: { text: '{reportTitle} - Dual Curriculum' },
      style: {
        backgroundColor: '#2d5016',
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 'bold',
        textAlign: 'center',
        padding: '6px 12px',
        marginTop: 8,
        marginBottom: 4,
        borderRadius: 2,
      },
    },
    {
      id: 'section-student-info',
      type: 'student_info',
      visible: true,
      order: 2,
      fields: [
        { id: 'f-name',   label: 'Name',  binding: 'student.fullName',    visible: true, order: 0 },
        { id: 'f-class',  label: 'Class', binding: 'student.className',   visible: true, order: 1 },
        { id: 'f-admno',  label: 'AdmNo', binding: 'student.admissionNo', visible: true, order: 2 },
        { id: 'f-term',   label: 'Term',  binding: 'meta.term',           visible: true, order: 3 },
      ],
      style: {
        border: '1px solid #2d5016',
        borderRadius: 2,
        padding: '8px 12px',
        background: '#f0f4ea',
        boxShadow: 'none',
        margin: '6px 0',
      },
    },
    {
      id: 'section-results',
      type: 'results_table',
      visible: true,
      order: 3,
      columns: [
        { id: 'col-subject',  header: 'Subject',  binding: 'result.subjectName',  width: '22%', visible: true, order: 0, align: 'left' },
        { id: 'col-mid',      header: 'MT',       binding: 'result.midTermScore', width: '8%',  visible: true, order: 1, align: 'center' },
        { id: 'col-eot',      header: 'EOT',      binding: 'result.endTermScore', width: '8%',  visible: true, order: 2, align: 'center' },
        { id: 'col-total',    header: 'Total',    binding: 'result.total',        width: '8%',  visible: true, order: 3, align: 'center' },
        { id: 'col-grade',    header: 'Grade',    binding: 'result.grade',        width: '7%',  visible: true, order: 4, align: 'center' },
        { id: 'col-comment',  header: 'Comment',  binding: 'result.comment',      width: '35%', visible: true, order: 5, align: 'left' },
        { id: 'col-initials', header: 'Init',     binding: 'result.initials',     width: '6%',  visible: true, order: 6, align: 'center', contentEditable: true },
      ],
      style: {
        headerBackground: '#dce7d1',
        headerBorder: '1px solid #2d5016',
        rowBorder: '1px solid #e5ead7',
        padding: 3,
        headerFontSize: 9,
        rowFontSize: 10,
      },
    },
    {
      id: 'section-assessment',
      type: 'assessment',
      visible: true,
      order: 4,
      fields: [
        { id: 'a-class-pos',  label: 'Position', binding: 'assessment.classPosition', visible: true, order: 0 },
        { id: 'a-division',   label: 'Division', binding: 'assessment.division',      visible: true, order: 1 },
      ],
      style: {
        border: '1px solid #2d5016',
        borderRadius: 2,
        padding: '6px 10px',
      },
    },
    {
      id: 'section-grade-table',
      type: 'grade_table',
      visible: true,
      order: 5,
      style: {
        headerBackground: '#dce7d1',
        border: '1px solid #2d5016',
        headerFontSize: 8,
        rowFontSize: 9,
      },
      grades: DEFAULT_GRADE_ROWS,
    },
  ],
  shapes: [],
};

const DEFAULT_CLONE_DRCE: DRCEDocument = {
  $schema: 'drce/v1',
  meta: {
    id: 'default_clone',
    name: 'Default (Clone)',
    school_id: null,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    report_type: 'end_of_term',
    is_default: false,
    template_key: 'default_clone_template',
  },
  theme: {
    primaryColor:   '#228b22',
    secondaryColor: '#d61515',
    accentColor:    '#1a4be7',
    fontFamily:     'Segoe UI, sans-serif',
    baseFontSize:   14,
    pagePadding:    '16px 18px',
    pageBackground: '#ffffff',
    pageBorder:     { enabled: true, color: '#228b22', width: 2, style: 'solid' as const, radius: 2 },
    pageSize:       'a4',
    orientation:    'portrait',
  },
  watermark: DEFAULT_WATERMARK,
  sections: [
    {
      id: 'section-header',
      type: 'header',
      visible: true,
      order: 0,
      style: {
        layout: 'three-column',
        paddingBottom: 10,
        borderBottom: 'none',
        opacity: 0.8,
        logoWidth: 64,
        logoHeight: 64,
      },
    },
    {
      id: 'section-banner',
      type: 'banner',
      visible: true,
      order: 1,
      content: { text: '{reportTitle}' },
      style: {
        backgroundColor: 'rgb(34, 139, 34)',
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center',
        padding: '8px 16px',
        marginTop: 12,
        marginBottom: 8,
        borderRadius: 4,
      },
    },
    {
      id: 'section-student-info',
      type: 'student_info',
      visible: true,
      order: 2,
      fields: [
        { id: 'f-name',   label: 'Name',        binding: 'student.fullName',    visible: true, order: 0 },
        { id: 'f-gender', label: 'Sex',         binding: 'student.gender',      visible: true, order: 1 },
        { id: 'f-class',  label: 'Class',       binding: 'student.className',   visible: true, order: 2 },
        { id: 'f-stream', label: 'Stream',      binding: 'student.streamName',  visible: true, order: 3 },
        { id: 'f-admno',  label: 'Student No.', binding: 'student.admissionNo', visible: true, order: 4 },
        { id: 'f-term',   label: 'Term',        binding: 'meta.term',           visible: true, order: 5 },
      ],
      style: {
        border: '2px solid #228b22',
        borderRadius: 4,
        padding: '14px 20px',
        background: '#f0fdf4',
        boxShadow: '0 2px 4px rgba(34,139,34,0.1)',
        margin: '14px 0',
      },
    },
    {
      id: 'section-results',
      type: 'results_table',
      visible: true,
      order: 3,
      columns: [
        { id: 'col-subject',  header: 'Subject',  binding: 'result.subjectName',  width: '30%', visible: true, order: 0, align: 'left' },
        { id: 'col-mid',      header: 'MT',       binding: 'result.midTermScore', width: '8%',  visible: true, order: 1, align: 'center' },
        { id: 'col-eot',      header: 'EOT',      binding: 'result.endTermScore', width: '8%',  visible: true, order: 2, align: 'center' },
        { id: 'col-total',    header: 'Total',    binding: 'result.total',        width: '8%',  visible: true, order: 3, align: 'center' },
        { id: 'col-grade',    header: 'Grade',    binding: 'result.grade',        width: '8%',  visible: true, order: 4, align: 'center' },
        { id: 'col-comment',  header: 'Comment',  binding: 'result.comment',      width: '30%', visible: true, order: 5, align: 'left' },
        { id: 'col-initials', header: 'Initials', binding: 'result.initials',     width: '8%',  visible: true, order: 6, align: 'center', contentEditable: true },
      ],
      style: {
        headerBackground: '#dcfce7',
        headerBorder: '1px solid #6ee7b7',
        rowBorder: '1px solid #d1fae5',
        padding: 5,
        headerFontSize: 11,
        rowFontSize: 13,
      },
    },
    {
      id: 'section-grade-table',
      type: 'grade_table',
      visible: true,
      order: 4,
      style: {
        headerBackground: '#dcfce7',
        border: '1px solid #6ee7b7',
        headerFontSize: 11,
        rowFontSize: 11,
      },
      grades: DEFAULT_GRADE_ROWS,
    },
  ],
  shapes: [],
};

const ARABIC_CLONE_DRCE: DRCEDocument = {
  $schema: 'drce/v1',
  meta: {
    id: 'arabic_clone',
    name: 'Arabic (Clone)',
    school_id: null,
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    report_type: 'end_of_term',
    is_default: false,
    template_key: 'arabic_clone_template',
  },
  theme: {
    primaryColor:   '#c41e3a',
    secondaryColor: '#228b22',
    accentColor:    '#004d99',
    fontFamily:     'Traditional Arabic, Arial, sans-serif',
    baseFontSize:   14,
    pagePadding:    '16px 18px',
    pageBackground: '#ffffff',
    pageBorder:     DEFAULT_PAGE_BORDER,
    pageSize:       'a4',
    orientation:    'portrait',
  },
  watermark: DEFAULT_WATERMARK,
  sections: [
    {
      id: 'section-header',
      type: 'header',
      visible: true,
      order: 0,
      style: {
        layout: 'three-column',
        paddingBottom: 12,
        borderBottom: '2px solid #c41e3a',
        opacity: 0.9,
        logoWidth: 64,
        logoHeight: 64,
      },
    },
    {
      id: 'section-banner',
      type: 'banner',
      visible: true,
      order: 1,
      content: { text: '{reportTitle}' },
      style: {
        backgroundColor: '#c41e3a',
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'right',
        padding: '8px 16px',
        marginTop: 12,
        marginBottom: 8,
        borderRadius: 4,
      },
    },
    {
      id: 'section-student-info',
      type: 'student_info',
      visible: true,
      order: 2,
      fields: [
        { id: 'f-name',   label: 'الاسم',        binding: 'student.fullName',    visible: true, order: 0 },
        { id: 'f-gender', label: 'الجنس',       binding: 'student.gender',      visible: true, order: 1 },
        { id: 'f-class',  label: 'الصف',        binding: 'student.className',   visible: true, order: 2 },
        { id: 'f-admno',  label: 'رقم القيد',   binding: 'student.admissionNo', visible: true, order: 3 },
        { id: 'f-term',   label: 'الفصل',       binding: 'meta.term',           visible: true, order: 4 },
      ],
      style: {
        border: '2px solid #c41e3a',
        borderRadius: 4,
        padding: '14px 20px',
        background: '#fff5f7',
        boxShadow: 'none',
        margin: '14px 0',
      },
    },
    {
      id: 'section-results',
      type: 'results_table',
      visible: true,
      order: 3,
      columns: [
        { id: 'col-subject',  header: 'المادة',      binding: 'result.subjectName',  width: '30%', visible: true, order: 0, align: 'right' },
        { id: 'col-mid',      header: 'نصفي',        binding: 'result.midTermScore', width: '8%',  visible: true, order: 1, align: 'center' },
        { id: 'col-eot',      header: 'نهائي',       binding: 'result.endTermScore', width: '8%',  visible: true, order: 2, align: 'center' },
        { id: 'col-total',    header: 'المجموع',    binding: 'result.total',        width: '8%',  visible: true, order: 3, align: 'center' },
        { id: 'col-grade',    header: 'التقدير',    binding: 'result.grade',        width: '8%',  visible: true, order: 4, align: 'center' },
        { id: 'col-comment',  header: 'التعليق',    binding: 'result.comment',      width: '30%', visible: true, order: 5, align: 'right' },
        { id: 'col-initials', header: 'التوقيع',    binding: 'result.initials',     width: '8%',  visible: true, order: 6, align: 'center', contentEditable: true },
      ],
      style: {
        headerBackground: '#f5e5e9',
        headerBorder: '1px solid #d61515',
        rowBorder: '1px dashed #999999',
        padding: 5,
        headerFontSize: 11,
        rowFontSize: 13,
      },
    },
    {
      id: 'section-grade-table',
      type: 'grade_table',
      visible: true,
      order: 4,
      style: {
        headerBackground: '#f0f0f0',
        border: '1px solid #04081a',
        headerFontSize: 11,
        rowFontSize: 11,
      },
      grades: DEFAULT_GRADE_ROWS,
    },
  ],
  shapes: [],
};

const ALL_TEMPLATES: DRCEDocument[] = [
  MODERN_TEMPLATE_DRCE,
  ARABIC_TEMPLATE_DRCE,
  MODERN_CLEAN_DRCE,
  NORTHGATE_CLASSIC_DRCE,
  DUAL_CURRICULUM_DRCE,
  DEFAULT_CLONE_DRCE,
  ARABIC_CLONE_DRCE,
];

export async function POST(request: NextRequest) {
  try {
    // Seeding writes global report templates — restrict to a super-admin
    // session. Previously this was an open, unauthenticated write.
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!session.isSuperAdmin) return NextResponse.json({ error: 'Forbidden — super-admin only' }, { status: 403 });

    const { seed } = Object.fromEntries(request.nextUrl.searchParams);

    if (seed !== 'true') {
      return NextResponse.json({
        error: 'Missing seed parameter. Use ?seed=true',
      }, { status: 400 });
    }

    const results = [];
    const conn = await getConnection();

    for (const template of ALL_TEMPLATES) {
      try {
        const templateKey = template.meta.template_key;
        const templateName = template.meta.name;

        // Check if already exists
        const [existing] = await conn.execute(
          'SELECT id FROM dvcf_documents WHERE template_key = ? LIMIT 1',
          [templateKey]
        );

        if ((existing as any[]).length > 0) {
          results.push({
            status: 'skipped',
            name: templateName,
            key: templateKey,
            message: 'Already exists',
          });
          continue;
        }

        // Insert new template
        const schemaJson = JSON.stringify(template);
        await conn.execute(
          `INSERT INTO dvcf_documents
             (school_id, document_type, name, description, schema_json, schema_version, is_default, template_key)
           VALUES (?, 'report_card', ?, '', ?, 1, ?, ?)`,
          [
            null,
            templateName,
            schemaJson,
            template.meta.is_default ? 1 : 0,
            templateKey,
          ]
        );

        results.push({
          status: 'created',
          name: templateName,
          key: templateKey,
        });
      } catch (err) {
        results.push({
          status: 'error',
          name: template.meta.name,
          error: (err as Error).message,
        });
      }
    }

    await conn.end();

    return NextResponse.json({
      success: true,
      message: 'Template migration complete',
      results,
    });
  } catch (err) {
    return NextResponse.json({
      error: 'Migration failed',
      details: (err as Error).message,
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'POST with ?seed=true to migrate hardcoded templates to DRCE',
    templates: ALL_TEMPLATES.map(t => ({
      name: t.meta.name,
      key: t.meta.template_key,
    })),
  });
}
