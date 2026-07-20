export interface SnapshotTeacherInitialsInput {
  teacherInitials?: string | null;
  teacherName?: string | null;
  teachersAll?: string | null;
}

function initialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0])
    .join('')
    .toUpperCase();
}

export function resolveSnapshotTeacherInitials(input: SnapshotTeacherInitialsInput): string {
  const explicit = (input.teacherInitials ?? '').toString().trim();
  if (explicit) return explicit;

  const singleName = (input.teacherName ?? '').toString().trim();
  if (singleName) return initialsFromName(singleName);

  const multiName = (input.teachersAll ?? '').toString().trim();
  if (!multiName) return '';

  return multiName
    .split(/\s*\/\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => initialsFromName(segment))
    .filter(Boolean)
    .join(' / ');
}
