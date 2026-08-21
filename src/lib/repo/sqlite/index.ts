/**
 * @drais/repo-sqlite — assembled registry.
 *
 * NOT wired into any route, page, or db-mode resolver yet (§8.1 — this
 * phase "lands inert" by design; Phase 4 of the roadmap, school-scoped
 * provisioning, is what actually starts writing into a SQLite file that
 * matters). Callers own the connection lifecycle — this factory does not
 * open or close it.
 */
import type { Repos } from '../contract';
import type { SqliteConnection } from './connection';
import { createSqliteSchoolRepo } from './school-repo';
import { createSqliteStudentRepo } from './student-repo';
import { createSqlitePersonRepo } from './person-repo';
import { createSqliteAttendanceRawEventRepo } from './attendance-raw-event-repo';
import { createSqliteAttendanceRecordRepo } from './attendance-record-repo';
import { createSqliteClassRepo } from './class-repo';
import { createSqliteClassResultRepo } from './class-result-repo';
import { createSqliteStaffRepo } from './staff-repo';
import { createSqliteSubjectRepo } from './subject-repo';
import { createSqliteTermRepo } from './term-repo';
import { createSqliteAcademicYearRepo } from './academic-year-repo';
import { createSqliteUserRepo } from './user-repo';
import { createSqliteRoleRepo } from './role-repo';
import { createSqliteUserRoleRepo } from './user-role-repo';
import { createSqlitePermissionRepo } from './permission-repo';
import { createSqliteRolePermissionRepo } from './role-permission-repo';

export { openSqliteDb, closeSqliteDb, type SqliteConnection } from './connection';
export { seedSchool, seedStudent, seedPerson } from './seed';

export function createSqliteRepos(db: SqliteConnection): Repos {
  return {
    schools: createSqliteSchoolRepo(db),
    students: createSqliteStudentRepo(db),
    people: createSqlitePersonRepo(db),
    attendanceRawEvents: createSqliteAttendanceRawEventRepo(db),
    attendanceRecords: createSqliteAttendanceRecordRepo(db),
    classes: createSqliteClassRepo(db),
    classResults: createSqliteClassResultRepo(db),
    staff: createSqliteStaffRepo(db),
    subjects: createSqliteSubjectRepo(db),
    terms: createSqliteTermRepo(db),
    academicYears: createSqliteAcademicYearRepo(db),
    users: createSqliteUserRepo(db),
    roles: createSqliteRoleRepo(db),
    userRoles: createSqliteUserRoleRepo(db),
    permissions: createSqlitePermissionRepo(db),
    rolePermissions: createSqliteRolePermissionRepo(db),
  };
}
