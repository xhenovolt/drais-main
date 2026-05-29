/**
 * Built-in starter templates for the Canva/Office-style "+ New Document"
 * gallery. Each starter is a tiny DRCEDocument seed — paper size, a few
 * sensible sections, default theme — that the editor loads as the
 * initial document when the user picks it.
 *
 * Starters live alongside school-defined "Save as starter" rows in the
 * `drce_starters` table; the gallery API merges both sources.
 *
 * Determinism: every starter is a pure value. No Date.now(), no random
 * IDs in the section tree — IDs come from `newId()` at the moment the
 * user picks the starter so two simultaneous opens never collide.
 */
import type { DRCEDocument } from './schema';
import { newSectionId, newFieldId, newColumnId, newItemId } from './ids';

function baseTheme() {
  return {
    primaryColor:   '#1d4ed8',
    secondaryColor: '#475569',
    accentColor:    '#d4a017',
    fontFamily:     'Inter, -apple-system, Segoe UI, sans-serif',
    baseFontSize:   12,
    pagePadding:    '20mm 18mm',
    pageBackground: '#ffffff',
    pageBorder:     { enabled: false, width: 0, style: 'solid' as const, color: '#cccccc', radius: 0 },
    pageSize:       'a4' as const,
    orientation:    'portrait' as const,
  };
}

function baseMeta(name: string, kind: string) {
  return {
    id:                String(0),          // overwritten when saved
    name,
    school_id:         null as number | null,
    version:           1,
    created_at:        new Date(0).toISOString(),
    updated_at:        new Date(0).toISOString(),
    report_type:       'end_of_term' as const,
    is_default:        false,
    template_key:      null as string | null,
    template_category: 'custom' as const,
    document_kind:     kind,
  };
}

function baseWatermark() {
  return {
    enabled:  false,
    type:     'text' as const,
    content:  '',
    imageUrl: null as string | null,
    opacity:  0.08,
    position: 'center' as const,
    rotation: -25,
    fontSize: 80,
    color:    '#cccccc',
    scope:    'page' as const,
  };
}

export interface Starter {
  code:        string;
  name:        string;
  kind:        string;
  description: string;
  sortOrder:   number;
  /** Build the seed document. Called with fresh IDs each time so two
   *  picks never collide. */
  build:       () => DRCEDocument;
}

// ─── Starters ───────────────────────────────────────────────────────────────

const REPORT_CARD: Starter = {
  code: 'report-classic', name: 'Classic Report Card', kind: 'report', sortOrder: 10,
  description: 'School header, student info, results table with totals, and three comment blocks.',
  build: () => ({
    $schema: 'drce/v1',
    meta:      baseMeta('Classic Report Card', 'report'),
    theme:     baseTheme(),
    watermark: baseWatermark(),
    shapes:    [],
    sections: [
      { id: newSectionId('header'), type: 'header', visible: true, order: 0,
        style: { layout: 'three-column', paddingBottom: 10, borderBottom: '1px solid #eee', opacity: 1, logoWidth: 64, logoHeight: 64 } } as never,
      { id: newSectionId('banner'), type: 'banner', visible: true, order: 1,
        content: { text: 'END-OF-TERM REPORT CARD' },
        style: { backgroundColor: '#1d4ed8', color: '#fff', fontSize: 16, fontWeight: 'bold',
          textAlign: 'center', padding: '10px', letterSpacing: '0.05em', textTransform: 'uppercase', borderRadius: 0 } } as never,
      { id: newSectionId('student_info'), type: 'student_info', visible: true, order: 2,
        fields: [
          { id: newFieldId(), label: 'Name',  binding: 'student.fullName',   visible: true, order: 0 },
          { id: newFieldId(), label: 'Class', binding: 'student.className',  visible: true, order: 1 },
          { id: newFieldId(), label: 'Term',  binding: 'meta.term',          visible: true, order: 2 },
        ],
        style: { border: '1px solid #ccc', borderRadius: 4, padding: '12px 14px',
          background: '#f9f9f9', labelColor: '#555', valueColor: '#000', valueFontWeight: 'bold', valueFontSize: 13 } } as never,
      { id: newSectionId('results_table'), type: 'results_table', visible: true, order: 3,
        columns: [
          { id: newColumnId(), header: 'Subject', binding: 'result.subjectName', width: '40%', visible: true, order: 0, align: 'left' },
          { id: newColumnId(), header: 'Score',   binding: 'result.total',       width: '15%', visible: true, order: 1, align: 'center' },
          { id: newColumnId(), header: 'Grade',   binding: 'result.grade',       width: '15%', visible: true, order: 2, align: 'center' },
          { id: newColumnId(), header: 'Comment', binding: 'result.comment',     width: '30%', visible: true, order: 3, align: 'left' },
        ],
        style: { headerBackground: '#e5e7eb', headerBorder: '1px solid #ccc',
          rowBorder: '1px solid #ddd', headerFontSize: 11, rowFontSize: 11,
          headerTextTransform: 'uppercase', padding: 4 } } as never,
      { id: newSectionId('comments'), type: 'comments', visible: true, order: 4,
        items: [
          { id: newItemId(), label: 'Class Teacher',  binding: 'comments.classTeacher', visible: true, order: 0 },
          { id: newItemId(), label: 'Head Teacher',   binding: 'comments.headTeacher',  visible: true, order: 1 },
        ],
        style: { ribbonBackground: '#475569', ribbonColor: '#fff', textColor: '#333', textFontStyle: 'italic' } } as never,
    ],
  }),
};

const CERTIFICATE: Starter = {
  code: 'certificate-award', name: 'Award Certificate', kind: 'certificate', sortOrder: 10,
  description: 'Landscape A4 with a big award title, recipient name, and signature block.',
  build: () => ({
    $schema: 'drce/v1',
    meta:      baseMeta('Award Certificate', 'certificate'),
    theme:     { ...baseTheme(), orientation: 'landscape', pageBorder: { enabled: true, width: 8, style: 'double', color: '#d4a017', radius: 0 } },
    watermark: baseWatermark(),
    shapes:    [],
    sections: [
      { id: newSectionId('header'), type: 'header', visible: true, order: 0,
        style: { layout: 'three-column', paddingBottom: 8, borderBottom: 'none', opacity: 1, logoWidth: 72, logoHeight: 72 } } as never,
      { id: newSectionId('banner'), type: 'banner', visible: true, order: 1,
        content: { text: 'CERTIFICATE OF ACHIEVEMENT' },
        style: { backgroundColor: 'transparent', color: '#1d4ed8', fontSize: 32, fontWeight: 'bold',
          textAlign: 'center', padding: '20px 10px', letterSpacing: '0.1em', textTransform: 'uppercase', borderRadius: 0 } } as never,
      { id: newSectionId('ribbon'), type: 'ribbon', visible: true, order: 2,
        content: { text: 'This certifies that', shape: 'flat' },
        style: { background: 'transparent', color: '#475569', fontWeight: 'normal',
          fontSize: 14, padding: '6px 0', textAlign: 'center' } } as never,
      { id: newSectionId('student_info'), type: 'student_info', visible: true, order: 3,
        fields: [
          { id: newFieldId(), label: '', binding: 'student.fullName', visible: true, order: 0 },
        ],
        style: { border: 'none', padding: '4px 14px',
          background: 'transparent', labelColor: '#475569', valueColor: '#1d4ed8',
          valueFontWeight: 'bold', valueFontSize: 28 } } as never,
      { id: newSectionId('ribbon'), type: 'ribbon', visible: true, order: 4,
        content: { text: 'has demonstrated excellence and is hereby recognized.', shape: 'flat' },
        style: { background: 'transparent', color: '#475569', fontWeight: 'normal',
          fontSize: 13, padding: '14px 0', textAlign: 'center' } } as never,
      { id: newSectionId('spacer'), type: 'spacer', visible: true, order: 5,
        style: { height: 60 } } as never,
    ],
  }),
};

const ID_CARD: Starter = {
  code: 'id-card-portrait', name: 'Student ID Card', kind: 'id_card', sortOrder: 10,
  description: 'Small-format student ID with photo, name, class, admission number, school footer.',
  build: () => ({
    $schema: 'drce/v1',
    meta:      baseMeta('Student ID Card', 'id_card'),
    theme:     { ...baseTheme(), pageSize: 'a5', orientation: 'landscape',
      pageBorder: { enabled: true, width: 2, style: 'solid', color: '#1d4ed8', radius: 12 },
      pagePadding: '6mm', baseFontSize: 10 },
    watermark: baseWatermark(),
    shapes:    [],
    sections: [
      { id: newSectionId('header'), type: 'header', visible: true, order: 0,
        style: { layout: 'three-column', paddingBottom: 4, borderBottom: '2px solid #1d4ed8', opacity: 1, logoWidth: 36, logoHeight: 36 } } as never,
      { id: newSectionId('student_info'), type: 'student_info', visible: true, order: 1,
        fields: [
          { id: newFieldId(), label: 'Name',     binding: 'student.fullName',    visible: true, order: 0 },
          { id: newFieldId(), label: 'Class',    binding: 'student.className',   visible: true, order: 1 },
          { id: newFieldId(), label: 'Adm. No.', binding: 'student.admissionNo', visible: true, order: 2 },
        ],
        style: { border: 'none', padding: '8px 4px',
          background: 'transparent', labelColor: '#475569', valueColor: '#000',
          valueFontWeight: 'bold', valueFontSize: 11 } } as never,
      { id: newSectionId('banner'), type: 'banner', visible: true, order: 2,
        content: { text: 'Property of the school. Return if found.' },
        style: { backgroundColor: '#1d4ed8', color: '#fff', fontSize: 8, fontWeight: 'normal',
          textAlign: 'center', padding: '3px', letterSpacing: 0, textTransform: 'none', borderRadius: 0 } } as never,
    ],
  }),
};

const TRANSCRIPT: Starter = {
  code: 'transcript-cumulative', name: 'Academic Transcript', kind: 'transcript', sortOrder: 10,
  description: 'Cumulative academic record with student details and a long results table.',
  build: () => ({
    $schema: 'drce/v1',
    meta:      baseMeta('Academic Transcript', 'transcript'),
    theme:     baseTheme(),
    watermark: { ...baseWatermark(), enabled: true, content: 'OFFICIAL TRANSCRIPT' },
    shapes:    [],
    sections: [
      { id: newSectionId('header'), type: 'header', visible: true, order: 0,
        style: { layout: 'three-column', paddingBottom: 10, borderBottom: '2px solid #1d4ed8', opacity: 1, logoWidth: 64, logoHeight: 64 } } as never,
      { id: newSectionId('banner'), type: 'banner', visible: true, order: 1,
        content: { text: 'OFFICIAL ACADEMIC TRANSCRIPT' },
        style: { backgroundColor: 'transparent', color: '#1d4ed8', fontSize: 18, fontWeight: 'bold',
          textAlign: 'center', padding: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: 0 } } as never,
      { id: newSectionId('student_info'), type: 'student_info', visible: true, order: 2,
        fields: [
          { id: newFieldId(), label: 'Name',     binding: 'student.fullName',    visible: true, order: 0 },
          { id: newFieldId(), label: 'Adm. No.', binding: 'student.admissionNo', visible: true, order: 1 },
          { id: newFieldId(), label: 'Class',    binding: 'student.className',   visible: true, order: 2 },
          { id: newFieldId(), label: 'Year',     binding: 'meta.year',           visible: true, order: 3 },
        ],
        style: { border: '1px solid #ccc', borderRadius: 4, padding: '12px 14px',
          background: '#f9f9f9', labelColor: '#555', valueColor: '#000', valueFontWeight: 'bold', valueFontSize: 12 } } as never,
      { id: newSectionId('results_table'), type: 'results_table', visible: true, order: 3,
        columns: [
          { id: newColumnId(), header: 'Subject', binding: 'result.subjectName', width: '50%', visible: true, order: 0, align: 'left' },
          { id: newColumnId(), header: 'Score',   binding: 'result.total',       width: '20%', visible: true, order: 1, align: 'center' },
          { id: newColumnId(), header: 'Grade',   binding: 'result.grade',       width: '15%', visible: true, order: 2, align: 'center' },
          { id: newColumnId(), header: 'Remark',  binding: 'result.comment',     width: '15%', visible: true, order: 3, align: 'left' },
        ],
        style: { headerBackground: '#1d4ed8', headerBorder: '1px solid #1d4ed8',
          rowBorder: '1px solid #ddd', headerFontSize: 11, rowFontSize: 11,
          headerTextTransform: 'uppercase', padding: 5 } } as never,
    ],
  }),
};

const LETTER: Starter = {
  code: 'letter-official', name: 'Official Letter', kind: 'letter', sortOrder: 10,
  description: 'School header with empty body — use a Container or text shape to compose the letter body.',
  build: () => ({
    $schema: 'drce/v1',
    meta:      baseMeta('Official Letter', 'letter'),
    theme:     { ...baseTheme(), pagePadding: '28mm 22mm' },
    watermark: baseWatermark(),
    shapes:    [],
    sections: [
      { id: newSectionId('header'), type: 'header', visible: true, order: 0,
        style: { layout: 'three-column', paddingBottom: 14, borderBottom: '1px solid #cbd5e1', opacity: 1, logoWidth: 56, logoHeight: 56 } } as never,
      { id: newSectionId('spacer'), type: 'spacer', visible: true, order: 1, style: { height: 30 } } as never,
      { id: newSectionId('divider'), type: 'divider', visible: true, order: 2,
        style: { color: '#e5e7eb', thickness: 1, margin: '4px 0' } } as never,
      { id: newSectionId('spacer'), type: 'spacer', visible: true, order: 3, style: { height: 16 } } as never,
    ],
  }),
};

const BLANK: Starter = {
  code: 'blank-document', name: 'Blank document', kind: 'blank', sortOrder: 999,
  description: 'Start from an empty page.',
  build: () => ({
    $schema: 'drce/v1',
    meta:      baseMeta('Untitled', 'blank'),
    theme:     baseTheme(),
    watermark: baseWatermark(),
    shapes:    [],
    sections:  [],
  }),
};

export const BUILT_IN_STARTERS: Starter[] = [
  REPORT_CARD, CERTIFICATE, ID_CARD, TRANSCRIPT, LETTER, BLANK,
];

export function findStarter(code: string): Starter | undefined {
  return BUILT_IN_STARTERS.find(s => s.code === code);
}
