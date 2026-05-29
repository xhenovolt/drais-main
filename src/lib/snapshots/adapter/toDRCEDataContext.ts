/**
 * Snapshot -> DRCEDataContext adapter.
 *
 * Pure function. Takes one student from a snapshot and shapes it for the
 * DRCE renderer (src/components/drce/DRCEDocumentRenderer.tsx) to consume
 * without any further computation.
 *
 * The midTermScore/endTermScore split that DRCE expects does not exist in
 * the snapshot (snapshots normalize a single score per subject), so we
 * route the snapshot's `score` to `endTermScore` and leave `midTermScore`
 * null. This matches the legacy reports-page behaviour for snapshots
 * generated against an "End of term" result type.
 */
import type {
  DRCEAssessmentData,
  DRCECommentsData,
  DRCEDataContext,
  DRCEMetaContext,
  DRCEResultRow,
  DRCEStudentData,
  DRCESubject,
  Language,
} from '@/lib/drce/schema';
import type { ReportSnapshot } from '../types';

export interface SchoolMetaForRender {
  schoolName:       string;
  schoolAddress?:   string;
  schoolContact?:   string;
  schoolEmail?:     string;
  centerNo?:        string;
  registrationNo?:  string;
  arabicName?:      string | null;
  arabicAddress?:   string | null;
  logoUrl?:         string | null;
  reportTitle?:     string;
}

export function snapshotToDRCEDataContext(
  snapshot: ReportSnapshot,
  classIdx: number,
  studentIdx: number,
  schoolMeta: SchoolMetaForRender,
  /**
   * Phase 3.1 — subject ids to drop from the student's `results` array.
   * Sourced from override layer (`hide_subject` overrides) via the
   * `__hiddenSubjectIds` hint left on the DRCEDocument by `applyOverrides`.
   * Snapshot data itself is NEVER mutated.
   */
  hiddenSubjectIds: readonly string[] = [],
): DRCEDataContext {
  const cls = snapshot.classes[classIdx];
  if (!cls) throw new Error(`Class index ${classIdx} out of range`);
  const stu = cls.students[studentIdx];
  if (!stu) throw new Error(`Student index ${studentIdx} out of range`);

  const hidden = new Set(hiddenSubjectIds.map(String));

  const subjects: DRCESubject[] = cls.subjects
    .filter(s => !hidden.has(String(s.id)))
    .map(s => ({
      id:          s.id,
      name:        s.displayName || s.name,
      totalMarks:  s.totalMarks,
      subjectType: s.subjectType,
    }));

  const results: DRCEResultRow[] = stu.results
    .filter(r => !hidden.has(String(r.subjectId)))
    .map(r => {
    const subj = cls.subjects.find(s => s.id === r.subjectId);
    // CAFE Phase 2 — additive binding surface. Templates can read either:
    //   • `result.score` / `result.total` / `result.grade` (legacy, polyfilled)
    //   • `result.components` (array of per-component scores)
    //   • `result.component.<code>` (looked up by component code)
    //   • `result.competencyLevel` (highest gradeCode among components)
    // Legacy fields are populated for every result; new fields are populated
    // only when CAFE component data exists for this (student, subject).
    const components = r.components;
    const componentMap: Record<string, unknown> = {};
    let competencyLevel: string | null = null;
    if (components?.length) {
      for (const c of components) {
        componentMap[c.code] = {
          score:      c.score,
          valueText:  c.valueText,
          gradeCode:  c.gradeCode,
          weight:     c.weight,
          display:    c.displayScore,
        };
      }
      // Highest-rank grade among components becomes the competency level.
      // Convention: empty/undefined codes sort last; alphabetical fallback.
      const codes = components.map(c => c.gradeCode).filter((g): g is string => !!g).sort();
      competencyLevel = codes[0] ?? null;
    }
    return {
      subjectName:  r.displaySubject || r.subjectName,
      midTermScore: null,
      endTermScore: r.score,
      total:        r.score,
      grade:        r.grade,
      comment:      r.remarks,
      initials:     r.initials,
      teacherName:  r.teacherName ?? '',
      subjectType:  subj?.subjectType ?? 'primary',
      subject: subj
        ? {
            id:          subj.id,
            name:        subj.displayName || subj.name,
            totalMarks:  subj.totalMarks,
            subjectType: subj.subjectType,
          }
        : undefined,
      // CAFE bindings — empty/null when no component data for this result.
      components:       components ?? null,
      component:        componentMap,
      competencyLevel,
    } as DRCEResultRow & {
      components: typeof components | null;
      component:  Record<string, unknown>;
      competencyLevel: string | null;
    };
  });

  // P1 — custom field values surface as `student.custom.<code>` in DRCE
  // templates. Snapshot stores them at top-level keyed by studentDbId
  // (outside meta.dataHash). Empty object (rather than undefined) keeps
  // binding lookups safe when the school has no custom fields yet.
  const customForStudent = snapshot.customValues?.[stu.studentDbId] ?? {};

  const student: DRCEStudentData = {
    fullName:    stu.name,
    firstName:   stu.firstName,
    lastName:    stu.lastName,
    gender:      stu.gender,
    className:   cls.className,
    streamName:  cls.stream,
    admissionNo: stu.admissionNumber || stu.id,
    photoUrl:    stu.photoUrl,
    dateOfBirth: null,
    custom:      customForStudent,
  };

  const assessment: DRCEAssessmentData = {
    classPosition:  stu.position || null,
    streamPosition: stu.position || null,
    aggregates:     stu.aggregates ?? Math.round(stu.total) ?? null,
    division:       stu.division ?? null,
    totalStudents:  stu.totalInClass || null,
    position:       stu.totalInClass
      ? `${stu.position} / ${stu.totalInClass}`
      : (stu.position ? String(stu.position) : null),
  };

  const comments: DRCECommentsData = {
    classTeacher: stu.comments?.classTeacher ?? '',
    dos:          stu.comments?.dos ?? '',
    headTeacher:  stu.comments?.headTeacher ?? '',
  };

  const meta: DRCEMetaContext = {
    schoolName:       schoolMeta.schoolName || snapshot.meta.schoolName,
    schoolAddress:    schoolMeta.schoolAddress    ?? '',
    schoolContact:    schoolMeta.schoolContact    ?? '',
    schoolEmail:      schoolMeta.schoolEmail      ?? '',
    centerNo:         schoolMeta.centerNo         ?? '',
    registrationNo:   schoolMeta.registrationNo   ?? '',
    arabicName:       schoolMeta.arabicName       ?? null,
    arabicAddress:    schoolMeta.arabicAddress    ?? null,
    logoUrl:          schoolMeta.logoUrl          ?? null,
    term:             snapshot.meta.termName,
    year:             snapshot.meta.yearName,
    reportTitle:      schoolMeta.reportTitle ?? `${snapshot.meta.type} report`,
    nextTermBegins:   snapshot.config.nextTermBegins,
    // Academic-calendar enrichment (Phase B wiring). Populated when the
    // snapshot was generated with calendar inference; undefined on legacy
    // snapshots — computed fields fall back to nextTermBegins above.
    calendar:         snapshot.config.calendar,
  };

  const language: Language = snapshot.meta.language;

  return { student, results, subjects, assessment, comments, meta, language };
}
