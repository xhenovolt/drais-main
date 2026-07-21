import { DEFAULT_GRADE_POINT_MAP as DRCE_DEFAULT_GRADE_POINT_MAP } from '@/lib/drce/assessmentUtils';

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

export const DEFAULT_DIVISION_CONFIG: DivisionConfig = {
  boundaries: [12, 24, 28, 32],
  labels: ['Division I', 'Division II', 'Division III', 'Division IV', 'Division U'],
};

export const DEFAULT_REPORT_GRADE_POINT_MAP: Record<string, number> = {
  ...DRCE_DEFAULT_GRADE_POINT_MAP,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
};

export function createTeacherInitialsSyncMessage(values: Record<string, string>, storageKey?: string): TeacherInitialsSyncMessage {
  return {
    type: 'teacher-initials-updated',
    values,
    ...(storageKey ? { storageKey } : {}),
  };
}

function normalizeInitialsValue(value?: string | null): string {
  if (value === undefined || value === null) return '';
  const trimmed = value.toString().trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'none' || trimmed.toLowerCase() === 'n/a') {
    return '';
  }
  return trimmed;
}

export function resolveTeacherInitials(ctx: ReportInitialsContext): string {
  const value = normalizeInitialsValue(ctx.manualInitials);
  if (value) return value;

  const allocation = normalizeInitialsValue(ctx.allocationInitials);
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

  const fallback = normalizeInitialsValue(ctx.teacherInitials);
  return fallback || 'N/A';
}

function normalizeContributionPolicy(value?: string): ContributionPolicy {
  const normalized = String(value ?? 'compulsory').trim().toLowerCase();
  switch (normalized) {
    case 'ignored':
      return 'ignored';
    case 'elective':
      return 'elective';
    case 'optional':
      return 'optional';
    case 'best-of-n':
    case 'bestofn':
      return 'best-of-n';
    case 'ministry':
      return 'ministry';
    default:
      return 'compulsory';
  }
}

export function getGradePoint(grade: string, gradePointMap: Record<string, number> = DEFAULT_REPORT_GRADE_POINT_MAP): number {
  const normalized = String(grade ?? '').trim().toUpperCase();
  return gradePointMap[normalized] ?? 0;
}

export function computeAggregateFromGrades(
  grades: string[],
  gradePointMap: Record<string, number> = DEFAULT_REPORT_GRADE_POINT_MAP,
): number {
  return grades.reduce((sum, grade) => sum + getGradePoint(grade, gradePointMap), 0);
}

export function gradeForScore(score: number, isNursery: boolean = false): string {
  const standardGrade = (() => {
    if (score >= 90) return 'D1';
    if (score >= 80) return 'D2';
    if (score >= 70) return 'C3';
    if (score >= 60) return 'C4';
    if (score >= 50) return 'C5';
    if (score >= 44) return 'C6';
    if (score >= 40) return 'P7';
    if (score >= 34) return 'P8';
    return 'F9';
  })();

  if (!isNursery) return standardGrade;

  if (score >= 90) return 'A';
  if (score >= 70) return 'B';
  if (score >= 50) return 'C';
  if (score >= 40) return 'D';
  return 'E';
}

export function getNurseryOverallGrade(grades: string[]): string {
  if (!grades || grades.length === 0) return 'C';

  const gradeCount: Record<string, number> = {};
  for (const grade of grades) {
    const normalized = String(grade ?? '').trim().toUpperCase();
    if (!normalized) continue;
    gradeCount[normalized] = (gradeCount[normalized] || 0) + 1;
  }

  const entries = Object.entries(gradeCount);
  if (entries.length === 0) return 'C';

  let bestGrade = '';
  let bestCount = 0;
  for (const [grade, count] of entries) {
    if (count > bestCount || (count === bestCount && grade < bestGrade)) {
      bestGrade = grade;
      bestCount = count;
    }
  }

  return bestGrade || 'C';
}

export function isNurseryClassName(className?: string): boolean {
  if (!className) return false;
  const normalized = className.toLowerCase();
  const nurseryKeywords = [
    'nursery',
    'baby',
    'baby class',
    'middle',
    'middle class',
    'top',
    'top class',
    'kindergarten',
    'pre',
    'reception',
    'playgroup',
    'creche',
  ];
  return nurseryKeywords.some(keyword => normalized.includes(keyword));
}

export function selectContributingSubjects(subjects: ContributionSubject[]): ContributionSubject[] {
  return subjects.filter((subject) => {
    const policy = normalizeContributionPolicy(subject.contributionPolicy);
    if (policy === 'ignored') return false;
    if (subject.isReligiousEducation) return false;
    if (policy === 'compulsory') return true;
    return false;
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

function normalizeDivisionLabel(division: string): string {
  const normalized = String(division ?? '').trim().toLowerCase();
  switch (normalized) {
    case 'division 1':
    case 'division i':
      return 'Division I';
    case 'division 2':
    case 'division ii':
      return 'Division II';
    case 'division 3':
    case 'division iii':
      return 'Division III';
    case 'division 4':
    case 'division iv':
      return 'Division IV';
    case 'division u':
      return 'Division U';
    default:
      return division;
  }
}

export function adjustDivisionForF9(division: string, grades: string[], mathFail: boolean = false): string {
  const normalized = normalizeDivisionLabel(division);
  const failCount = (grades || []).filter(g => String(g ?? '').toUpperCase() === 'F9').length;
  if (failCount === 0) return normalized;

  const downgrades: Record<string, string> = {
    'Division I': 'Division II',
    'Division II': 'Division III',
    'Division III': 'Division IV',
    'Division IV': 'Division U',
    'Division U': 'Division U',
  };

  let adjusted = normalized;
  const downgradeSteps = 1 + (mathFail ? 1 : 0);
  for (let i = 0; i < downgradeSteps; i += 1) {
    adjusted = downgrades[adjusted] ?? adjusted;
    if (adjusted === 'Division U') break;
  }

  return adjusted;
}
