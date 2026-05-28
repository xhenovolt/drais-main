/**
 * Built-in DRCE computed fields. Pure functions of DRCEDataContext.
 *
 * Adding a new built-in here is a one-line change for the whole engine —
 * the editor's variable picker, the print renderer, and the resolver all
 * pick it up automatically.
 *
 * Hard rule: NO I/O, NO `Date.now()` for logic decisions, NO DB access.
 * Anything time-related must come through the context (snapshot.meta).
 */
import type { DRCEDataContext } from '../schema';
import { registerComputed } from './registry';

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ─── Academic calendar ─────────────────────────────────────────────────────

registerComputed({
  name: 'next_term_begins',
  description: 'Date the next academic term begins. Prefers inferred calendar; falls back to the manually-set value baked into the snapshot.',
  group: 'academic',
  compute: (ctx) =>
    ctx.meta.calendar?.next_term_starts_at
    ?? ctx.meta.nextTermBegins
    ?? null,
});

registerComputed({
  name: 'next_term_begins_inferred',
  description: 'Calendar-inferred next-term start (ignores manual override). Useful for editors who want to compare.',
  group: 'academic',
  compute: (ctx) => ctx.meta.calendar?.next_term_starts_at ?? null,
});

registerComputed({
  name: 'this_term_ends',
  description: 'Calendar-inferred end date of the current term.',
  group: 'academic',
  compute: (ctx) => ctx.meta.calendar?.this_term_ends_at ?? null,
});

registerComputed({
  name: 'next_term_name',
  description: 'Name of the next academic term (e.g. "Term 3" or "Term 1 — 2027" when crossing year).',
  group: 'academic',
  compute: (ctx) => {
    const c = ctx.meta.calendar;
    if (!c?.next_term_name) return null;
    return c.year_rollover ? `${c.next_term_name} — next year` : c.next_term_name;
  },
});

registerComputed({
  name: 'prev_term_name',
  description: 'Name of the previous academic term.',
  group: 'academic',
  compute: (ctx) => ctx.meta.calendar?.prev_term_name ?? null,
});

registerComputed({
  name: 'year_rollover',
  description: 'True when the next term belongs to a different academic year.',
  group: 'academic',
  compute: (ctx) => !!ctx.meta.calendar?.year_rollover,
});

// ─── Student summary ───────────────────────────────────────────────────────

registerComputed({
  name: 'student_full_name',
  description: 'Canonical full name from the snapshot.',
  group: 'student',
  compute: (ctx) => ctx.student.fullName,
});

registerComputed({
  name: 'student_initials',
  description: 'Uppercase initials from first + last name.',
  group: 'student',
  compute: (ctx) => {
    const f = (ctx.student.firstName ?? '').trim().charAt(0).toUpperCase();
    const l = (ctx.student.lastName  ?? '').trim().charAt(0).toUpperCase();
    return `${f}${l}`;
  },
});

// ─── Performance ──────────────────────────────────────────────────────────

registerComputed({
  name: 'average_score',
  description: 'Arithmetic mean of all numeric scores in the results table.',
  group: 'performance',
  compute: (ctx) => {
    const scores = ctx.results
      .map(r => num((r as unknown as Record<string, unknown>).score ?? (r as unknown as Record<string, unknown>).total))
      .filter((n): n is number => n !== null);
    if (!scores.length) return null;
    return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  },
});

registerComputed({
  name: 'subjects_passed',
  description: 'Count of subjects with score ≥ 50.',
  group: 'performance',
  compute: (ctx) => ctx.results.reduce((acc, r) => {
    const s = num((r as unknown as Record<string, unknown>).score);
    return s !== null && s >= 50 ? acc + 1 : acc;
  }, 0),
});

registerComputed({
  name: 'subjects_failed',
  description: 'Count of subjects with score < 50.',
  group: 'performance',
  compute: (ctx) => ctx.results.reduce((acc, r) => {
    const s = num((r as unknown as Record<string, unknown>).score);
    return s !== null && s < 50 ? acc + 1 : acc;
  }, 0),
});

// ─── School (re-exposed under stable names) ────────────────────────────────

registerComputed({
  name: 'school_name',
  description: 'School display name from the snapshot branding.',
  group: 'school',
  compute: (ctx) => ctx.meta.schoolName ?? null,
});

registerComputed({
  name: 'school_address',
  description: 'School address from the snapshot branding.',
  group: 'school',
  compute: (ctx) => ctx.meta.schoolAddress ?? null,
});

registerComputed({
  name: 'report_title',
  description: 'Title of this report (term + year).',
  group: 'meta',
  compute: (ctx) => ctx.meta.reportTitle ?? null,
});

// ─── Side-effect: registration runs at module load ─────────────────────────
//
// Importing this file from `resolveExpression.ts` is enough to populate the
// registry. There is no explicit init step; tests can re-import.
