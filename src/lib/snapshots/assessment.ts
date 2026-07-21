import { isReligiousEducationSubject } from '@/lib/theology-subject-classifier';

interface AssessmentSubjectLike {
  id?: string | number | null;
  name?: string | null;
  subjectType?: string | null;
  department?: string | null;
  subjectGroup?: string | null;
}

interface AssessmentResultLike {
  subjectId?: string | number | null;
  subjectName?: string | null;
  subject?: AssessmentSubjectLike | null;
  subjectType?: string | null;
}

interface AssessmentSubjectSource {
  id?: string | number | null;
  name?: string | null;
  displayName?: string | null;
  subjectType?: string | null;
  department?: string | null;
  subjectGroup?: string | null;
}

function normalizeSubjectType(value?: string | null): string {
  return String(value ?? '').trim().toLowerCase();
}

function isContributingSubject(subject: AssessmentSubjectLike | null | undefined): boolean {
  if (!subject) return false;
  if (isReligiousEducationSubject(subject.name ?? '')) return false;
  const type = normalizeSubjectType(subject.subjectType);
  return ['principal', 'core', 'primary', 'theology', 'islamic', 'religion'].includes(type);
}

export function getContributingAssessmentResults<T extends AssessmentResultLike>(
  results: readonly T[] | null | undefined,
  subjects: readonly AssessmentSubjectSource[] | null | undefined,
): T[] {
  if (!results?.length) return [];

  const subjectLookup = new Map<string, AssessmentSubjectSource>();
  for (const subject of subjects ?? []) {
    if (subject?.id != null) {
      subjectLookup.set(String(subject.id), subject);
    }
  }

  return results.filter((result) => {
    const subjectId = result.subjectId ?? result.subject?.id;
    const subject = subjectId != null
      ? subjectLookup.get(String(subjectId)) ?? result.subject
      : result.subject;

    if (!subject) return false;
    return isContributingSubject(subject);
  });
}
