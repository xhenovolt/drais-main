import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAggregateFromResults, computeAssessmentRawValues } from '@/lib/drce/assessmentUtils';
import { snapshotToDRCEDataContext } from '../../snapshots/adapter/toDRCEDataContext.ts';
import { snapshotToTemplateMap } from '../../snapshots/adapter/toTemplateMap.ts';

function makeResult(subjectId, grade, total = 0) {
  return {
    subjectId,
    subjectName: `Subject ${subjectId}`,
    displaySubject: `Subject ${subjectId}`,
    total,
    grade,
    score: total,
    displayScore: String(total),
    remarks: '',
    initials: '',
    teacherName: '',
    components: [],
    teachersAll: '',
  };
}

describe('DRCE assessment aggregation', () => {
  it('always sums grade points and ignores marks-based mode', () => {
    const results = [
      makeResult('1', 'D1', 60),
      makeResult('2', 'D2', 58),
      makeResult('3', 'D1', 65),
      makeResult('4', 'C6', 56),
    ];

    const aggregate = calculateAggregateFromResults(results, {
      mode: 'marks',
      sumColumnIds: ['total'],
      gradePointMap: { D1: 1, D2: 2, C6: 6 },
      divisionThresholds: [
        { maxValue: 12, label: 'Division I' },
      ],
    });

    assert.equal(aggregate, 10);
  });

  it('computes division from grade-point aggregate using standard thresholds', () => {
    const results = [
      makeResult('1', 'D1', 60),
      makeResult('2', 'D2', 58),
      makeResult('3', 'D1', 65),
      makeResult('4', 'C6', 56),
    ];

    const assessment = computeAssessmentRawValues(results, {
      gradePointMap: { D1: 1, D2: 2, C6: 6 },
      divisionThresholds: [
        { maxValue: 12, label: 'Division I' },
        { maxValue: 23, label: 'Division II' },
      ],
    });

    assert.equal(assessment.aggregate, 10);
    assert.equal(assessment.division, 'Division I');
  });

  it('excludes IRE subjects from snapshot assessment aggregation', () => {
    const snapshot = {
      classes: [
        {
          className: 'Class A',
          classNameAr: 'الفصل أ',
          stream: 'Stream 1',
          streamAr: 'التيار 1',
          subjects: [
            { id: '1', name: 'Math', displayName: 'Math', totalMarks: 100, subjectType: 'primary', department: '' },
            { id: '2', name: 'English', displayName: 'English', totalMarks: 100, subjectType: 'primary', department: '' },
            { id: '3', name: 'IRE', displayName: 'IRE', totalMarks: 100, subjectType: 'primary', department: '' },
          ],
          students: [
            {
              id: 'student-1',
              studentDbId: 'student-1',
              name: 'Test Student',
              nameAr: 'طالب الاختبار',
              firstName: 'Test',
              lastName: 'Student',
              gender: 'M',
              admissionNumber: 'A001',
              photoUrl: null,
              results: [
                makeResult('1', 'D1', 60),
                makeResult('2', 'D2', 58),
                makeResult('3', 'D1', 65),
              ],
              total: 0,
              average: 0,
              position: 1,
              totalInClass: 1,
              displayTotal: '0',
              displayAverage: '0',
              displayPosition: '1',
              comments: { classTeacher: '', dos: '', headTeacher: '' },
              remarks: '',
            },
          ],
        },
      ],
      meta: {
        language: 'en',
        numerals: 'western',
        termName: 'Term 1',
        yearName: '2026',
        type: 'Final',
        schoolName: 'Test School',
        branding: {},
      },
      config: {},
    };

    const dataCtx = snapshotToDRCEDataContext(snapshot, 0, 0, { schoolName: 'Test School' });
    assert.equal(dataCtx.assessment.aggregates, 3);
    assert.equal(dataCtx.assessment.division, 'Division I');
  });

  it('excludes IRE subjects from snapshot template-map assessment values', () => {
    const snapshot = {
      classes: [
        {
          className: 'Class A',
          classNameAr: 'الفصل أ',
          stream: 'Stream 1',
          streamAr: 'التيار 1',
          subjects: [
            { id: '1', name: 'Math', displayName: 'Math', totalMarks: 100, subjectType: 'primary', department: '' },
            { id: '2', name: 'IRE', displayName: 'IRE', totalMarks: 100, subjectType: 'primary', department: '' },
          ],
          students: [
            {
              id: 'student-1',
              studentDbId: 'student-1',
              name: 'Test Student',
              nameAr: 'طالب الاختبار',
              firstName: 'Test',
              lastName: 'Student',
              gender: 'M',
              admissionNumber: 'A001',
              photoUrl: null,
              results: [
                { subjectId: '1', subjectName: 'Math', displaySubject: 'Math', score: 80, displayScore: '80', grade: 'D2', remarks: '', initials: '', teacherName: '', teachersAll: '', enteredAt: '2026-01-01' },
                { subjectId: '2', subjectName: 'IRE', displaySubject: 'IRE', score: 70, displayScore: '70', grade: 'C3', remarks: '', initials: '', teacherName: '', teachersAll: '', enteredAt: '2026-01-01' },
              ],
              total: 0,
              average: 0,
              position: 1,
              totalInClass: 1,
              displayTotal: '0',
              displayAverage: '0',
              displayPosition: '1',
              comments: { classTeacher: '', dos: '', headTeacher: '' },
              remarks: '',
            },
          ],
        },
      ],
      meta: {
        language: 'en',
        numerals: 'western',
        termName: 'Term 1',
        yearName: '2026',
        type: 'Final',
        schoolName: 'Test School',
        branding: {},
      },
      config: {},
    };

    const output = snapshotToTemplateMap({ snapshot, classIdx: 0, studentIdx: 0 });
    assert.equal(output.placeholders.aggregates, '2');
    assert.equal(output.placeholders.division, 'Division I');
  });

  it('renders nursery grades as letters and suppresses numeric aggregates for baby class snapshots', () => {
    const snapshot = {
      classes: [
        {
          className: 'Baby Class',
          classNameAr: 'الفصل الرضيع',
          stream: 'Stream 1',
          streamAr: 'التيار 1',
          subjects: [
            { id: '1', name: 'Social Development', displayName: 'Social Development', totalMarks: 100, subjectType: 'primary', department: '' },
            { id: '2', name: 'Numbers', displayName: 'Numbers', totalMarks: 100, subjectType: 'primary', department: '' },
          ],
          students: [
            {
              id: 'student-1',
              studentDbId: 'student-1',
              name: 'Test Student',
              nameAr: 'طالب الاختبار',
              firstName: 'Test',
              lastName: 'Student',
              gender: 'M',
              admissionNumber: 'A001',
              photoUrl: null,
              results: [
                { subjectId: '1', subjectName: 'Social Development', displaySubject: 'Social Development', score: 90, displayScore: '90', grade: 'D1', remarks: '', initials: '', teacherName: '', teachersAll: '', enteredAt: '2026-01-01' },
                { subjectId: '2', subjectName: 'Numbers', displaySubject: 'Numbers', score: 85, displayScore: '85', grade: 'D1', remarks: '', initials: '', teacherName: '', teachersAll: '', enteredAt: '2026-01-01' },
              ],
              total: 0,
              average: 0,
              position: 1,
              totalInClass: 1,
              displayTotal: '0',
              displayAverage: '0',
              displayPosition: '1',
              comments: { classTeacher: '', dos: '', headTeacher: '' },
              remarks: '',
            },
          ],
        },
      ],
      meta: {
        language: 'en',
        numerals: 'western',
        termName: 'Term 1',
        yearName: '2026',
        type: 'Final',
        schoolName: 'Test School',
        branding: {},
      },
      config: {},
    };

    const output = snapshotToTemplateMap({ snapshot, classIdx: 0, studentIdx: 0 });
    assert.equal(output.placeholders.aggregates, '');
    assert.equal(output.placeholders.division, 'A');
    assert.match(output.subjectsHtml, /<td[^>]*>A<\/td>/);
  });

  it('recomputes snapshot assessment as grade-point total in snapshot adapter', () => {
    const snapshot = {
      classes: [
        {
          className: 'Class A',
          classNameAr: 'الفصل أ',
          stream: 'Stream 1',
          streamAr: 'التيار 1',
          subjects: [
            { id: '1', name: 'Math', displayName: 'Math', totalMarks: 100, subjectType: 'primary', department: '' },
            { id: '2', name: 'English', displayName: 'English', totalMarks: 100, subjectType: 'primary', department: '' },
            { id: '3', name: 'Science', displayName: 'Science', totalMarks: 100, subjectType: 'primary', department: '' },
            { id: '4', name: 'Social', displayName: 'Social', totalMarks: 100, subjectType: 'primary', department: '' },
          ],
          students: [
            {
              id: 'student-1',
              studentDbId: 'student-1',
              name: 'Test Student',
              nameAr: 'طالب الاختبار',
              firstName: 'Test',
              lastName: 'Student',
              gender: 'M',
              admissionNumber: 'A001',
              photoUrl: null,
              results: [
                makeResult('1', 'D1', 60),
                makeResult('2', 'D2', 58),
                makeResult('3', 'D1', 65),
                makeResult('4', 'C6', 56),
              ],
              total: 0,
              average: 0,
              position: 1,
              totalInClass: 1,
              displayTotal: '0',
              displayAverage: '0',
              displayPosition: '1',
              comments: { classTeacher: '', dos: '', headTeacher: '' },
              remarks: '',
            },
          ],
        },
      ],
      meta: {
        language: 'en',
        numerals: 'western',
        termName: 'Term 1',
        yearName: '2026',
        type: 'Final',
        schoolName: 'Test School',
        branding: {},
      },
      config: {},
    };

    const dataCtx = snapshotToDRCEDataContext(snapshot, 0, 0, { schoolName: 'Test School' });
    assert.equal(dataCtx.assessment.aggregates, 10);
    assert.equal(dataCtx.assessment.division, 'Division I');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression: 2026-07 Albayan division-mismatch postmortem.
// The assessment section must derive aggregate AND division from the SAME
// contributing subject set (ICT / IRE / electives never count), and the
// override must map `aggregate` (raw, singular) onto `aggregates` (binding,
// plural) — the old spread only overwrote `division`, so reports showed a
// correct aggregate next to a division computed from a larger subject total.
// ─────────────────────────────────────────────────────────────────────────────
import { resolveAssessmentForSection, calculateDivisionFromAggregate } from '@/lib/drce/assessmentUtils';

function makeCtxResult(id, name, subjectType, grade, score) {
  return {
    subjectName: name,
    midTermScore: null,
    endTermScore: score,
    total: score,
    grade,
    score,
    comment: '',
    initials: '',
    teacherName: '',
    subjectType: subjectType ?? 'primary',
    subject: { id, name, subjectType, department: '', subjectGroup: '' },
  };
}

const BASE = {
  classPosition: 1, streamPosition: 1, aggregates: null, division: null,
  totalStudents: 51, position: '1 / 51',
};

describe('resolveAssessmentForSection (division/aggregate coherence)', () => {
  // Real production case: MUSA TARIQ MUKISA, Albayan P6, snapshot 6d3ada09.
  const musaTariq = [
    makeCtxResult(392001, 'SCIENCE', 'primary', 'D2', 84),
    makeCtxResult(392002, 'SOCIAL STUDIES', 'primary', 'C3', 75),
    makeCtxResult(392003, 'MATHEMATICS', 'primary', 'C4', 63),
    makeCtxResult(420004, 'ICT (COMPUTER)', 'secondary', 'D2', 88),
    makeCtxResult(428004, 'ENGLISH', 'primary', 'D2', 85),
  ];

  it('excludes secondary subjects (ICT) from BOTH aggregate and division', () => {
    const out = resolveAssessmentForSection(BASE, musaTariq);
    assert.equal(out.aggregates, 11);            // 2+3+4+2, ICT's 2 excluded
    assert.equal(out.division, 'Division I');    // NOT Division II (13)
  });

  it('keeps division coherent with the displayed aggregate (invariant)', () => {
    const out = resolveAssessmentForSection(BASE, musaTariq);
    assert.equal(out.division, calculateDivisionFromAggregate(out.aggregates));
  });

  it('excludes IRE by name even when typed primary', () => {
    const rows = [
      makeCtxResult(1, 'MATHEMATICS', 'primary', 'D1', 92),
      makeCtxResult(2, 'ENGLISH', 'primary', 'D1', 95),
      makeCtxResult(3, 'Islamic Religious Education', 'primary', 'F9', 20),
    ];
    const out = resolveAssessmentForSection(BASE, rows);
    assert.equal(out.aggregates, 2);
    assert.equal(out.division, 'Division I');
  });

  it('excludes elective subjects', () => {
    const rows = [
      makeCtxResult(1, 'MATHEMATICS', 'primary', 'C3', 70),
      makeCtxResult(2, 'MUSIC', 'elective', 'F9', 10),
    ];
    const out = resolveAssessmentForSection(BASE, rows);
    assert.equal(out.aggregates, 3);
  });

  it('applies a custom aggregateConfig over the contributing set only', () => {
    const cfg = {
      gradePointMap: { D1: 1, D2: 2, C3: 3, C4: 4, C5: 5, C6: 6, P7: 7, P8: 8, F9: 9 },
      divisionThresholds: [
        { maxValue: 12, label: 'Division I' },
        { maxValue: 24, label: 'Division II' },
        { maxValue: 28, label: 'Division III' },
        { maxValue: 32, label: 'Division IV' },
      ],
      divisionFallback: 'Division U',
    };
    const rows = [
      makeCtxResult(1, 'MATHEMATICS', 'primary', 'F9', 10),
      makeCtxResult(2, 'ENGLISH', 'primary', 'F9', 12),
      makeCtxResult(3, 'SCIENCE', 'primary', 'C6', 45),
      makeCtxResult(4, 'ICT', 'secondary', 'F9', 5),   // must not push 24 → 33
    ];
    const out = resolveAssessmentForSection(BASE, rows, cfg);
    assert.equal(out.aggregates, 24);
    assert.equal(out.division, 'Division II');
  });

  it('leaves nursery assessment untouched', () => {
    const nurseryBase = { ...BASE, aggregates: null, division: 'B' };
    const out = resolveAssessmentForSection(nurseryBase, musaTariq, undefined, { isNursery: true });
    assert.deepEqual(out, nurseryBase);
  });

  it('falls back to all rows when results carry no subject info (editor previews)', () => {
    const rows = [
      { subjectName: 'A', grade: 'D1', score: 90 },
      { subjectName: 'B', grade: 'D2', score: 85 },
    ];
    const out = resolveAssessmentForSection(BASE, rows);
    assert.equal(out.aggregates, 3);
  });
});
