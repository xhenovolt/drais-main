/**
 * Health check for 'local-sqlite' mode — the SQLite counterpart to
 * pools.ts's mysql2 healthCheck(), deliberately kept in its own file so
 * pools.ts can stay mysql2-only per its own documented contract
 * (assertMysqlMode() must never be asked to resolve a config for
 * 'local-sqlite' — see that file's header).
 *
 * Dynamic import only. better-sqlite3 is an optionalDependency that may
 * not even be installed on a hosted/serverless build; this function must
 * only ever be reached from code already gated by isLocalAllowed() (the
 * mode-switch API route), same discipline every other local-sqlite-aware
 * file in this codebase follows.
 */
export interface SqliteHealth {
  ok: boolean;
  mode: 'local-sqlite';
  database: string;
  host: string;
  error?: string;
}

export async function healthCheckSqlite(): Promise<SqliteHealth> {
  try {
    const { getSqliteDb, defaultSqlitePath } = await import('@/lib/repo/sqlite/singleton');
    const db = getSqliteDb();
    db.prepare('SELECT 1 AS test').get();
    return { ok: true, mode: 'local-sqlite', database: defaultSqlitePath(), host: 'local' };
  } catch (err) {
    return {
      ok: false,
      mode: 'local-sqlite',
      database: '',
      host: 'local',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
