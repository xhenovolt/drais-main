/**
 * Phase 3.3 — Built-in DRCE document resolver.
 *
 * Bridges the registry (which knows entry ids and metadata) and the
 * authored DRCEDocument constants in `defaults.ts`. The /api/dvcf/documents/[id]
 * route consults this resolver before falling back to the numeric DB lookup
 * so SnapshotPreviewer can fetch built-in templates by their string registry
 * id with the same code path it uses for school-authored documents.
 *
 * No DB dependency. No I/O. Pure lookup.
 */
import type { DRCEDocument } from './schema';
import {
  DRAIS_DEFAULT_DOCUMENT,
  ARABIC_CLONE_DOCUMENT,
  DEFAULT_GRADE_ROWS,
} from './defaults';

/**
 * Emergency-secular DRCE document. Authored as a clone of
 * DRAIS_DEFAULT_DOCUMENT with the emergency green colour palette
 * (#09a12a primary) so its visual identity matches
 * `backup/secular-emergency-template.html`. Designed to be the override-
 * aware DRCE counterpart of the static-HTML emergency template.
 */
const EMERGENCY_SECULAR_DOCUMENT: DRCEDocument = {
  $schema: 'drce/v1',
  meta: {
    id:                'emergency-secular-drce',
    name:              'Secular Emergency (DRCE)',
    school_id:         null,
    version:           1,
    created_at:        '2026-05-06T00:00:00Z',
    updated_at:        '2026-05-06T00:00:00Z',
    report_type:       'end_of_term',
    is_default:        false,
    template_key:      'emergency-secular-drce',
    template_category: 'emergency',
  },
  theme: {
    primaryColor:   '#09a12a',
    secondaryColor: '#0066cc',
    accentColor:    '#f2f2f2',
    fontFamily:     'Arial, sans-serif',
    baseFontSize:   12,
    pagePadding:    '20px',
    pageBackground: '#ffffff',
    pageBorder: { enabled: true, color: '#cccccc', width: 1, style: 'solid', radius: 0 },
    pageSize:       'a4',
    orientation:    'portrait',
  },
  watermark: {
    enabled:  false,
    type:     'text',
    content:  'EMERGENCY',
    imageUrl: null,
    opacity:  0.06,
    position: 'center',
    rotation: -30,
    fontSize: 84,
    color:    '#09a12a',
    scope:    'page',
  },
  sections: [
    {
      id: 'section-header', type: 'header', visible: true, order: 0,
      style: {
        layout:        'centered',
        paddingBottom: 10,
        borderBottom:  '2px solid #09a12a',
        opacity:       1,
        logoWidth:     70,
        logoHeight:    70,
      },
    },
    {
      id: 'section-banner', type: 'banner', visible: true, order: 1,
      content: { text: '{reportTitle}' },
      style: {
        backgroundColor: '#09a12a', color: '#ffffff', fontSize: 16,
        fontWeight:      'bold', textAlign: 'center', padding: '8px',
        letterSpacing:   '0.1em', textTransform: 'uppercase', borderRadius: 0,
      },
    },
    {
      id: 'section-student-info', type: 'student_info', visible: true, order: 2,
      fields: [
        { id: 'f-name',   label: 'NAME',           binding: 'student.fullName',    visible: true, order: 0 },
        { id: 'f-gender', label: 'GENDER',         binding: 'student.gender',      visible: true, order: 1 },
        { id: 'f-class',  label: 'CLASS',          binding: 'student.className',   visible: true, order: 2 },
        { id: 'f-stream', label: 'STREAM',         binding: 'student.streamName',  visible: true, order: 3 },
        { id: 'f-admno',  label: 'STUDENT NUMBER', binding: 'student.admissionNo', visible: true, order: 4 },
        { id: 'f-term',   label: 'TERM',           binding: 'meta.term',           visible: true, order: 5 },
      ],
      style: {
        border:           '1px dashed #999',
        borderRadius:     0,
        padding:          '8px',
        background:       '#ffffff',
        labelColor:       '#555555',
        valueColor:       '#0066cc',
        valueFontWeight:  'bold',
        valueFontSize:    14,
      },
    },
    {
      id: 'section-ribbon-1', type: 'ribbon', visible: true, order: 3,
      content: { text: 'MAIN SUBJECTS ASSESSMENT', shape: 'arrow-down' },
      style: {
        background:  '#999999', color: '#000000', fontWeight: 'bold',
        fontSize:    12, padding: '4px 0', textAlign: 'center',
      },
    },
    {
      id: 'section-results', type: 'results_table', visible: true, order: 4,
      columns: [
        { id: 'col-subject',  header: 'SUBJECT',  binding: 'result.subjectName',   width: '25%', visible: true, order: 0, align: 'left'   },
        { id: 'col-mid',      header: 'MARKS',    binding: 'result.midTermScore',  width: '8%',  visible: true, order: 1, align: 'center' },
        { id: 'col-eot',      header: 'TOTAL',    binding: 'result.endTermScore',  width: '8%',  visible: true, order: 2, align: 'center' },
        { id: 'col-grade',    header: 'GRADE',    binding: 'result.grade',         width: '8%',  visible: true, order: 3, align: 'center', style: { color: '#0066cc' } },
        { id: 'col-comment',  header: 'REMARKS',  binding: 'result.comment',       width: '40%', visible: true, order: 4, align: 'left',   style: { fontStyle: 'italic', color: '#09a12a' } },
        { id: 'col-initials', header: 'INITIAL',  binding: 'result.initials',      width: '11%', visible: true, order: 5, align: 'center', contentEditable: true, style: { color: '#09a12a', fontWeight: 'bold' } },
      ],
      style: {
        headerBackground:    '#f2f2f2',
        headerBorder:        '1px solid #333',
        rowBorder:           '1px solid #333',
        headerFontSize:      11,
        rowFontSize:         11,
        headerTextTransform: 'uppercase',
        padding:             4,
      },
    },
    {
      id: 'section-comments', type: 'comments', visible: true, order: 5,
      items: [
        { id: 'c-class', label: 'Subject Teacher Comment:',  binding: 'comments.classTeacher', visible: true, order: 0 },
        { id: 'c-head',  label: 'School Principal Comment:', binding: 'comments.headTeacher',  visible: true, order: 1 },
      ],
      style: {
        ribbonBackground: '#dddddd', ribbonColor:    '#000000',
        textColor:        '#09a12a', textFontStyle: 'italic',
      },
    },
    {
      id: 'section-next-term', type: 'next_term_begins', visible: true, order: 6,
      content: { text: 'NEXT TERM BEGINS' },
      style: {
        background:  '#ffffff',
        color:       '#09a12a',
        fontSize:    12,
        fontWeight:  'bold',
        textAlign:   'center',
        padding:     '8px 0',
        borderRadius:0,
        borderColor: '#09a12a',
        borderWidth: 2,
      },
    },
  ],
  shapes: [],
};

/**
 * Phase L4 — Academic Transcript built-in.
 *
 * Cumulative-style report card layout: prominent OFFICIAL TRANSCRIPT
 * banner, navy-blue palette to distinguish it from end-of-term
 * report cards, watermark on, expanded results table with Score /
 * Grade / Remark columns. Renders against the standard snapshot
 * data context — so today it shows the snapshot's term-bounded
 * data with transcript-styling, NOT a real multi-term cumulative
 * record. Backfilling real cumulative data is a follow-up; the
 * template ships first so schools can adopt the visual identity.
 */
const TRANSCRIPT_DOCUMENT: DRCEDocument = {
  $schema: 'drce/v1',
  meta: {
    id:                'transcript-academic',
    name:              'Academic Transcript',
    school_id:         null,
    version:           1,
    created_at:        '2026-06-02T00:00:00Z',
    updated_at:        '2026-06-02T00:00:00Z',
    report_type:       'transcript',
    is_default:        false,
    template_key:      'transcript-academic',
    template_category: 'standard',
  },
  theme: {
    primaryColor:   '#1d4ed8',  // navy — visually distinct from report cards
    secondaryColor: '#0f172a',
    accentColor:    '#f1f5f9',
    fontFamily:     'Arial, sans-serif',
    baseFontSize:   12,
    pagePadding:    '22px 26px',
    pageBackground: '#ffffff',
    pageBorder: { enabled: true, color: '#1d4ed8', width: 2, style: 'solid', radius: 0 },
    pageSize:       'a4',
    orientation:    'portrait',
  },
  watermark: {
    enabled:  true,
    type:     'text',
    content:  'OFFICIAL TRANSCRIPT',
    color:    '#1d4ed8',
    fontSize: 64,
    opacity:  0.06,
    rotation: -28,
    position: 'center',
    imageUrl: '',
    scope:    'page',
  },
  sections: [
    { id: 'transcript-header', type: 'header', visible: true, order: 0,
      style: { layout: 'three-column', paddingBottom: 12, borderBottom: '2px solid #1d4ed8',
        opacity: 1, logoWidth: 72, logoHeight: 72 } } as never,
    { id: 'transcript-banner', type: 'banner', visible: true, order: 1,
      content: { text: 'OFFICIAL ACADEMIC TRANSCRIPT' },
      style: { backgroundColor: '#1d4ed8', color: '#ffffff', fontSize: 18, fontWeight: 'bold',
        textAlign: 'center', padding: '10px', letterSpacing: '0.12em',
        textTransform: 'uppercase', borderRadius: 4 } } as never,
    { id: 'transcript-student', type: 'student_info', visible: true, order: 2,
      fields: [
        { id: 'f-name',     label: 'Name',        binding: 'student.fullName',    visible: true, order: 0 },
        { id: 'f-adm',      label: 'Adm. No.',    binding: 'student.admissionNo', visible: true, order: 1 },
        { id: 'f-class',    label: 'Class',       binding: 'student.className',   visible: true, order: 2 },
        { id: 'f-stream',   label: 'Stream',      binding: 'student.streamName',  visible: true, order: 3 },
        { id: 'f-year',     label: 'Year',        binding: 'meta.year',           visible: true, order: 4 },
        { id: 'f-term',     label: 'Term',        binding: 'meta.term',           visible: true, order: 5 },
      ],
      style: { border: '1px solid #cbd5e1', borderRadius: 6, padding: '12px 14px',
        background: '#f1f5f9', labelColor: '#475569', valueColor: '#0f172a',
        valueFontWeight: 'bold', valueFontSize: 13, showBarcode: true, showPhoto: true,
        fieldsPerRow: 3, barcodeWidth: 44, barcodeHeight: 56 } } as never,
    { id: 'transcript-results', type: 'results_table', visible: true, order: 3,
      columns: [
        { id: 'c-subject', header: 'Subject', binding: 'result.subjectName', width: '45%', visible: true, order: 0, align: 'left'   },
        { id: 'c-score',   header: 'Score',   binding: 'result.total',       width: '15%', visible: true, order: 1, align: 'center' },
        { id: 'c-grade',   header: 'Grade',   binding: 'result.grade',       width: '15%', visible: true, order: 2, align: 'center' },
        { id: 'c-remark',  header: 'Remark',  binding: 'result.comment',     width: '25%', visible: true, order: 3, align: 'left'   },
      ],
      style: { headerBackground: '#1d4ed8', headerBorder: '1px solid #1d4ed8',
        rowBorder: '1px solid #cbd5e1', headerFontSize: 11, rowFontSize: 11,
        headerTextTransform: 'uppercase', padding: 5 } } as never,
    { id: 'transcript-signatures', type: 'signature_block', visible: true, order: 4,
      signatories: [
        { id: 's-registrar', roleLabel: 'REGISTRAR',       name: '', showDate: true },
        { id: 's-head',      roleLabel: 'HEAD OF SCHOOL', name: '', showDate: true },
      ],
      style: { perRow: 2, gap: 40, lineColor: '#0f172a', lineThickness: 1,
        signatureHeight: 50, labelColor: '#475569', nameColor: '#0f172a',
        showDateLabel: true, dateLabel: 'Date:' } } as never,
  ],
  shapes: [],
  // Phase L2 — recurring footer on every paper page, so a multi-page
  // transcript carries an authenticity bar consistently. Operators can
  // override via the editor's Page tab.
  runningFooter: {
    show:      true,
    text:      'Official Transcript — {schoolName} · Generated {generatedAt} · Page {pageNumber} of {totalPages}',
    align:     'center',
    fontSize:  8,
    color:     '#64748b',
    fontFamily: 'Arial, sans-serif',
    reserveMm: 14,
  },
};

/**
 * Map of registry id → built-in DRCEDocument. Each entry gives the
 * registry's emergency-html ids a DRCE-renderable counterpart so the
 * override system applies regardless of which template was picked.
 *
 * The DRCE-native ids are namespaced with `drce-` so they don't collide
 * with the existing emergency-html registry ids.
 */
const RESOLVER_TABLE: Record<string, DRCEDocument> = {
  // Full DRCE-native counterparts for each emergency variant
  'drce-emergency-secular':  EMERGENCY_SECULAR_DOCUMENT,
  'drce-emergency-theology': ARABIC_CLONE_DOCUMENT,
  'drce-legacy-rpt':         DRAIS_DEFAULT_DOCUMENT,
  'drce-transcript-academic': TRANSCRIPT_DOCUMENT,
};

/**
 * Resolve a built-in registry id to its inline DRCEDocument. Returns null
 * if the id is not a recognised built-in (caller should fall through to
 * the numeric `dvcf_documents.id` lookup).
 */
export function resolveBuiltInDocument(registryId: string): DRCEDocument | null {
  return RESOLVER_TABLE[registryId] ?? null;
}

/**
 * Public accessor for the new green-themed emergency-secular document.
 * Useful for tests and any future code paths that need direct access.
 */
export { EMERGENCY_SECULAR_DOCUMENT, DEFAULT_GRADE_ROWS };
