/**
 * A subject type code (core / elective / tahfiz / extra) as shown: English keeps the code capitalised
 * as before, Arabic shows its name (academicsPages.subjects.type.*). Unknown codes are shown as stored.
 */
export function subjectTypeLabel(t: (key: string, fallback?: string) => string, code: string | null | undefined): string {
  const v = String(code ?? '');
  if (!v) return '';
  return t(`academicsPages.subjects.type.${v.toLowerCase()}`, v);
}
