/**
 * Deterministic per-class ranking, extracted from the legacy
 * src/app/academics/reports/page.tsx:677-750 useMemo block.
 *
 * Determinism rules:
 *   - Sort is stable on tie-breaker chain: total -> average -> lastName ->
 *     firstName -> studentDbId.
 *   - No `Math.random`, no clock reads.
 */
import type { SnapshotStudent } from './types';

/**
 * Rank a single class's students. Mutates each student's `position`,
 * `total`, `average`, and `totalInClass` fields in place.
 *
 * Students whose `results` are empty after curriculum filtering keep
 * total/average=0; they sort to the bottom but remain present so the
 * snapshot accurately reflects who has no marks.
 */
export function rankStudents(students: SnapshotStudent[]): void {
  for (const stu of students) {
    let sum = 0;
    let count = 0;
    for (const r of stu.results) {
      if (r.score !== null && Number.isFinite(r.score)) {
        sum += r.score;
        count++;
      }
    }
    stu.total   = Math.round(sum * 100) / 100;
    stu.average = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
  }

  students.sort((a, b) => {
    if (b.total !== a.total)     return b.total - a.total;
    if (b.average !== a.average) return b.average - a.average;
    const lastCmp = a.lastName.localeCompare(b.lastName);
    if (lastCmp !== 0)           return lastCmp;
    const firstCmp = a.firstName.localeCompare(b.firstName);
    if (firstCmp !== 0)          return firstCmp;
    return a.studentDbId - b.studentDbId;
  });

  const totalInClass = students.length;
  students.forEach((stu, idx) => {
    stu.position     = idx + 1;
    stu.totalInClass = totalInClass;
  });
}
