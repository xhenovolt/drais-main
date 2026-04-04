'use client';

// ============================================================================
// DualCurriculumTemplate.tsx
// Landscape dual-curriculum report card: secular (EN) | theology (AR) side-by-side.
// Created as part of Phase 3 of the DRAIS reports multi-dimension upgrade.
// ============================================================================

import React, { useRef, useState } from 'react';
import type { ReportLayoutJSON } from '@/lib/reportTemplates';

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirrors page.tsx – keep in sync)
// ─────────────────────────────────────────────────────────────────────────────

export interface DualResult {
  student_id: number;
  subject_id: number;
  subject_name: string;
  /** Arabic subject name – populated when subjects table has name_ar column */
  name_ar?: string;
  teacher_name?: string;
  score: number;
  result_type_name?: string;
  results_type?: string;
  term?: string;
  term_name?: string;
  class_name: string;
  photo_url?: string;
  admission_no: string;
  first_name: string;
  last_name: string;
  gender?: string;
  stream_name?: string;
  /** Curriculum type: 'secular' | 'theology' | other */
  subject_type?: string;
  mid_term_score?: number;
  end_term_score?: number;
  teacher_initials?: string;
  class_id?: number;
}

export interface DualGroupedResult {
  subject_name: string;
  name_ar?: string;
  teacher_name?: string;
  midTermScore: number | null;
  endTermScore: number | null;
  regularScore: number | null;
  subject_type?: string;
}

export interface DualStudent {
  student_id: number;
  photo?: string | null;
  admission_no: string;
  first_name: string;
  last_name: string;
  class_name: string;
  gender?: string;
  stream_name?: string;
  results: DualResult[];
  position?: number;
  totalInClass?: number;
  class_teacher_comment?: string;
  dos_comment?: string;
  headteacher_comment?: string;
}

export interface DualSchoolInfo {
  name: string;
  address: string;
  po_box: string;
  logo_url: string;
  contact: string;
  email: string;
  website: string;
  motto: string;
  center_no: string;
  registration_no: string;
  arabic_name: string;
  arabic_address: string;
  arabic_po_box: string;
  arabic_contact: string;
  arabic_center_no: string;
  arabic_registration_no: string;
  arabic_motto: string;
}

export interface DualCurriculumTemplateProps {
  student: DualStudent;
  schoolInfo: DualSchoolInfo;
  activeLayout: ReportLayoutJSON;
  isEndOfTerm: boolean;
  enableMarkConversion: boolean;
  editableTermValue: string;
  nextTermBegins: string;
  division: string;
  aggregates: number;
  isNursery: boolean;
  nurseryOverallGrade: string;
  teacherInitials: Record<string, string>;
  onInitialsChange: (classId: string, subjectId: string, initials: string) => void;
  onInitialsSave: (classId: string, subjectId: string, initials: string) => void;
  onNextTermChange: (date: string) => void;
  /** Called after user picks a logo file; parent uploads to Cloudinary + saves to DB. */
  onLogoUpload?: (file: File) => Promise<string | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: get subject display name by language
// ─────────────────────────────────────────────────────────────────────────────
export function getSubjectName(
  subject: { subject_name: string; name_ar?: string },
  lang: 'en' | 'ar'
): string {
  return lang === 'ar' ? subject.name_ar || subject.subject_name : subject.subject_name;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: group results and extract scores
// ─────────────────────────────────────────────────────────────────────────────
function groupBySubject(results: DualResult[]): DualGroupedResult[] {
  const map: Record<string, DualGroupedResult> = {};

  results.forEach((r) => {
    const key = String(r.subject_id || r.subject_name);
    if (!map[key]) {
      map[key] = {
        subject_name: r.subject_name,
        name_ar: r.name_ar,
        teacher_name: r.teacher_name,
        midTermScore: null,
        endTermScore: null,
        regularScore: null,
        subject_type: r.subject_type,
      };
    }
    const rt = (r.result_type_name || r.results_type || '').toLowerCase();
    const score = parseFloat(String(r.score || 0));

    if (rt.includes('mid')) {
      map[key].midTermScore = score;
    } else if (rt.includes('end')) {
      map[key].endTermScore = score;
      if (r.mid_term_score != null) map[key].midTermScore = parseFloat(String(r.mid_term_score));
      if (r.end_term_score != null) map[key].endTermScore = parseFloat(String(r.end_term_score));
    } else {
      map[key].regularScore = score;
      if (r.mid_term_score != null) map[key].midTermScore = parseFloat(String(r.mid_term_score));
      if (r.end_term_score != null) map[key].endTermScore = parseFloat(String(r.end_term_score));
    }
  });

  return Object.values(map).filter((g) => g.subject_name);
}

function getDisplayScore(
  r: DualGroupedResult,
  isEndOfTerm: boolean,
  enableConversion: boolean
): number {
  const m = r.midTermScore;
  const e = r.endTermScore;

  if (enableConversion) {
    if (isEndOfTerm && e !== null) return Math.round((e / 100) * 60);
    if (m !== null) return Math.round((m / 100) * 40);
    return 0;
  }

  if (isEndOfTerm && e !== null) return Math.round(e);
  if (m !== null) return Math.round(m);
  return 0;
}

/** Classify a subject as theology based on subject_type value */
function isTheologySubject(subjectType?: string): boolean {
  const t = (subjectType || '').toLowerCase();
  return t === 'theology' || t.includes('theol') || t.includes('islam') || t.includes('religion');
}

// ─────────────────────────────────────────────────────────────────────────────
// SubjectTable — one half of the dual layout
// ─────────────────────────────────────────────────────────────────────────────
interface SubjectTableProps {
  title: string;
  subjects: DualGroupedResult[];
  lang: 'en' | 'ar';
  isEndOfTerm: boolean;
  enableMarkConversion: boolean;
  layout: ReportLayoutJSON;
}

function SubjectTable({
  title,
  subjects,
  lang,
  isEndOfTerm,
  enableMarkConversion,
  layout,
}: SubjectTableProps) {
  const isRtl = lang === 'ar';

  const thStyle: React.CSSProperties = {
    background: layout.table.th.background,
    border: layout.table.th.border,
    padding: layout.table.th.padding,
    textAlign: isRtl ? 'right' : 'left',
    color: layout.table.th.color,
  };
  const tdStyle: React.CSSProperties = {
    border: layout.table.td.border,
    padding: layout.table.td.padding,
    textAlign: 'center',
    color: layout.table.td.color,
  };
  const subjectTdStyle: React.CSSProperties = {
    ...tdStyle,
    textAlign: isRtl ? 'right' : 'left',
    direction: isRtl ? 'rtl' : 'ltr',
  };

  const totalScore = subjects.reduce(
    (sum, r) => sum + getDisplayScore(r, isEndOfTerm, enableMarkConversion),
    0
  );
  const totalMT = subjects.reduce((sum, r) => sum + (r.midTermScore || 0), 0);

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
      {/* Table title banner */}
      <div
        style={{
          background: layout.banner.backgroundColor,
          color: layout.banner.color,
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: Math.max((layout.banner.fontSize || 14) - 2, 11),
          padding: '4px 8px',
          marginBottom: 6,
          borderRadius: layout.banner.borderRadius,
          direction: isRtl ? 'rtl' : 'ltr',
        }}
      >
        {title}
      </div>

      <table
        style={{
          borderCollapse: layout.table.borderCollapse,
          width: '100%',
          fontSize: Math.max((layout.table.fontSize || 13) - 1, 11),
        }}
      >
        <thead>
          <tr>
            <th style={thStyle}>{isRtl ? 'المادة' : 'SUBJECT'}</th>
            {isEndOfTerm && <th style={{ ...thStyle, textAlign: 'center' }}>MT</th>}
            <th style={{ ...thStyle, textAlign: 'center' }}>
              {isEndOfTerm ? 'EOT' : 'SCORE'}
            </th>
          </tr>
        </thead>
        <tbody>
          {subjects.length === 0 ? (
            <tr>
              <td
                colSpan={isEndOfTerm ? 3 : 2}
                style={{ ...tdStyle, textAlign: 'center', color: '#999', fontStyle: 'italic' }}
              >
                {isRtl ? 'لا توجد مواد' : 'No subjects'}
              </td>
            </tr>
          ) : (
            subjects.map((r, i) => {
              const score = getDisplayScore(r, isEndOfTerm, enableMarkConversion);
              const mtDisplay = r.midTermScore !== null ? Math.round(r.midTermScore) : '-';
              return (
                <tr key={i}>
                  <td style={subjectTdStyle}>{getSubjectName(r, lang)}</td>
                  {isEndOfTerm && <td style={tdStyle}>{mtDisplay}</td>}
                  <td style={tdStyle}>{score}</td>
                </tr>
              );
            })
          )}
          {/* Totals row */}
          <tr style={{ fontWeight: 'bold' }}>
            <td style={subjectTdStyle}>{isRtl ? 'المجموع' : 'TOTAL'}</td>
            {isEndOfTerm && <td style={tdStyle}>{Math.round(totalMT)}</td>}
            <td style={tdStyle}>{Math.round(totalScore)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DualCurriculumTemplate — main export
// ─────────────────────────────────────────────────────────────────────────────
export default function DualCurriculumTemplate({
  student,
  schoolInfo,
  activeLayout: layout,
  isEndOfTerm,
  enableMarkConversion,
  editableTermValue,
  nextTermBegins,
  division,
  aggregates,
  isNursery,
  nurseryOverallGrade,
  teacherInitials,
  onInitialsChange,
  onInitialsSave,
  onNextTermChange,
  onLogoUpload,
}: DualCurriculumTemplateProps) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  const handleLogoClick = () => {
    if (onLogoUpload) logoInputRef.current?.click();
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onLogoUpload) return;
    // Instant local preview
    setLogoPreview(URL.createObjectURL(file));
    setLogoUploading(true);
    try {
      const url = await onLogoUpload(file);
      if (url) setLogoPreview(url);
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };
  const allGrouped = groupBySubject(student.results || []);

  // Split by subject_type: theology subjects go right, secular left
  const secularSubjects = allGrouped.filter((r) => !isTheologySubject(r.subject_type));
  const theologySubjects = allGrouped.filter((r) => isTheologySubject(r.subject_type));

  const termLabel =
    editableTermValue ||
    student.results[0]?.term_name ||
    student.results[0]?.term ||
    'Term 1';
  const reportTypeName = (student.results[0]?.result_type_name || 'MID TERM').toUpperCase();

  const infoValueStyle: React.CSSProperties = {
    color: layout.studentValue.color,
    fontStyle: layout.studentValue.fontStyle as React.CSSProperties['fontStyle'],
    fontWeight: layout.studentValue.fontWeight,
  };

  return (
    <div
      className="dual-report-page"
      style={{
        background: layout.page.background,
        boxShadow: layout.page.boxShadow,
        padding: layout.page.padding,
        borderRadius: layout.page.borderRadius,
        maxWidth: '100%',
        margin: layout.page.margin,
        fontSize: layout.page.fontSize,
        fontFamily: layout.page.fontFamily,
        pageBreakAfter: 'always',
      }}
    >
      {/* Cairo font for Arabic sections */}
      <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* ── Header: school info bilingual ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: layout.header.paddingBottom,
          borderBottom: layout.header.borderBottom || '1px solid #ccc',
          marginBottom: 8,
          opacity: layout.header.opacity,
        }}
      >
        {/* English left */}
        <div style={{ flex: 1, direction: 'ltr', textAlign: 'left' }}>
          <strong style={{ fontSize: 15 }}>{schoolInfo.name}</strong>
          {schoolInfo.motto && <div style={{ fontSize: 10, fontStyle: 'italic', color: '#555' }}>{schoolInfo.motto}</div>}
          <div style={{ fontSize: 11 }}>{schoolInfo.address}{schoolInfo.po_box ? `, ${schoolInfo.po_box}` : ''}</div>
          {schoolInfo.contact && <div style={{ fontSize: 11 }}>Tel: {schoolInfo.contact}</div>}
          {schoolInfo.email && <div style={{ fontSize: 11 }}>Email: {schoolInfo.email}</div>}
          {schoolInfo.website && <div style={{ fontSize: 11 }}>Web: {schoolInfo.website}</div>}
          {schoolInfo.center_no && <div style={{ fontSize: 11 }}>UNEB Center No: {schoolInfo.center_no}</div>}
          {schoolInfo.registration_no && <div style={{ fontSize: 11 }}>Reg. No: {schoolInfo.registration_no}</div>}
        </div>

        {/* Logo center — click to upload */}
        <div
          style={{ textAlign: 'center', flex: 'none', margin: '0 12px', position: 'relative', cursor: onLogoUpload ? 'pointer' : 'default' }}
          onClick={handleLogoClick}
          title={onLogoUpload ? 'Click to change logo' : undefined}
        >
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleLogoFileChange}
          />
          <img
            src={logoPreview || schoolInfo.logo_url || '/uploads/logo.png'}
            alt="School Logo"
            width={65}
            height={65}
            style={{ objectFit: 'contain', display: 'inline-block', borderRadius: 4, border: onLogoUpload ? '2px dashed transparent' : 'none' }}
            onMouseEnter={(e) => { if (onLogoUpload) (e.currentTarget as HTMLImageElement).style.border = '2px dashed #4f8cf7'; }}
            onMouseLeave={(e) => { if (onLogoUpload) (e.currentTarget as HTMLImageElement).style.border = '2px dashed transparent'; }}
          />
          {logoUploading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.7)', borderRadius: 4, fontSize: 10 }}>
              Uploading…
            </div>
          )}
        </div>

        {/* Arabic right - use only arabic_* fields, show em dash if missing */}
        <div style={{ flex: 1, direction: 'rtl', textAlign: 'right', fontFamily: "'Cairo', sans-serif" }}>
          <strong style={{ fontSize: 15 }}>{schoolInfo.arabic_name || '—'}</strong>
          {schoolInfo.arabic_motto ? (
            <div style={{ fontSize: 10, fontStyle: 'italic', color: '#555' }}>{schoolInfo.arabic_motto}</div>
          ) : (
            <div style={{ fontSize: 10, fontStyle: 'italic', color: '#bbb' }}>—</div>
          )}
          <div style={{ fontSize: 11 }}>
            {schoolInfo.arabic_address || '—'}
            {schoolInfo.arabic_po_box ? `، ${schoolInfo.arabic_po_box}` : ''}
          </div>
          <div style={{ fontSize: 11 }}>هاتف: {schoolInfo.arabic_contact || '—'}</div>
          <div style={{ fontSize: 11 }}>البريد: {schoolInfo.email || '—'}</div>
          <div style={{ fontSize: 11 }}>رقم مركز يونيب: {schoolInfo.arabic_center_no || '—'}</div>
          <div style={{ fontSize: 11 }}>رقم التسجيل: {schoolInfo.arabic_registration_no || '—'}</div>
        </div>
      </div>

      {/* ── Banner ── */}
      <div
        style={{
          backgroundColor: layout.banner.backgroundColor,
          color: layout.banner.color,
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: layout.banner.fontSize,
          padding: layout.banner.padding,
          marginBottom: 8,
          borderRadius: layout.banner.borderRadius,
          letterSpacing: layout.banner.letterSpacing,
          textTransform: layout.banner.textTransform,
        }}
      >
        {reportTypeName} REPORT &nbsp;|&nbsp; تقرير المنهج المزدوج
      </div>

      {/* ── Student Info: English LEFT | Arabic RIGHT ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          border: layout.studentInfoBox.border,
          borderRadius: layout.studentInfoBox.borderRadius,
          padding: layout.studentInfoBox.padding,
          background: layout.studentInfoBox.background,
          boxShadow: layout.studentInfoBox.boxShadow,
          marginBottom: 12,
          fontSize: 13,
        }}
      >
        {/* English */}
        <div style={{ flex: 1, direction: 'ltr' }}>
          <div>
            <strong>Name:</strong>{' '}
            <span style={infoValueStyle}>
              {student.first_name} {student.last_name}
            </span>
          </div>
          <div>
            <strong>Class:</strong>{' '}
            <span style={infoValueStyle}>{student.class_name}</span>
          </div>
          <div>
            <strong>Gender:</strong>{' '}
            <span style={infoValueStyle}>{student.gender || '—'}</span>
          </div>
          <div>
            <strong>Stream:</strong>{' '}
            <span style={infoValueStyle}>{student.stream_name || 'A'}</span>
          </div>
          <div>
            <strong>Term:</strong>{' '}
            <span style={infoValueStyle}>{termLabel}</span>
          </div>
        </div>

        {/* Arabic */}
        <div style={{ flex: 1, direction: 'rtl', textAlign: 'right' }}>
          <div>
            <strong>الاسم:</strong>{' '}
            <span style={infoValueStyle}>
              {student.first_name} {student.last_name}
            </span>
          </div>
          <div>
            <strong>الفصل:</strong>{' '}
            <span style={infoValueStyle}>{student.class_name}</span>
          </div>
          <div>
            <strong>الجنس:</strong>{' '}
            <span style={infoValueStyle}>
              {student.gender === 'Male' ? 'ذكر' : student.gender === 'Female' ? 'أنثى' : '—'}
            </span>
          </div>
          <div>
            <strong>الشعبة:</strong>{' '}
            <span style={infoValueStyle}>{student.stream_name || 'أ'}</span>
          </div>
          <div>
            <strong>الفصل الدراسي:</strong>{' '}
            <span style={infoValueStyle}>{termLabel}</span>
          </div>
        </div>
      </div>

      {/* ── Dual Subject Tables: SECULAR (left) | THEOLOGY (right) ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <SubjectTable
          title="Secular Subjects / المواد العلمانية"
          subjects={secularSubjects}
          lang="en"
          isEndOfTerm={isEndOfTerm}
          enableMarkConversion={enableMarkConversion}
          layout={layout}
        />

        {/* Vertical divider */}
        <div
          style={{
            width: 2,
            background: '#ccc',
            alignSelf: 'stretch',
            flexShrink: 0,
          }}
        />

        <SubjectTable
          title="المواد الدينية / Theology Subjects"
          subjects={theologySubjects}
          lang="ar"
          isEndOfTerm={isEndOfTerm}
          enableMarkConversion={enableMarkConversion}
          layout={layout}
        />
      </div>

      {/* ── General Assessment ── */}
      <div
        style={{
          marginTop: 12,
          border: layout.assessmentBox.border,
          borderRadius: layout.assessmentBox.borderRadius,
          padding: layout.assessmentBox.padding,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        {/* English side */}
        <div style={{ flex: 1, direction: 'ltr' }}>
          {!isNursery ? (
            <>
              <div>
                <strong>Aggregates:</strong>{' '}
                <span contentEditable suppressContentEditableWarning style={{ cursor: 'text' }}>
                  {aggregates}
                </span>
              </div>
              <div>
                <strong>Division:</strong>{' '}
                <span contentEditable suppressContentEditableWarning style={{ cursor: 'text' }}>
                  {division}
                </span>
              </div>
            </>
          ) : (
            <div>
              <strong>Overall Grade:</strong>{' '}
              <span contentEditable suppressContentEditableWarning style={{ cursor: 'text' }}>
                {nurseryOverallGrade}
              </span>
            </div>
          )}
        </div>

        {/* Arabic side */}
        <div style={{ flex: 1, direction: 'rtl', textAlign: 'right' }}>
          {!isNursery ? (
            <>
              <div>
                <strong>المجموع:</strong> {aggregates}
              </div>
              <div>
                <strong>المرتبة:</strong> {division}
              </div>
            </>
          ) : (
            <div>
              <strong>الدرجة الكلية:</strong> {nurseryOverallGrade}
            </div>
          )}
        </div>
      </div>

      {/* ── Comments / Remarks ── */}
      <div
        style={{
          marginTop: layout.comments.marginTop,
          borderTop: layout.comments.borderTop,
          paddingTop: layout.comments.paddingTop,
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontWeight: 'bold',
              background: layout.comments.ribbon.background,
              color: layout.comments.ribbon.color,
              padding: layout.comments.ribbon.padding,
              borderRadius: layout.comments.ribbon.borderRadius,
              marginRight: 8,
            }}
          >
            Class Teacher / معلم الفصل:
          </span>
          <span
            contentEditable
            suppressContentEditableWarning
            style={{
              color: layout.comments.text.color,
              fontStyle: 'italic',
              borderBottom: layout.comments.text.borderBottom,
              cursor: 'text',
            }}
          >
            {student.class_teacher_comment || '—'}
          </span>
        </div>

        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              fontWeight: 'bold',
              background: layout.comments.ribbon.background,
              color: layout.comments.ribbon.color,
              padding: layout.comments.ribbon.padding,
              borderRadius: layout.comments.ribbon.borderRadius,
              marginRight: 8,
            }}
          >
            Headteacher / مدير المدرسة:
          </span>
          <span
            contentEditable
            suppressContentEditableWarning
            style={{
              color: layout.comments.text.color,
              fontStyle: 'italic',
              borderBottom: layout.comments.text.borderBottom,
              cursor: 'text',
            }}
          >
            {student.headteacher_comment || '—'}
          </span>
        </div>

        {/* Next Term */}
        <div style={{ marginTop: 12 }}>
          <div
            contentEditable
            suppressContentEditableWarning
            style={{ textDecoration: 'underline dashed', display: 'inline-block', cursor: 'text' }}
            onBlur={(e) =>
              onNextTermChange(e.currentTarget.textContent?.trim() || nextTermBegins)
            }
          >
            {nextTermBegins}
          </div>
          <div style={{ textDecoration: 'underline dashed', fontSize: 11 }}>
            Next Term Begins / بداية الفصل القادم
          </div>
        </div>
      </div>
    </div>
  );
}
