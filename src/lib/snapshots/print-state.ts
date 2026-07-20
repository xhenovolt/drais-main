import type { DRCEDocument, DRCEDataContext } from '@/lib/drce/schema';
import type { DRCERenderContext } from '@/components/drce/types';
import type { PersistedOverride } from '@/lib/drce/overrides';
import { applyOverrides, readHiddenSubjectIds, selectOverridesForStudent } from '@/lib/drce/overrides';
import { snapshotToDRCEDataContext } from '@/lib/snapshots/adapter/toDRCEDataContext';
import type { ReportSnapshot } from './types';
import type { VerifyContext } from './adapter/toDRCEDataContext';

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
}): SnapshotRenderState {
  const { snapshot, document, classIdx, studentIdx, overrides, renderCtx, verifyCtx } = args;
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
