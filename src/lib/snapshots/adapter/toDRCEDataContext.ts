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
import { displaySubjectComment } from '../grader';
import { computeAssessmentRawValues } from '@/lib/drce/assessmentUtils';
import { isReligiousEducationSubject } from '@/lib/theology-subject-classifier';

function isIslamicReligiousEducationSubject(name?: string): boolean {
  return isReligiousEducationSubject(name);
}

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

export interface VerifyContext {
  /** Snapshot-level verification URL — used by the QR shape's default
   *  binding (`meta.verificationUrl`). Same URL for every student in a
   *  snapshot; signals "this snapshot is authentic". */
  snapshotUrl?: string;
  /** Per-student verification URL — overrides snapshotUrl when set, so
   *  per-learner QR codes encode a token that carries the studentDbId
   *  alongside the snapshotId. Resolves via `student.verificationUrl`. */
  studentUrl?: string;
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
  /**
   * Phase L1 — anti-forgery. When provided, the URLs are mirrored into
   * the data context so QR / barcode shapes bound to
   *   meta.verificationUrl
   *   student.verificationUrl
   * resolve to scannable proof-of-authenticity links.
   */
  verifyCtx: VerifyContext = {},
): DRCEDataContext {
  const cls = snapshot.classes[classIdx];
  if (!cls) throw new Error(`Class index ${classIdx} out of range`);
  const stu = cls.students[studentIdx];
  if (!stu) throw new Error(`Student index ${studentIdx} out of range`);

  const hidden = new Set(hiddenSubjectIds.map(String));
  const teacherMapExact: Record<string, string> = {};

  try {
    const cfgMaps = (snapshot.config && Array.isArray(snapshot.config.teacherMappings)) ? snapshot.config.teacherMappings : [];
    for (const m of cfgMaps) {
      for (const c of snapshot.classes || []) {
        for (const s of c.subjects || []) {
          const subjName = (s.displayName || s.name || '').toLowerCase();
          const clsName = (c.className || '').toLowerCase();
          const subjMatch = !m.subjectPattern || subjName.includes(m.subjectPattern.toLowerCase());
          const clsMatch = !m.classPattern || m.classPattern === 'all' || clsName.includes(m.classPattern.toLowerCase());
          if (subjMatch && clsMatch) {
            teacherMapExact[`${c.classId}-${s.id}`] = m.initials;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed to build teacherMapExact from snapshot.config.teacherMappings', e);
  }

  const subjects: DRCESubject[] = cls.subjects
    .filter(s => !hidden.has(String(s.id)))
    .map(s => ({
      id:          s.id,
      name:        s.displayName || s.name,
      totalMarks:  s.totalMarks,
      subjectType: isIslamicReligiousEducationSubject(s.name) ? 'primary' : s.subjectType,
      department:   s.department ?? '',
      subjectGroup: s.subjectGroup ?? '',
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
    const resolvedComment = displaySubjectComment(r.remarks, r.score, snapshot.meta.language);
    const derivedInitials = ((): string | undefined => {
      // Prefer exact mapping by classId+subjectId, then any statically stored
      // initials on the result, then derive from teacherName.
      const exactKey = `${cls.classId}-${r.subjectId}`;
      if (teacherMapExact[exactKey]) return teacherMapExact[exactKey];
      if (r.initials && String(r.initials).trim()) return String(r.initials).trim();
      if (r.teacherName) return String(r.teacherName).split(' ').map((n: string) => n[0]).join('');
      return undefined;
    })();

    return {
      subjectName:  r.displaySubject || r.subjectName,
      midTermScore: null,
      endTermScore: r.score,
      total:        r.score,
      grade:        r.grade,
      comment:      resolvedComment,
      initials:     derivedInitials ?? r.initials,
      teacherName:  r.teacherName ?? '',
      // Phase 7 — allocation-derived bindings (empty string on legacy snapshots).
      primaryTeacher: r.teacherName ?? '',
      teachers:       r.teachersAll ?? r.teacherName ?? '',
      department:     subj?.department ?? '',
      subjectGroup:   subj?.subjectGroup ?? '',
      subjectComment: resolvedComment,
      subjectType:  subj?.subjectType ?? 'primary',
      subject: subj
        ? {
            id:          subj.id,
            name:        subj.displayName || subj.name,
            totalMarks:  subj.totalMarks,
            subjectType: subj.subjectType,
            department:   subj.department ?? '',
            subjectGroup: subj.subjectGroup ?? '',
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

  // Build final teacherMappings array to surface into the DRCE data context.
  const teacherMappings: import('@/lib/drce/schema').DRCETeacherMapping[] = [];
  try {
    // Start from snapshot.config mappings (if present)
    const cfgMaps = (snapshot.config && Array.isArray(snapshot.config.teacherMappings)) ? snapshot.config.teacherMappings : [];
    for (const m of cfgMaps) {
      teacherMappings.push({
        id: `cfg-${String(Math.random()).slice(2,8)}`,
        subjectPattern: m.subjectPattern || '',
        classPattern: m.classPattern || '',
        initials: m.initials || '',
        teacherName: '',
      });
    }
    // Add exact per-class/subject mappings discovered above
    for (const key of Object.keys(teacherMapExact)) {
      const [classId, subjectId] = key.split('-');
      teacherMappings.push({
        id: `exact-${key}`,
        subjectPattern: String(subjectId),
        classPattern: String(classId),
        initials: teacherMapExact[key],
        teacherName: '',
      });
    }
  } catch (e) {
    console.warn('Failed to assemble teacherMappings for DRCE context', e);
  }

  // P1 — custom field values surface as `student.custom.<code>` in DRCE
  // templates. Snapshot stores them at top-level keyed by studentDbId
  // (outside meta.dataHash). Empty object (rather than undefined) keeps
  // binding lookups safe when the school has no custom fields yet.
  const customForStudent = snapshot.customValues?.[stu.studentDbId] ?? {};

  // CAFE Phase 4 — surface framework metadata as `student.cafe.*` bindings.
  // Inferred from the presence of components on this student's results:
  // if any result has components, this learner was assessed under a CAFE
  // framework. The framework's name/mode aren't yet stored on the snapshot
  // itself, so we derive a sensible label from the snapshot config and the
  // observed component count. Phase 5 will persist the resolved framework
  // on the snapshot at generation time so this becomes authoritative.
  const hasCAFEData = stu.results.some(r => (r as { components?: unknown[] }).components?.length);
  const cafe = hasCAFEData
    ? {
        frameworkName: 'CAFE Framework',  // overwritten below if config.cafeFrameworkName set
        frameworkMode: snapshot.config?.rankingMode === 'none' ? 'descriptor' : 'mixed',
      }
    : null;
  const cfgCafe = (snapshot.config as unknown as { cafeFrameworkName?: string; cafeFrameworkMode?: string });
  if (cafe && cfgCafe?.cafeFrameworkName) cafe.frameworkName = cfgCafe.cafeFrameworkName;
  if (cafe && cfgCafe?.cafeFrameworkMode) cafe.frameworkMode = cfgCafe.cafeFrameworkMode;

  // CAFE Phase 5 — student-level generic skills + project portfolio.
  // Snapshot stores them at top-level keyed by studentDbId (outside the
  // dataHash window) so adding the data never invalidates historical hashes.
  const genericSkills = snapshot.genericSkills?.[stu.studentDbId] ?? [];
  const projects      = snapshot.projects?.[stu.studentDbId]      ?? [];

  // Batch 5 — when the report language is Arabic, the default name/class
  // bindings resolve to Arabic (English fallback) so existing templates render
  // Arabic without rebinding. Explicit *Ar / *En fields are also exposed for
  // templates that want a specific language regardless of report language.
  const isAr = snapshot.meta.language === 'ar';
  const fullNameAr = stu.nameAr || stu.name;
  const classNameAr = cls.classNameAr || cls.className;
  const streamNameAr = cls.streamAr || cls.stream;
  const student: DRCEStudentData & {
    cafe?:          { frameworkName: string; frameworkMode: string };
    genericSkills?: typeof genericSkills;
    projects?:      typeof projects;
    verificationUrl?: string;
    fullNameAr?:    string;
    fullNameEn?:    string;
    classNameAr?:   string;
  } = {
    fullName:    isAr ? fullNameAr : stu.name,
    fullNameAr,
    fullNameEn:  stu.name,
    firstName:   isAr ? (stu.firstNameAr || stu.firstName) : stu.firstName,
    lastName:    isAr ? (stu.lastNameAr || stu.lastName) : stu.lastName,
    gender:      stu.gender,
    className:   isAr ? classNameAr : cls.className,
    classNameAr,
    streamName:  isAr ? streamNameAr : cls.stream,
    admissionNo: stu.admissionNumber || stu.id,
    photoUrl:    stu.photoUrl,
    dateOfBirth: null,
    custom:      customForStudent,
    ...(cafe ? { cafe } : {}),
    // Always expose the keys (empty array when no data) so template authors
    // don't see undefined; section components handle empty arrays gracefully.
    genericSkills,
    projects,
    // Phase L1 — per-learner verify URL. Falls back to snapshot-level
    // URL so a QR template authored before the per-student endpoint
    // existed still resolves to a valid (but coarser) verify link.
    ...(verifyCtx.studentUrl || verifyCtx.snapshotUrl
      ? { verificationUrl: verifyCtx.studentUrl || verifyCtx.snapshotUrl }
      : {}),
  };

  // Filter results to only principal/core/primary subjects for aggregates
  const principalResults = results.filter(r => {
    const subj = cls.subjects.find(s => s.id === r.subject?.id || s.id === r.subjectId);
    if (!subj) return false;
    const type = (subj.subjectType || 'primary').toLowerCase();
    return type === 'principal' || type === 'core' || type === 'primary' || type === 'theology' || type === 'islamic' || type === 'religion';
  });

  const computedAssessment = computeAssessmentRawValues(principalResults);
  const assessment: DRCEAssessmentData = {
    classPosition:  stu.position || null,
    streamPosition: stu.position || null,
    aggregates:     computedAssessment.aggregate,
    division:       computedAssessment.division,
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

  const meta: DRCEMetaContext & { verificationUrl?: string } = {
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
    nextTermBegins:   snapshot.config?.nextTermBegins ?? '',
    // Academic-calendar enrichment (Phase B wiring). Populated when the
    // snapshot was generated with calendar inference; undefined on legacy
    // snapshots — computed fields fall back to nextTermBegins above.
    calendar:         snapshot.config.calendar,
    // Phase L1 — snapshot-level verify URL. Resolves the QR shape's
    // default binding `meta.verificationUrl`.
    ...(verifyCtx.snapshotUrl ? { verificationUrl: verifyCtx.snapshotUrl } : {}),
  };

  const language: Language = snapshot.meta.language;

  return { student, results, subjects, assessment, comments, meta, language, teacherMappings } as unknown as DRCEDataContext;
}
