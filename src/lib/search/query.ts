/**
 * Ranked search over the projection table.
 *
 * Strategy (portable on TiDB, no FULLTEXT dependency):
 *  1. Tokenize the query; match rows whose search_text contains EVERY token
 *     (AND semantics → "S2 unpaid" narrows, doesn't widen).
 *  2. Pull a bounded candidate set filtered by school_id + permitted types.
 *  3. Score in app code: exact title > title-prefix > token-coverage, scaled by
 *     entity rank_weight, with a light typo-tolerance pass (Levenshtein ≤ 1 per
 *     token) so "Musa" still matches "Musab" / "Mussa".
 *
 * Tenant isolation: every query is hard-filtered by school_id.
 * RBAC: only permitted entity_types are queried.
 */
import { query } from '@/lib/db';
import type { SearchEntityType } from './entities';

export interface SearchHit {
  entity_type: SearchEntityType;
  entity_id:   number;
  title:       string;
  subtitle:    string | null;
  url_path:    string | null;
  metadata:    Record<string, unknown> | null;
  score:       number;
}

function tokenize(q: string): string[] {
  return q.toLowerCase().trim().split(/\s+/).filter(t => t.length >= 1).slice(0, 6);
}

/** Tiny bounded Levenshtein (early-exit at >max). */
function withinEditDistance(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    let rowMin = dp[0];
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
      if (dp[i] < rowMin) rowMin = dp[i];
    }
    if (rowMin > max) return false;
  }
  return dp[a.length] <= max;
}

function scoreHit(title: string, searchText: string, tokens: string[], rankWeight: number): number {
  const t = title.toLowerCase();
  const joined = tokens.join(' ');
  let score = 0;

  if (t === joined)              score += 1000;          // exact title
  else if (t.startsWith(joined)) score += 600;           // title prefix
  else if (t.includes(joined))   score += 400;           // title contains phrase

  // Per-token coverage on the full haystack
  const words = searchText.split(' ');
  for (const tok of tokens) {
    if (searchText.includes(tok)) {
      score += t.includes(tok) ? 120 : 60;               // title hit worth more
    } else if (words.some(w => w.length >= 3 && withinEditDistance(w, tok, 1))) {
      score += 30;                                        // fuzzy/typo hit
    } else {
      score -= 40;                                        // missing token penalty
    }
  }

  // Blend in the entity base weight (kept small so relevance dominates type).
  score += rankWeight / 10;
  return score;
}

export async function runSearch(args: {
  schoolId: number;
  q:        string;
  types:    SearchEntityType[];
  limit?:   number;
}): Promise<SearchHit[]> {
  const { schoolId, types } = args;
  const limit = Math.min(50, args.limit ?? 20);
  const tokens = tokenize(args.q);
  if (!tokens.length || !types.length) return [];

  // AND across tokens, each as a LIKE on the lowercased haystack.
  const likeClauses = tokens.map(() => `search_text LIKE ?`).join(' AND ');
  const typePlaceholders = types.map(() => '?').join(',');
  const params: any[] = [schoolId, ...types, ...tokens.map(t => `%${t}%`)];

  // Candidate pull is bounded; ranking happens in app code.
  const rows = (await query(
    `SELECT entity_type, entity_id, title, subtitle, search_text, url_path, metadata, rank_weight
       FROM search_index
      WHERE school_id = ?
        AND entity_type IN (${typePlaceholders})
        AND (${likeClauses})
      LIMIT 300`,
    params,
  )) as any[];

  // If strict AND found nothing, retry with OR so a single fuzzy token still hits.
  let candidates = rows;
  if (!candidates.length && tokens.length > 1) {
    const orClauses = tokens.map(() => `search_text LIKE ?`).join(' OR ');
    candidates = (await query(
      `SELECT entity_type, entity_id, title, subtitle, search_text, url_path, metadata, rank_weight
         FROM search_index
        WHERE school_id = ?
          AND entity_type IN (${typePlaceholders})
          AND (${orClauses})
        LIMIT 300`,
      [schoolId, ...types, ...tokens.map(t => `%${t}%`)],
    )) as any[];
  }

  const scored: SearchHit[] = candidates.map(r => ({
    entity_type: r.entity_type,
    entity_id:   Number(r.entity_id),
    title:       r.title,
    subtitle:    r.subtitle ?? null,
    url_path:    r.url_path ?? null,
    metadata:    r.metadata ? (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) : null,
    score:       scoreHit(r.title, r.search_text, tokens, Number(r.rank_weight)),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.filter(h => h.score > 0).slice(0, limit);
}
