/**
 * @drais/repo — "which school does this local install hold."
 *
 * Deliberately NOT added to the shared SchoolRepo interface (contract/
 * school-repo.ts) — "the one school" is a concept that only makes sense
 * for a local single-school SQLite install (§9: one school per local
 * install, by design). The online mysql implementation of the SAME
 * interface genuinely has many schools; a method meaning "the one school"
 * would be actively dangerous there, not just unused. This stays a
 * standalone, SQLite-only function instead, operating directly on the
 * connection like every other offline-auth module.
 *
 * Confirmed design (2026-08-22, user, AskUserQuestion): query the schools
 * table directly rather than maintain a separate config file as a second
 * source of truth — the invariant is already true by construction once a
 * school is provisioned, so there's nothing else to keep in sync.
 */
import type { SqliteConnection } from '../sqlite/connection';

export class LocalInstallSchoolError extends Error {
  constructor(message: string, public readonly code: 'NOT_PROVISIONED' | 'MULTIPLE_SCHOOLS') {
    super(message);
    this.name = 'LocalInstallSchoolError';
  }
}

/** Errors loudly rather than guessing — a local install with zero schools
 *  (not yet provisioned) or more than one (an invariant violation that
 *  should never happen, but must never be silently papered over if it
 *  somehow does) are both real, actionable failures, not states to
 *  silently pick a default for. */
export function getLocalInstallSchoolId(db: SqliteConnection): number {
  const rows = db.prepare(`SELECT id FROM schools WHERE deleted_at IS NULL`).all() as { id: number }[];
  if (rows.length === 0) {
    throw new LocalInstallSchoolError(
      'This local install has no provisioned school yet — run provisioning before attempting offline login.',
      'NOT_PROVISIONED',
    );
  }
  if (rows.length > 1) {
    throw new LocalInstallSchoolError(
      `This local install has ${rows.length} schools, expected exactly one (§9's one-school-per-install invariant is violated).`,
      'MULTIPLE_SCHOOLS',
    );
  }
  return rows[0].id;
}
