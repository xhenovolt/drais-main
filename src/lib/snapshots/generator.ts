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
  cancelInflightForKey,
  findReadyForKey,
} from './lifecycle';
import type { SnapshotRow } from './types';
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
import { infer as inferCalendar } from '@/lib/calendar';
import {
  resolveComment,
  type CommentRule,
} from '@/lib/drce/reportComments';
import { listCommentRules } from '@/lib/drce/reportComments.server';
import {
  applyGradingScale,
  buildDefaultConfig,
  defaultComments,
  deriveOverallRemark,
  subjectComment,
  DEFAULT_GRADING_SCALE,
} from './grader';
import type {
  ReportSnapshot,
  SnapshotClass,
  SnapshotResult,
  SnapshotResultComponent,
  SnapshotStudent,
  SnapshotSubject,
  SnapshotType,
  RankingMode,
} from './types';
import { loadClassTermComponentResults, computeRollupScore } from '@/lib/cafe/component-results';
import { resolveFrameworkForClass } from '@/lib/cafe/resolver';
import { getSchoolSettings } from '@/lib/cafe/settings';

export interface GenerateInput {
  type:         SnapshotType;
  termId:       number;
  yearId:       number;
  resultTypeId: number | null;
  classIds?:    number[];
  /**
   * When true, cancel any in-flight generation for the same key and proceed
   * even if `ready` snapshots already exist. The default (false) raises
   * `SnapshotInFlightError` or `ExistingReadySnapshotsError` so the UI can
   * present an informed choice.
   */
  force?:       boolean;
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

/**
 * Raised when ready snapshots already exist for the same (school, term, year,
 * type, resultTypeId) and the caller did not pass `force=true`. Carries the
 * existing rows so the UI can offer "View Existing / Regenerate / Flush".
 */
export class ExistingReadySnapshotsError extends Error {
  readonly existing: SnapshotRow[];
  constructor(existing: SnapshotRow[]) {
    super(`Ready snapshots already exist for this term/type. Pass force=true to regenerate.`);
    this.name = 'ExistingReadySnapshotsError';
    this.existing = existing;
  }
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

  // Pre-flight: warn the caller if ready snapshots already exist for this key,
  // unless they opted into force-regeneration.
  if (!input.force) {
    const existing = await findReadyForKey({
      schoolId:     ctx.schoolId,
      type:         input.type,
      termId:       input.termId,
      yearId:       input.yearId,
      resultTypeId: input.resultTypeId,
    });
    if (existing.length > 0) {
      throw new ExistingReadySnapshotsError(existing);
    }
  } else {
    // Force path: clear any in-flight row for this key so the slot is free.
    // Stale-sweep also runs inside acquireGenerationSlot, but that only catches
    // timed-out rows; force explicitly cancels active ones.
    await cancelInflightForKey({
      schoolId:    ctx.schoolId,
      type:        input.type,
      termId:      input.termId,
      yearId:      input.yearId,
      cancelledBy: ctx.generatedBy,
    });
  }

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

    // Phase 4b — load the school's result-table comment rules so each subject
    // row's comment can auto-fill from them. Best-effort: any failure (table
    // missing, query error) leaves rules empty and the report falls back to the
    // grading-scale remark exactly as before, so old behaviour is preserved.
    let commentRules: CommentRule[] = [];
    try {
      const raw = await listCommentRules(ctx.schoolId);
      commentRules = (raw || []).map((r) => ({
        ...r,
        min_score: r.min_score == null ? null : Number(r.min_score),
        max_score: r.max_score == null ? null : Number(r.max_score),
        subject_id: r.subject_id == null ? null : Number(r.subject_id),
        class_id: r.class_id == null ? null : Number(r.class_id),
        program_id: r.program_id == null ? null : Number(r.program_id),
      }));
    } catch {
      commentRules = [];
    }

    const classes = buildClasses(rows, numerals, language, commentRules);

    // Phase E — enrich each class with its class teacher (if assigned).
    // The lookup uses the snapshot's termId + each classId; failures
    // silently leave `classTeacher` undefined so old snapshots and
    // schools that have not assigned class teachers yet keep working.
    try {
      const { getClassTeacherForSnapshot } = await import('@/lib/services/class-teachers');
      await Promise.all(classes.map(async (c) => {
        const assignment = await getClassTeacherForSnapshot({
          classId:  c.classId,
          termId:   input.termId,
          schoolId: ctx.schoolId,
        });
        if (assignment) {
          c.classTeacher = { staffId: assignment.staffId, name: assignment.staffName };
        }
      }));
    } catch (e) {
      console.warn('[snapshots/generator] class teacher lookup failed:', e);
    }

    const sourceCounts = {
      classes:  classes.length,
      students: classes.reduce((n, c) => n + c.students.length, 0),
      results:  rows.length,
      subjects: classes.reduce((n, c) => n + c.subjects.length, 0),
    };

    // CAFE Phase 2 — additive: only mutates classes whose (class, term) has
    // a framework assignment AND has component result rows. Classes without
    // a framework pass through untouched → byte-identical dataHash for
    // every existing snapshot. Failure is non-fatal: missing CAFE tables on
    // first deploy fall through with legacy behaviour.
    let cafeRankingMode: RankingMode = 'numeric';
    try {
      const enriched = await enrichWithCAFE(classes, school.schoolId, term.termId, numerals);
      cafeRankingMode = enriched.rankingMode;
    } catch (e) {
      console.warn('[snapshots] CAFE enrichment skipped:', e instanceof Error ? e.message : e);
    }

    const dataHash = hashCanonical(classes);
    const generatedAt = new Date().toISOString();
    const generationMs = Math.round(performance.now() - startedAtMs);

    // Academic-calendar enrichment (Phase B wiring). Failure here MUST NOT
    // fail the generation — the snapshot is still valid without it; the
    // renderer falls back to the manual nextTermBegins. Calendar is also
    // OUTSIDE the dataHash, so adding it does not change content hashes.
    let calendarConfig: import('./types').SnapshotConfig['calendar'] | undefined;
    try {
      const inf = await inferCalendar(school.schoolId, term.termId);
      if (inf.current_term) {
        calendarConfig = {
          next_term_starts_at: inf.next_term_starts_at,
          this_term_ends_at:   inf.this_term_ends_at,
          next_term_name:      inf.next_term?.name ?? null,
          prev_term_name:      inf.prev_term?.name ?? null,
          year_rollover:       inf.year_rollover,
        };
      }
    } catch (e) {
      console.warn(`[snapshots] calendar inference skipped for term ${term.termId}:`, e instanceof Error ? e.message : e);
    }

    // P1 — bulk-load custom field values for every student in scope. Pulled
    // AFTER dataHash is computed so adding the map never invalidates the
    // existing classes-only hash. Failure is non-fatal: snapshots still ship
    // without custom values; render path treats missing values as null.
    let customValuesMap: ReportSnapshot['customValues'];
    try {
      const studentIds: number[] = [];
      for (const c of classes) for (const s of c.students) studentIds.push(s.studentDbId);
      if (studentIds.length) {
        const { getStudentCustomValuesBulk } = await import('@/lib/custom-fields');
        const m = await getStudentCustomValuesBulk({ studentIds, schoolId: school.schoolId });
        if (m.size) {
          customValuesMap = {};
          for (const [sid, vals] of m) customValuesMap[sid] = vals;
        }
      }
    } catch (e) {
      console.warn('[snapshots] custom values load skipped:', e instanceof Error ? e.message : e);
    }

    // CAFE Phase 5 — bulk-load generic skills + project portfolios so the
    // adapter can surface student.genericSkills / student.projects. Same
    // post-hash placement as customValuesMap — outside the hash window so
    // snapshots that don't yet have skills/projects rows regenerate
    // byte-identically.
    let skillsMap:   ReportSnapshot['genericSkills'];
    let projectsMap: ReportSnapshot['projects'];
    try {
      const studentIds: number[] = [];
      for (const c of classes) for (const s of c.students) studentIds.push(s.studentDbId);
      if (studentIds.length) {
        const { loadSkillsBulk, loadProjectsBulk } = await import('@/lib/cafe/skills-projects');
        const [sk, pr] = await Promise.all([
          loadSkillsBulk({ schoolId: school.schoolId, termId: term.termId, studentIds }),
          loadProjectsBulk({ schoolId: school.schoolId, termId: term.termId, studentIds }),
        ]);
        if (sk.size) {
          skillsMap = {};
          for (const [sid, vals] of sk) skillsMap[sid] = vals.map(v => ({
            code: v.code, label: v.label, score: v.score, valueText: v.valueText,
            gradeCode: v.gradeCode, remarks: v.remarks,
          }));
        }
        if (pr.size) {
          projectsMap = {};
          for (const [sid, vals] of pr) projectsMap[sid] = vals.map(v => ({
            id: v.id, title: v.title, descriptor: v.descriptor, outcome: v.outcome,
            evidenceUrl: v.evidenceUrl, gradeCode: v.gradeCode,
          }));
        }
      }
    } catch (e) {
      console.warn('[snapshots] CAFE skills/projects load skipped:', e instanceof Error ? e.message : e);
    }

    const snapshot: ReportSnapshot = {
      meta: {
        snapshotId,
        schemaVersion: 2,
        type: input.type,
        schoolId: school.schoolId,
        schoolSlug: slugify(school.schoolName),
        schoolName: school.schoolName,
        branding: {
          schoolName:           school.schoolName,
          legalName:            school.legalName,
          shortCode:            school.shortCode,
          motto:                school.motto,
          address:              school.address,
          poBox:                school.poBox,
          district:             school.district,
          region:               school.region,
          country:              school.country,
          phone:                school.phone,
          email:                school.email,
          website:              school.website,
          principalName:        school.principalName,
          principalPhone:       school.principalPhone,
          registrationNumber:   school.registrationNumber,
          centerNo:             school.centerNo,
          logoUrl:              school.logoUrl,
          schoolType:           school.schoolType,
          arabicName:           school.arabicName,
          arabicAddress:        school.arabicAddress,
          arabicMotto:          school.arabicMotto,
          arabicPhone:          school.arabicPhone,
          arabicCenterNo:       school.arabicCenterNo,
          arabicRegistrationNo: school.arabicRegistrationNo,
          arabicPoBox:          school.arabicPoBox,
        },
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
      ...(skillsMap     ? { genericSkills: skillsMap } : {}),
      ...(projectsMap   ? { projects:     projectsMap } : {}),
      config: {
        ...buildDefaultConfig(''),
        ...(calendarConfig ? { calendar: calendarConfig } : {}),
        // CAFE Phase 2 — emit rankingMode only when it diverges from the
        // legacy 'numeric' default, to preserve byte-identical snapshot
        // serialisation for every existing report school.
        ...(cafeRankingMode !== 'numeric' ? { rankingMode: cafeRankingMode } : {}),
      },
      ...(customValuesMap ? { customValues: customValuesMap } : {}),
    };

    await saveSnapshot({ snapshotId, snapshot, generationMs });

    return { snapshotId, status: 'ready', generationMs, counts: sourceCounts };
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    await markSnapshotFailed(snapshotId, msg).catch(() => undefined);
    throw e;
  }
}

// ─── CAFE Phase 2 — additive component enrichment ──────────────────────────

/**
 * If (school, class, term) has a CAFE framework assignment, hydrate every
 * SnapshotResult in that class with its `components[]` array and overwrite
 * `score` with the rolled-up weighted mean so legacy bindings stay correct.
 *
 * Classes WITHOUT a framework assignment are untouched — this is the key
 * invariant that preserves byte-identical `meta.dataHash` for every existing
 * snapshot (none of which had a framework assigned at generation time).
 *
 * Determines `rankingMode` for the snapshot config: 'competency' if the
 * school's academic_mode is 'competency' AND the active framework is mode
 * 'rubric'/'descriptor', 'numeric' otherwise.
 */
async function enrichWithCAFE(
  classes: SnapshotClass[],
  schoolId: number,
  termId:   number,
  numerals: 'arabic' | 'western',
): Promise<{ classes: SnapshotClass[]; rankingMode: RankingMode }> {
  let anyCompetency = false;

  for (const cls of classes) {
    const frameworkId = await resolveFrameworkForClass({
      schoolId, classId: cls.classId, termId, subjectId: null,
    });
    if (!frameworkId) continue;

    const componentRows = await loadClassTermComponentResults({
      schoolId, classId: cls.classId, termId,
    });
    if (!componentRows.length) continue;  // framework assigned but no data → leave legacy results

    // Group by (student, subject) for fast lookup during result enrichment.
    const grouped = new Map<string, typeof componentRows>();
    for (const row of componentRows) {
      const key = `${row.studentId}:${row.subjectId}`;
      const arr = grouped.get(key);
      if (arr) arr.push(row); else grouped.set(key, [row]);
    }

    for (const stu of cls.students) {
      for (const res of stu.results) {
        const key = `${stu.studentDbId}:${res.subjectId}`;
        const comps = grouped.get(key);
        if (!comps?.length) continue;

        const components: SnapshotResultComponent[] = comps.map(c => ({
          componentId:  c.componentId,
          code:         c.componentCode,
          name:         c.componentName,
          score:        c.score,
          valueText:    c.valueText,
          gradeCode:    c.gradeCode,
          weight:       c.componentWeight,
          displayScore: c.score == null ? (c.valueText ?? '') : formatScoreForDisplay(c.score, numerals),
          remarks:      c.remarks,
        }));
        res.components = components;

        const rollup = computeRollupScore(comps);
        if (rollup !== null) {
          res.score = rollup;
          res.displayScore = formatScoreForDisplay(rollup, numerals);
        }
        anyCompetency = true;
      }
    }
  }

  if (!anyCompetency) {
    return { classes, rankingMode: 'numeric' };
  }

  // Read the school's academic_mode to decide if ranking should be 'numeric'
  // (hybrid school still wants rank), 'competency' (sum points), or 'none'
  // (skip entirely). Hybrid defaults to numeric so traditional behaviour
  // wins unless the school has explicitly chosen pure competency mode.
  let rankingMode: RankingMode = 'numeric';
  try {
    const settings = await getSchoolSettings(schoolId);
    if (settings.academicMode === 'competency') rankingMode = 'none';
  } catch { /* settings table may not exist on first deploy */ }

  // Re-rank every touched class with the resolved mode AND the new scores.
  // For classes that weren't touched (no framework / no component data)
  // the initial 'numeric' pass already produced the right values, so we
  // re-rank only if the mode itself changed away from 'numeric'.
  if (rankingMode !== 'numeric') {
    for (const cls of classes) rankStudents(cls.students, rankingMode);
  } else {
    // Components were added; rollup scores changed; re-rank in numeric mode.
    for (const cls of classes) rankStudents(cls.students, 'numeric');
  }

  // Refresh display strings since rollup may have changed total/average.
  for (const cls of classes) {
    for (const stu of cls.students) {
      stu.displayTotal    = formatScoreForDisplay(stu.total, numerals);
      stu.displayAverage  = formatScoreForDisplay(stu.average, numerals);
      stu.displayPosition = rankingMode === 'none'
        ? '—'
        : (numerals === 'arabic'
            ? `${toArabicNumerals(stu.position)}/${toArabicNumerals(stu.totalInClass)}`
            : `${stu.position}/${stu.totalInClass}`);
    }
  }

  return { classes, rankingMode };
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function buildClasses(
  rows: RawResultRow[],
  numerals: 'arabic' | 'western',
  language: 'en' | 'ar',
  commentRules: CommentRule[] = [],
): SnapshotClass[] {
  // Classes -> Students -> Results, all keyed by id for deterministic iteration.
  const classMap = new Map<number, {
    classId:   number;
    className: string;
    classNameAr?: string;
    stream:    string;
    streamAr?: string;
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
        classNameAr: (r.class_name_ar ?? '').trim() || undefined,
        stream:    r.stream_name ?? '',
        streamAr:  (r.stream_name_ar ?? '').trim() || undefined,
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
        // Phase 7 — freeze allocation context (department / subject group) so
        // historical report cards keep the classification they had at generation.
        department:   (r.department_name ?? '').trim() || undefined,
        subjectGroup: (r.subject_group_name ?? '').trim() || undefined,
      });
    }

    let stuEntry = cls.students.get(r.student_id);
    if (!stuEntry) {
      const firstName = r.first_name ?? '';
      const lastName  = r.last_name  ?? '';
      const fullName  = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Unknown';
      // Arabic name (Batch 5): explicit full_name_ar wins, else compose from
      // parts, each falling back to its English counterpart. Empty when none.
      const firstNameAr = (r.first_name_ar ?? '').trim();
      const lastNameAr  = (r.last_name_ar ?? '').trim();
      const otherNameAr = (r.other_name_ar ?? '').trim();
      const nameAr = (r.full_name_ar ?? '').trim()
        || [firstNameAr || firstName, otherNameAr, lastNameAr || lastName].filter(Boolean).join(' ').trim();
      stuEntry = {
        info: {
          id:              r.admission_no || String(r.student_id),
          studentDbId:     r.student_id,
          name:            fullName,
          firstName,
          lastName,
          nameAr:          nameAr || undefined,
          firstNameAr:     firstNameAr || undefined,
          lastNameAr:      lastNameAr || undefined,
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
      // Comment precedence: an explicit teacher remark always wins; otherwise a
      // matching school comment rule fills it; otherwise the grading-scale
      // default remark (unchanged legacy behaviour). Best-effort so comment
      // resolution can never break report generation.
      let ruleComment = '';
      if (commentRules.length) {
        try {
          ruleComment = resolveComment(commentRules, {
            subjectId: r.subject_id,
            classId:   r.class_id,
            grade:     grade || null,
            score:     Number.isFinite(score) ? score : null,
            language,
          }).text || '';
        } catch {
          ruleComment = '';
        }
      }
      const remarks = (r.remarks && r.remarks.trim() !== '')
        ? r.remarks
        : (ruleComment || subjectComment(score, language));
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
        teachersAll:    (r.teachers_all ?? '').trim() || undefined,
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
    // Initial pass uses 'numeric' — CAFE Phase 2 re-ranks after enrichWithCAFE
    // if the snapshot resolves to a non-numeric rankingMode.
    rankStudents(students, 'numeric');

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
      classNameAr: cls.classNameAr,
      stream:    cls.stream,
      streamAr:  cls.streamAr,
      subjects,
      students,
    });
  }
  return out;
}
