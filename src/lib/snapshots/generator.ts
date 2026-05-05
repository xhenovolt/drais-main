/**
 * Snapshot generator orchestrator.
 *
 * Pipeline:
 *   1. Acquire single-flight slot in report_snapshots (uk_inflight UNIQUE).
 *   2. Fetch school + term + result-type metadata.
 *   3. Pull all results in one query, pre-sorted deterministically.
 *   4. Group by class -> student, normalize scores (Arabic -> Western),
 *      collect subjects per class.
 *   5. Rank students per class, apply grading scale, attach comments.
 *   6. Produce ReportSnapshot, hash canonical bytes, persist row.
 *
 * Deterministic invariants:
 *   - No `Date.now()`/`Math.random()` inside the `classes` array.
 *   - All array iteration is over pre-sorted arrays.
 *   - `meta.dataHash` is sha256 of the key-sorted `classes` array.
 */
import { randomUUID } from 'node:crypto';
import {
  acquireGenerationSlot,
  saveSnapshot,
  markSnapshotFailed,
  SnapshotInFlightError,
} from './storage';
import {
  fetchSchool,
  fetchTerm,
  fetchResultType,
  fetchResultsForGeneration,
  type RawResultRow,
} from './queries';
import {
  arabicToWestern,
  parseScore,
  formatScoreForDisplay,
  hashCanonical,
  slugify,
  toArabicNumerals,
} from './normalizers';
import { rankStudents } from './ranker';
import {
  applyGradingScale,
  buildDefaultConfig,
  defaultComments,
  deriveOverallRemark,
  DEFAULT_GRADING_SCALE,
} from './grader';
import type {
  ReportSnapshot,
  SnapshotClass,
  SnapshotResult,
  SnapshotStudent,
  SnapshotSubject,
  SnapshotType,
} from './types';

export interface GenerateInput {
  type:         SnapshotType;
  termId:       number;
  yearId:       number;
  resultTypeId: number | null;
  classIds?:    number[];
}

export interface GenerateContext {
  schoolId:    number;
  generatedBy: number;
}

export interface GenerateResult {
  snapshotId:  string;
  status:      'ready';
  generationMs:number;
  counts:      ReportSnapshot['meta']['sourceCounts'];
}

export { SnapshotInFlightError };

/**
 * Run the full pipeline. Throws SnapshotInFlightError if another generation
 * for the same (school, term, year, type) is already running.
 */
export async function generateSnapshot(
  input: GenerateInput,
  ctx:   GenerateContext,
): Promise<GenerateResult> {
  const snapshotId = randomUUID();
  const startedAtMs = performance.now();

  await acquireGenerationSlot({
    snapshotId,
    schoolId:     ctx.schoolId,
    type:         input.type,
    termId:       input.termId,
    yearId:       input.yearId,
    resultTypeId: input.resultTypeId,
    generatedBy:  ctx.generatedBy,
  });

  try {
    const [school, term, resultType] = await Promise.all([
      fetchSchool(ctx.schoolId),
      fetchTerm(input.termId),
      input.resultTypeId !== null ? fetchResultType(input.resultTypeId) : Promise.resolve(null),
    ]);
    if (!school) throw new Error(`School ${ctx.schoolId} not found`);
    if (!term)   throw new Error(`Term ${input.termId} not found`);

    const rows = await fetchResultsForGeneration({
      schoolId:     ctx.schoolId,
      termId:       input.termId,
      yearId:       input.yearId,
      resultTypeId: input.resultTypeId,
      type:         input.type,
      classIds:     input.classIds,
    });

    const language = input.type === 'theology' ? 'ar' : 'en';
    const numerals = input.type === 'theology' ? 'arabic' : 'western';

    const classes = buildClasses(rows, numerals, language);
    const sourceCounts = {
      classes:  classes.length,
      students: classes.reduce((n, c) => n + c.students.length, 0),
      results:  rows.length,
      subjects: classes.reduce((n, c) => n + c.subjects.length, 0),
    };

    const dataHash = hashCanonical(classes);
    const generatedAt = new Date().toISOString();
    const generationMs = Math.round(performance.now() - startedAtMs);

    const snapshot: ReportSnapshot = {
      meta: {
        snapshotId,
        schemaVersion: 1,
        type: input.type,
        schoolId: school.schoolId,
        schoolSlug: slugify(school.schoolName),
        schoolName: school.schoolName,
        termId: term.termId,
        termName: term.termName,
        yearId: term.yearId,
        yearName: term.yearName,
        resultTypeId: resultType?.resultTypeId ?? null,
        resultTypeName: resultType?.resultTypeName ?? '',
        numerals,
        language,
        generatedAt,
        generatedBy: ctx.generatedBy,
        generationDurationMs: generationMs,
        sourceCounts,
        dataHash,
      },
      classes,
      config: buildDefaultConfig(''),
    };

    await saveSnapshot({ snapshotId, snapshot, generationMs });

    return { snapshotId, status: 'ready', generationMs, counts: sourceCounts };
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    await markSnapshotFailed(snapshotId, msg).catch(() => undefined);
    throw e;
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function buildClasses(
  rows: RawResultRow[],
  numerals: 'arabic' | 'western',
  language: 'en' | 'ar',
): SnapshotClass[] {
  // Classes -> Students -> Results, all keyed by id for deterministic iteration.
  const classMap = new Map<number, {
    classId:   number;
    className: string;
    stream:    string;
    subjects:  Map<number, SnapshotSubject>;
    students:  Map<number, {
      info:    SnapshotStudent;
      results: Map<number, SnapshotResult>;
    }>;
  }>();

  for (const r of rows) {
    let cls = classMap.get(r.class_id);
    if (!cls) {
      cls = {
        classId:   r.class_id,
        className: r.class_name,
        stream:    r.stream_name ?? '',
        subjects:  new Map(),
        students:  new Map(),
      };
      classMap.set(r.class_id, cls);
    }

    if (!cls.subjects.has(r.subject_id)) {
      const englishName = r.subject_name;
      const displayName = numerals === 'arabic' && r.subject_name_ar
        ? r.subject_name_ar
        : englishName;
      const subjectType: 'primary' | 'secondary' =
        (r.subject_type || 'core').toLowerCase() === 'core' ? 'primary' : 'secondary';
      cls.subjects.set(r.subject_id, {
        id:          r.subject_id,
        name:        englishName,
        displayName,
        totalMarks:  100,
        subjectType,
      });
    }

    let stuEntry = cls.students.get(r.student_id);
    if (!stuEntry) {
      const firstName = r.first_name ?? '';
      const lastName  = r.last_name  ?? '';
      const fullName  = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Unknown';
      stuEntry = {
        info: {
          id:              r.admission_no || String(r.student_id),
          studentDbId:     r.student_id,
          name:            fullName,
          firstName,
          lastName,
          gender:          r.gender ?? '',
          admissionNumber: r.admission_no ?? '',
          photoUrl:        r.photo_url ?? null,
          results:         [],
          total:           0,
          average:         0,
          position:        0,
          totalInClass:    0,
          displayTotal:    '',
          displayAverage:  '',
          displayPosition: '',
          comments:        defaultComments(language),
          remarks:         '',
        },
        results: new Map(),
      };
      cls.students.set(r.student_id, stuEntry);
    }

    if (!stuEntry.results.has(r.subject_id)) {
      const score = parseScore(r.score);
      const grade = (r.grade && r.grade.trim() !== '')
        ? r.grade
        : (applyGradingScale(score, DEFAULT_GRADING_SCALE)?.grade ?? '');
      const remarks = (r.remarks && r.remarks.trim() !== '')
        ? r.remarks
        : (applyGradingScale(score, DEFAULT_GRADING_SCALE)?.remark ?? '');
      const subj = cls.subjects.get(r.subject_id)!;
      stuEntry.results.set(r.subject_id, {
        subjectId:      r.subject_id,
        subjectName:    subj.name,
        displaySubject: subj.displayName,
        score,
        displayScore:   formatScoreForDisplay(score, numerals),
        grade,
        remarks,
        initials:       (r.teacher_initials ?? '').trim(),
        teacherName:    (r.teacher_name ?? '').trim() || undefined,
        enteredAt:      r.created_at ?? undefined,
      });
    }
  }

  // Materialize, sort deterministically, rank.
  const out: SnapshotClass[] = [];
  for (const cls of [...classMap.values()].sort((a, b) => a.classId - b.classId)) {
    const subjects = [...cls.subjects.values()].sort((a, b) => a.id - b.id);

    const students: SnapshotStudent[] = [];
    for (const stu of cls.students.values()) {
      const results = [...stu.results.values()].sort((a, b) => a.subjectId - b.subjectId);
      stu.info.results = results;
      students.push(stu.info);
    }
    rankStudents(students);

    // Now that totals/positions exist, fill in display strings.
    for (const stu of students) {
      stu.displayTotal    = formatScoreForDisplay(stu.total, numerals);
      stu.displayAverage  = formatScoreForDisplay(stu.average, numerals);
      stu.displayPosition = numerals === 'arabic'
        ? `${toArabicNumerals(stu.position)}/${toArabicNumerals(stu.totalInClass)}`
        : `${stu.position}/${stu.totalInClass}`;
      stu.remarks         = deriveOverallRemark(stu.average, language);
    }

    out.push({
      classId:   cls.classId,
      className: cls.className,
      stream:    cls.stream,
      subjects,
      students,
    });
  }
  return out;
}
