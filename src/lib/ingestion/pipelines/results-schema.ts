/**
 * Results canonical field catalog — split out of results.ts for the same
 * reason as students-schema.ts: importable without pulling in mysql2 via
 * `@/lib/db` at module scope, so pure consumers (../parse/purpose-guess.ts,
 * tests) stay trivially testable. results.ts re-exports RESULT_FIELDS from
 * here for backward compatibility.
 */
import type { CanonicalField } from '../types';

export const RESULT_FIELDS: CanonicalField[] = [
  {
    name: 'admission_no',
    label: 'Admission Number',
    synonyms: [
      'admission no', 'adm no', 'adm number', 'admno', 'admission number',
      'reg no', 'regno', 'registration no', 'registration number',
      'student id', 'student number', 'student no', 'studentid',
      'index no', 'index number', 'pin', 'pupil no', 'learner id',
    ],
    type: 'string',
    required: true,
  },
  {
    name: 'subject_name',
    label: 'Subject',
    synonyms: ['subject', 'subject name', 'paper', 'discipline', 'subject_code', 'subjectcode'],
    type: 'string',
    required: true,
  },
  {
    name: 'score',
    label: 'Score',
    synonyms: ['mark', 'marks', 'value', 'result', 'grade', 'total', 'points'],
    type: 'float',
    required: true,
  },
  {
    name: 'grade',
    label: 'Grade',
    synonyms: ['letter', 'letter grade', 'band'],
    type: 'string',
  },
  {
    name: 'remarks',
    label: 'Remarks',
    synonyms: ['comment', 'comments', 'notes', 'feedback', 'teacher comment'],
    type: 'string',
  },
  {
    name: 'teacher_initials',
    label: 'Teacher Initials',
    synonyms: ['teacher', 'initials', 'tr initials', 'tr', 'sig'],
    type: 'string',
  },
];
