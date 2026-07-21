import { getContributingAssessmentResults } from '../src/lib/snapshots/assessment.ts';

const results = [
  { subjectId:'1', subjectName:'Math', displaySubject:'Math', total:100, grade:'D1', score:60 },
  { subjectId:'2', subjectName:'English', displaySubject:'English', total:100, grade:'D2', score:58 },
  { subjectId:'3', subjectName:'IRE', displaySubject:'IRE', total:100, grade:'D1', score:65 },
];
const subjects = [
  { id:'1', name:'Math' },
  { id:'2', name:'English' },
  { id:'3', name:'IRE' },
];

const contributing = getContributingAssessmentResults(results, subjects);
console.log('contributing length', contributing.length);
contributing.forEach((r,i)=>console.log(i, r.subjectId, r.subjectName, r.grade));
