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
