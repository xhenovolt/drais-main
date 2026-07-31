import type { DRCEDocument, DRCEDataContext, DRCESection, DRCEAssessmentSection } from '@/lib/drce/schema';
import type { DRCERenderContext } from '@/components/drce/types';
import type { PersistedOverride } from '@/lib/drce/overrides';
import { applyOverrides, readHiddenSubjectIds, selectOverridesForStudent } from '@/lib/drce/overrides';
import { snapshotToDRCEDataContext } from '@/lib/snapshots/adapter/toDRCEDataContext';
import type { ReportSnapshot } from './types';
import type { VerifyContext } from './adapter/toDRCEDataContext';
import { resolveAssessmentForSection } from '@/lib/drce/assessmentUtils';
import { isNurseryClassName } from '@/lib/reports/canonical-report-engine';
import { resolveAllOverallComments, type CommentBankRule, type CommentResolutionCtx } from '@/lib/drce/commentEngine';

function findAssessmentSection(doc: DRCEDocument): DRCEAssessmentSection | undefined {
  const flat: DRCESection[] = (doc as unknown as { pages?: Array<{ sections: DRCESection[] }> }).pages?.length
    ? (doc as unknown as { pages: Array<{ sections: DRCESection[] }> }).pages.flatMap((p) => p.sections)
    : doc.sections;
  return flat.find((s): s is DRCEAssessmentSection => s.type === 'assessment');
}

export interface SnapshotRenderState {
  snapshot: ReportSnapshot;
  document: DRCEDocument;
  classIdx: number;
  studentIdx: number;
  student: ReportSnapshot['classes'][number]['students'][number];
  overrides: readonly PersistedOverride[];
  hiddenSubjectIds: readonly string[];
  dataCtx: DRCEDataContext;
  renderCtx: DRCERenderContext;
}

export function freezeSnapshot<T>(value: T): T {
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      for (const item of value) freezeSnapshot(item);
    } else {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        freezeSnapshot((value as Record<string, unknown>)[key]);
      }
    }
    return Object.freeze(value);
  }
  return value;
}

export function buildSnapshotRenderState(args: {
  snapshot: ReportSnapshot;
  document: DRCEDocument;
  classIdx: number;
  studentIdx: number;
  overrides: readonly PersistedOverride[];
  renderCtx: DRCERenderContext;
  verifyCtx?: VerifyContext;
  /**
   * Overall-comment rules scoped to THIS document (unscoped + matching
   * template_id), fetched fresh by the caller. When provided, overall
   * comments are RE-resolved here against the actual template being
   * rendered, overriding whatever was frozen into the snapshot at
   * generation time. This is a deliberate, documented exception to the
   * snapshot-immutability invariant (RENDER_LAYERS.md) — see
   * src/lib/drce/commentEngine.ts's file header for the accepted tradeoff.
   * Omitted / empty => the frozen snapshot values are used unchanged, same
   * as before this existed.
   */
  overallCommentRules?: CommentBankRule[];
}): SnapshotRenderState {
  const { snapshot, document, classIdx, studentIdx, overrides, renderCtx, verifyCtx, overallCommentRules } = args;
  const frozenSnapshot = freezeSnapshot(snapshot);
  const cls = frozenSnapshot.classes[classIdx];
  const stu = cls?.students[studentIdx];
  if (!cls || !stu) throw new Error(`Invalid class/student index: ${classIdx}/${studentIdx}`);

  const studentOverrides = selectOverridesForStudent(overrides, stu.studentDbId);
  const overriddenDoc = applyOverrides(document, studentOverrides);
  const hiddenSubjectIds = readHiddenSubjectIds(overriddenDoc);

  const schoolMeta = frozenSnapshot.meta.branding
    ? {
        schoolName: frozenSnapshot.meta.branding.schoolName,
        schoolAddress: frozenSnapshot.meta.branding.address,
        schoolContact: frozenSnapshot.meta.branding.phone || frozenSnapshot.meta.branding.email,
        schoolEmail: frozenSnapshot.meta.branding.email,
        centerNo: frozenSnapshot.meta.branding.centerNo,
        registrationNo: frozenSnapshot.meta.branding.registrationNumber,
        arabicName: frozenSnapshot.meta.branding.arabicName,
        arabicAddress: frozenSnapshot.meta.branding.arabicAddress,
        logoUrl: frozenSnapshot.meta.branding.logoUrl,
        reportTitle: `${frozenSnapshot.meta.termName} ${frozenSnapshot.meta.yearName}`,
      }
    : { schoolName: frozenSnapshot.meta.schoolName };

  const dataCtx: DRCEDataContext = snapshotToDRCEDataContext(
    frozenSnapshot,
    classIdx,
    studentIdx,
    schoolMeta,
    hiddenSubjectIds,
    verifyCtx,
  );

  if (overallCommentRules?.length) {
    // Refresh aggregate/division through the SAME per-template config the
    // assessment section itself uses (DRCEDocumentRenderer -> renderSection
    // does the identical call for the 'assessment' section type) — so
    // comment conditions match against what the template actually PRINTS,
    // not the generic value frozen at generation time.
    const isNursery = isNurseryClassName(String(dataCtx.student?.className ?? ''));
    const refreshedAssessment = resolveAssessmentForSection(
      dataCtx.assessment, dataCtx.results, findAssessmentSection(overriddenDoc)?.aggregateConfig, { isNursery },
    );
    const totalPossible = dataCtx.subjects.length * 100;
    const resolutionCtx: CommentResolutionCtx = {
      average: stu.average, total: stu.total, totalPossible,
      percentage: totalPossible > 0 ? (stu.total / totalPossible) * 100 : 0,
      position: stu.position ?? null, totalInClass: stu.totalInClass ?? null,
      aggregate: refreshedAssessment.aggregates ?? null,
      division: refreshedAssessment.division ?? null,
      overallGrade: refreshedAssessment.division ?? null,
      subjects: stu.results.map((r) => ({ id: r.subjectId, name: r.subjectName, score: r.score, grade: r.grade })),
    };
    dataCtx.comments = resolveAllOverallComments(overallCommentRules, resolutionCtx, dataCtx.comments);
  }

  return {
    snapshot: frozenSnapshot,
    document: overriddenDoc,
    classIdx,
    studentIdx,
    student: stu,
    overrides,
    hiddenSubjectIds,
    dataCtx,
    renderCtx,
  };
}
