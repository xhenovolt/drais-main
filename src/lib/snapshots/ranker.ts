/**
 * Deterministic per-class ranking, extracted from the legacy
 * src/app/academics/reports/page.tsx:677-750 useMemo block.
 *
 * Determinism rules:
 *   - Sort is stable on tie-breaker chain: total -> average -> lastName ->
 *     firstName -> studentDbId.
 *   - No `Math.random`, no clock reads.
 *   - Default mode is 'numeric' so every existing snapshot regenerates
 *     identically.
 */
import type { SnapshotStudent, RankingMode } from './types';

/**
 * Rank a single class's students. Mutates each student's `position`,
 * `total`, `average`, and `totalInClass` fields in place.
 *
 * Students whose `results` are empty after curriculum filtering keep
 * total/average=0; they sort to the bottom but remain present so the
 * snapshot accurately reflects who has no marks.
 *
 * `mode` (CAFE Phase 2) controls the strategy:
 *   • 'numeric'    — legacy: sum scores, sort desc, 1..N positions.
 *   • 'competency' — same sort, but ties share the same rank (competency
 *                    systems intentionally cluster — three "Accomplished"
 *                    students each take rank 1).
 *   • 'none'       — skip ranking entirely: positions stay 0, the snapshot
 *                    keeps a deterministic alphabetical order so dataHash
 *                    is still stable.
 */
export function rankStudents(students: SnapshotStudent[], mode: RankingMode = 'numeric'): void {
  // Totals + averages are computed in every mode so DRCE bindings
  // (`student.total`, `student.average`) keep working even under 'none'.
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

  if (mode === 'none') {
    // Pure competency mode — no positions. Sort alphabetically so the
    // serialised snapshot is still deterministic.
    students.sort((a, b) => a.lastName.localeCompare(b.lastName)
      || a.firstName.localeCompare(b.firstName)
      || a.studentDbId - b.studentDbId);
    const totalInClass = students.length;
    students.forEach(stu => { stu.position = 0; stu.totalInClass = totalInClass; });
    return;
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

  if (mode === 'competency') {
    // Tie-aware ranking: students with the same total share the same rank
    // (1, 1, 1, 4, 5 — competition-style positions). Sort tie-breakers are
    // applied above so ties between two students with identical totals
    // collapse to the same rank in the order they emerge.
    let lastTotal: number | null = null;
    let lastRank  = 0;
    students.forEach((stu, idx) => {
      const r = stu.total === lastTotal ? lastRank : idx + 1;
      stu.position     = r;
      stu.totalInClass = totalInClass;
      lastTotal = stu.total;
      lastRank  = r;
    });
    return;
  }

  // 'numeric' — legacy strict 1..N positions.
  students.forEach((stu, idx) => {
    stu.position     = idx + 1;
    stu.totalInClass = totalInClass;
  });
}
