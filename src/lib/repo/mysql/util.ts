/**
 * @drais/repo-mysql — shared boundary helpers.
 *
 * mysql2 returns DATETIME/TIMESTAMP columns as JS `Date` objects by
 * default (the shared pool in src/lib/db/pools.ts does not set the
 * `dateStrings` option, and this layer must not change that — it's the
 * proven online behavior, untouched per §8.1). The repo contract types
 * every timestamp as an ISO string (`IsoDateTime`), matching what
 * repo-sqlite naturally returns (SQLite has no native date type — these
 * columns are just TEXT). Every mysql repo must normalize at this
 * boundary, or a `Date` object leaks into code that only ever expects a
 * string — which is exactly what happened the first time this ran against
 * real production data (better-sqlite3's seed path throws immediately on
 * a bound `Date`, since it isn't one of the types SQLite can bind). The
 * bug was invisible in every test here because the test "source" is
 * itself SQLite-backed — already strings — so only a real MySQL read
 * surfaced it (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md, Phase 4).
 */
export function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/** Same problem, DATE columns (e.g. admission_date): mysql2 hands back a
 *  Date object too, but the contract type is a bare "YYYY-MM-DD" — a full
 *  ISO datetime string would be the wrong shape, not just an unbound type. */
export function toIsoDate(v: unknown): string | null {
  const iso = toIso(v);
  return iso ? iso.slice(0, 10) : null;
}

/**
 * The pool's own config sets `bigNumberStrings: true` (src/lib/db/
 * pools.ts:121-122 — deliberate, existing, untouched: safe handling of
 * BIGINT values that could lose precision as a JS number). Consequence:
 * every BIGINT column — every id, every school_id/person_id/village_id in
 * this codebase's schema — comes back from mysql2 as a STRING, not a
 * number. Found the hard way, again: provisionSchool's own tenant-
 * isolation guard rejected a real student row because
 * `"8002" !== 8002` under strict equality, even though both printed as
 * "8002". The rest of this codebase already works around this
 * per-call-site (`parseInt(r.device_user_id, 10) || 0` appears throughout
 * src/app/api/attendance/zk-tcp/route.ts and
 * src/lib/attendance/acquisition/commit.ts) — this repo layer needs the
 * same discipline applied consistently at its own boundary, not
 * per-call-site, so it can't be forgotten on the next new field. */
export function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new Error(`Expected a numeric BIGINT value, got ${JSON.stringify(v)}`);
  return n;
}

export function toNumOrNull(v: unknown): number | null {
  return v == null ? null : toNum(v);
}

/**
 * Real production `students.updated_at` can genuinely be NULL — found
 * provisioning a real school, not a schema defect this layer invented.
 * `TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` in the
 * idealized DDL (database/consolidated_schema.sql, already flagged
 * elsewhere in this codebase as "archaeological, not authoritative") does
 * not guarantee every row in a years-evolved production table actually
 * has that default applied — a column added later via a bare `ALTER
 * TABLE ADD COLUMN` to an already-populated table is the likely history
 * here. The repo contract's `IsoDateTime` fields are non-nullable by
 * design (every other consumer of a StudentRecord/SchoolRecord shouldn't
 * have to think about a missing timestamp) — so the boundary is where
 * this gets resolved, with an explicit, defensible fallback chain,
 * never a silent `null`/`"null"` slipping through:
 *   updated_at missing  -> falls back to created_at ("never updated since creation" — a reasonable reading of NULL, not a guess)
 *   created_at ALSO missing -> falls back to a fixed epoch sentinel, deliberately obviously-fake rather than "now" (which would misrepresent an unknown historical time as the moment this code happened to run)
 */
export const UNKNOWN_TIMESTAMP_SENTINEL = '1970-01-01T00:00:00.000Z';

export function toIsoRequired(v: unknown, fallback?: string): string {
  return toIso(v) ?? fallback ?? UNKNOWN_TIMESTAMP_SENTINEL;
}
