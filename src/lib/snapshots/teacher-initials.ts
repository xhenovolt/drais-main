export interface SnapshotTeacherInitialsInput {
  teacherInitials?: string | null;
  teacherName?: string | null;
  teachersAll?: string | null;
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

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0])
    .join('')
    .toUpperCase();
}

function resolveNameSegments(value: string): string[] {
  return value
    .split(/\s*\/\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function resolveSnapshotTeacherInitials(input: SnapshotTeacherInitialsInput): string {
  const explicit = normalizeInitialsValue(input.teacherInitials);
  if (explicit) return explicit;

  const singleName = (input.teacherName ?? '').toString().trim();
  if (singleName) return initialsFromName(singleName);

  const multiName = normalizeInitialsValue(input.teachersAll);
  if (!multiName) return '';

  return resolveNameSegments(multiName)
    .map((segment) => initialsFromName(segment))
    .filter(Boolean)
    .join(' / ');
}
