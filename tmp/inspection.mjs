import { snapshotToDRCEDataContext } from './src/lib/snapshots/adapter/toDRCEDataContext.ts';
import { snapshotToTemplateMap } from './src/lib/snapshots/adapter/toTemplateMap.ts';

const makeResult = (subjectId, grade, total = 0) => ({
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
  teachersAll: '',
  components: [],
});

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
console.log('dataCtx.assessment', dataCtx.assessment);

const output = snapshotToTemplateMap({ snapshot, classIdx: 0, studentIdx: 0 });
console.log('templateMap aggregates', output.placeholders.aggregates, 'division', output.placeholders.division);
console.log('subjectsHtml', output.subjectsHtml);
