/**
 * @drais/repo — the offline-reports slice (Phase 7 sub-effort 20).
 *
 * See contract/types.ts's ReportSnapshotRecord header for the full
 * reasoning: a snapshot's own `snapshot_json` blob is the ENTIRE frozen
 * report-card payload — meta, branding, classes/students/subjects/scores
 * — already deterministic and self-contained (no runtime DB lookup at
 * render time, confirmed from the real online path). This module's job
 * is therefore small: list what's available, and parse one on request.
 *
 * Deliberately NOT the real DRCE render pipeline (RENDER_LAYERS.md's
 * five-layer system, the registry, DRCEDocumentRenderer's React tree,
 * overrides). That is a genuinely separate, much larger integration —
 * pulling it in here would mean re-verifying override application,
 * section visibility, and template binding all work identically offline,
 * none of which this slice attempts. What this gives instead is an
 * honest RAW DATA view of an already-generated snapshot: per class, each
 * student's scores — useful for checking a report card's numbers are
 * right while offline, not a stand-in for the actual printed layout.
 */
import type { Repos } from '../contract';

export interface OfflineSnapshotSummary {
  snapshotId: string;
  type: string;
  status: string;
  termId: number;
  termName: string | null;
  yearId: number;
  yearName: string | null;
  resultTypeId: number | null;
  classCount: number;
  studentCount: number;
  resultCount: number;
  generatedAt: string;
}

/** Term/year names resolved locally where possible (both repos already
 *  exist in this layer) — null, not a crash, when the local file doesn't
 *  have that reference row (a real possible state, same reasoning every
 *  other "resolve a name from an id" composition in this effort uses). */
export async function listOfflineSnapshots(repos: Repos, schoolId: number): Promise<OfflineSnapshotSummary[]> {
  const rows = await repos.reportSnapshots.listReadyBySchool(schoolId);
  const out: OfflineSnapshotSummary[] = [];
  for (const r of rows) {
    const [term, year] = await Promise.all([
      repos.terms.findById(schoolId, r.termId).catch(() => null),
      repos.academicYears.findById(schoolId, r.yearId).catch(() => null),
    ]);
    out.push({
      snapshotId: r.snapshotId, type: r.type, status: r.status,
      termId: r.termId, termName: term?.name ?? null,
      yearId: r.yearId, yearName: year?.name ?? null,
      resultTypeId: r.resultTypeId,
      classCount: r.classCount, studentCount: r.studentCount, resultCount: r.resultCount,
      generatedAt: r.generatedAt,
    });
  }
  return out;
}

export interface OfflineSnapshotStudentRow {
  id: string;
  name: string;
  admissionNumber: string;
  total: number;
  average: number;
  position: number;
  scores: Record<string, { displayScore: string; grade: string }>;
}

export interface OfflineSnapshotClassView {
  classId: number;
  className: string;
  stream: string;
  subjectNames: string[];
  students: OfflineSnapshotStudentRow[];
}

export interface OfflineSnapshotDetail {
  snapshotId: string;
  status: string;
  schoolName: string | null;
  termName: string | null;
  yearName: string | null;
  generatedAt: string;
  classes: OfflineSnapshotClassView[];
}

/**
 * Null means "not found, not readable here" (wrong school, unknown id, or
 * no payload stored) — never throws for those, since a caller showing a
 * list of available snapshots can always hit a stale/broken one. Malformed
 * JSON is the one case worth distinguishing in a log, not surfacing
 * differently to the caller — still null, not a crash.
 */
export async function getOfflineSnapshot(repos: Repos, schoolId: number, snapshotId: string): Promise<OfflineSnapshotDetail | null> {
  const record = await repos.reportSnapshots.findBySnapshotId(schoolId, snapshotId);
  if (!record?.snapshotJson) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(record.snapshotJson);
  } catch (err) {
    console.warn('[offline-reports] stored snapshot_json failed to parse:', err);
    return null;
  }

  const meta = parsed?.meta ?? {};
  const classes: OfflineSnapshotClassView[] = Array.isArray(parsed?.classes)
    ? parsed.classes.map((c: any) => ({
        classId: c.classId, className: c.className, stream: c.stream ?? '',
        subjectNames: Array.isArray(c.subjects) ? c.subjects.map((s: any) => s.displayName ?? s.name) : [],
        students: Array.isArray(c.students)
          ? c.students.map((st: any) => ({
              id: st.id, name: st.name, admissionNumber: st.admissionNumber,
              total: st.total, average: st.average, position: st.position,
              scores: Object.fromEntries(
                (Array.isArray(st.results) ? st.results : []).map((r: any) => [
                  r.displaySubject ?? r.subjectName, { displayScore: r.displayScore, grade: r.grade },
                ]),
              ),
            }))
          : [],
      }))
    : [];

  return {
    snapshotId: record.snapshotId, status: record.status,
    schoolName: meta.schoolName ?? null, termName: meta.termName ?? null, yearName: meta.yearName ?? null,
    generatedAt: meta.generatedAt ?? record.generatedAt,
    classes,
  };
}
