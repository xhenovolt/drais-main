/**
 * @drais/repo-mysql — assembled registry.
 * Used (via ../resolve.ts's getActiveRepos()) when getDbMode()
 * (src/lib/db/db-mode.ts) resolves to 'online' or 'local-mysql'. Delegates
 * to db.ts's existing pool selection — this factory does not choose a pool
 * itself, and nothing in this file was touched to add the third DbMode
 * value (that only added a case resolve.ts branches on, not anything here).
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
import { createMysqlUserRepo } from './user-repo';
import { createMysqlRoleRepo } from './role-repo';
import { createMysqlUserRoleRepo } from './user-role-repo';
import { createMysqlPermissionRepo } from './permission-repo';
import { createMysqlRolePermissionRepo } from './role-permission-repo';

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
    users: createMysqlUserRepo(),
    roles: createMysqlRoleRepo(),
    userRoles: createMysqlUserRoleRepo(),
    permissions: createMysqlPermissionRepo(),
    rolePermissions: createMysqlRolePermissionRepo(),
  };
}
