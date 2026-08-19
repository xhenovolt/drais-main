/**
 * @drais/repo-mysql — assembled registry.
 * Used when getDbMode() (src/lib/db/db-mode.ts, UNTOUCHED by this layer)
 * resolves to 'online' or 'local'-against-MySQL. Delegates to db.ts's
 * existing pool selection — this factory does not choose a pool itself.
 */
import type { Repos } from '../contract';
import { createMysqlSchoolRepo } from './school-repo';
import { createMysqlStudentRepo } from './student-repo';

export function createMysqlRepos(): Repos {
  return {
    schools: createMysqlSchoolRepo(),
    students: createMysqlStudentRepo(),
  };
}
