/**
 * @drais/repo-mysql — assembled registry.
 * Used when getDbMode() (src/lib/db/db-mode.ts, UNTOUCHED by this layer)
 * resolves to 'online' or 'local'-against-MySQL. Delegates to db.ts's
 * existing pool selection — this factory does not choose a pool itself.
 */
import type { Repos } from '../contract';
import { createMysqlSchoolRepo } from './school-repo';
import { createMysqlStudentRepo } from './student-repo';
import { createMysqlPersonRepo } from './person-repo';
import { createMysqlAttendanceRawEventRepo } from './attendance-raw-event-repo';
import { createMysqlAttendanceRecordRepo } from './attendance-record-repo';
import { createMysqlClassRepo } from './class-repo';
import { createMysqlClassResultRepo } from './class-result-repo';
import { createMysqlStaffRepo } from './staff-repo';
import { createMysqlSubjectRepo } from './subject-repo';
import { createMysqlTermRepo } from './term-repo';
import { createMysqlAcademicYearRepo } from './academic-year-repo';

export function createMysqlRepos(): Repos {
  return {
    schools: createMysqlSchoolRepo(),
    students: createMysqlStudentRepo(),
    people: createMysqlPersonRepo(),
    attendanceRawEvents: createMysqlAttendanceRawEventRepo(),
    attendanceRecords: createMysqlAttendanceRecordRepo(),
    classes: createMysqlClassRepo(),
    classResults: createMysqlClassResultRepo(),
    staff: createMysqlStaffRepo(),
    subjects: createMysqlSubjectRepo(),
    terms: createMysqlTermRepo(),
    academicYears: createMysqlAcademicYearRepo(),
  };
}
