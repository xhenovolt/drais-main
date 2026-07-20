export type ContributionPolicy = 'compulsory' | 'elective' | 'optional' | 'ignored' | 'best-of-n' | 'ministry';

export interface ContributionSubject {
  id: number;
  name: string;
  score: number | null;
  contributionPolicy?: ContributionPolicy;
  isReligiousEducation?: boolean;
}

export interface DivisionConfig {
  boundaries: number[];
  labels: string[];
}

export interface ReportInitialsContext {
  manualInitials?: string | null;
  allocationInitials?: string | null;
  teacherName?: string | null;
  teacherInitials?: string | null;
}

export interface TeacherInitialsSyncMessage {
  type: 'teacher-initials-updated';
  values: Record<string, string>;
  storageKey?: string;
}

export function createTeacherInitialsSyncMessage(values: Record<string, string>, storageKey?: string): TeacherInitialsSyncMessage {
  return {
    type: 'teacher-initials-updated',
    values,
    ...(storageKey ? { storageKey } : {}),
  };
}

export function resolveTeacherInitials(ctx: ReportInitialsContext): string {
  const value = (ctx.manualInitials ?? '').toString().trim();
  if (value) return value;

  const allocation = (ctx.allocationInitials ?? '').toString().trim();
  if (allocation) return allocation;

  const teacher = (ctx.teacherName ?? '').trim();
  if (teacher) {
    const initials = teacher
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => token[0])
      .join('')
      .toUpperCase();
    if (initials) return initials;
  }

  return (ctx.teacherInitials ?? '').toString().trim() || 'N/A';
}

export function selectContributingSubjects(subjects: ContributionSubject[]): ContributionSubject[] {
  return subjects.filter((subject) => {
    const policy = (subject.contributionPolicy ?? 'compulsory').toLowerCase();
    if (policy === 'ignored') return false;
    if (subject.isReligiousEducation) return false;
    if (policy === 'compulsory') return true;
    if (policy === 'elective' || policy === 'optional' || policy === 'ministry' || policy === 'best-of-n') {
      return false;
    }
    return !subject.isReligiousEducation;
  });
}

export function computeDivision(aggregate: number, config: DivisionConfig): string {
  const boundaries = config.boundaries ?? [];
  const labels = config.labels ?? [];
  for (let index = 0; index < boundaries.length; index += 1) {
    if (aggregate <= boundaries[index]) {
      return labels[index] ?? 'Division U';
    }
  }
  return labels[labels.length - 1] ?? 'Division U';
}
