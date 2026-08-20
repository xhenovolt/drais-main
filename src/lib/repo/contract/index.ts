export * from './types';
export type { SchoolRepo } from './school-repo';
export type { StudentRepo } from './student-repo';
export type { PersonRepo } from './person-repo';
export type { AttendanceRawEventRepo, CreateRawEventResult } from './attendance-raw-event-repo';
export type { AttendanceRecordRepo } from './attendance-record-repo';
export type { ClassRepo } from './class-repo';
export type { ClassResultRepo } from './class-result-repo';

import type { SchoolRepo } from './school-repo';
import type { StudentRepo } from './student-repo';
import type { PersonRepo } from './person-repo';
import type { AttendanceRawEventRepo } from './attendance-raw-event-repo';
import type { AttendanceRecordRepo } from './attendance-record-repo';
import type { ClassRepo } from './class-repo';
import type { ClassResultRepo } from './class-result-repo';

/** The registry every consumer of this layer actually depends on — never
 *  a concrete repo-mysql or repo-sqlite import directly (§8's boundary
 *  table). A route or service takes a `Repos` and doesn't know or care
 *  which engine backs it. */
export interface Repos {
  schools: SchoolRepo;
  students: StudentRepo;
  people: PersonRepo;
  attendanceRawEvents: AttendanceRawEventRepo;
  attendanceRecords: AttendanceRecordRepo;
  classes: ClassRepo;
  classResults: ClassResultRepo;
}
