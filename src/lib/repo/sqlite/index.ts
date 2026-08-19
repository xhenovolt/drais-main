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

export { openSqliteDb, closeSqliteDb, type SqliteConnection } from './connection';

export function createSqliteRepos(db: SqliteConnection): Repos {
  return {
    schools: createSqliteSchoolRepo(db),
    students: createSqliteStudentRepo(db),
  };
}
