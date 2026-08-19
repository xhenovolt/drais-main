export * from './types';
export type { SchoolRepo } from './school-repo';
export type { StudentRepo } from './student-repo';

import type { SchoolRepo } from './school-repo';
import type { StudentRepo } from './student-repo';

/** The registry every consumer of this layer actually depends on — never
 *  a concrete repo-mysql or repo-sqlite import directly (§8's boundary
 *  table). A route or service takes a `Repos` and doesn't know or care
 *  which engine backs it. */
export interface Repos {
  schools: SchoolRepo;
  students: StudentRepo;
}
