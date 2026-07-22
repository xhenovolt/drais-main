/**
 * Intelligent device-user ↔ DRAIS-person matching engine.
 *
 * Compares free-text names from a biometric device directory against DRAIS
 * people and produces a 0–100 confidence score with an action tier:
 *
 *   auto       ≥ 90   — safe to confirm in bulk
 *   review     60–89  — an admin must eyeball it
 *   unmatched  < 60   — no plausible candidate
 *
 * Robust against the naming chaos real school devices exhibit:
 *   - capitalization / accents        "JOHN DOE" ≡ "John Doe"
 *   - token order                     "DOE JOHN" ≡ "JOHN DOE"
 *   - missing middle names            "Moses Kato" ~ "Moses Ibrahim Kato"
 *   - fused tokens                    "JOHNDOE"  ~ "JOHN DOE"
 *   - typos (edit distance)           "Muhamadi" ~ "Muhammadi"
 *   - initials                        "MOSES K"  ~ "Moses Kato"
 *
 * PURE module — no DB, no device I/O — so every school's naming quirks can
 * be unit-tested and the engine reused by any acquisition source (TCP,
 * ADMS, CSV import). Orchestration lives in device-user-sync.ts.
 */

export interface DeviceUserForMatch {
  pin: string;
  name: string;
  privilege?: number | null;
  card?: string | null;
}

export interface MatchCandidate {
  /** staff.id or students.id */
  refId: number;
  roleType: 'staff' | 'student';
  personId?: number | null;
  name: string;
  position?: string | null;
  department?: string | null;
}

export type MatchTier = 'auto' | 'review' | 'unmatched';

export interface ScoredCandidate extends MatchCandidate {
  confidence: number; // 0–100
}

export interface DeviceUserMatch {
  device: DeviceUserForMatch;
  best: ScoredCandidate | null;
  alternatives: ScoredCandidate[]; // up to 2 more, descending confidence
  tier: MatchTier;
  /** set when an auto match was downgraded because two device users claimed
   *  the same person (protection: never map two PINs to one employee). */
  contested?: boolean;
}

// ── Normalization ───────────────────────────────────────────────────────────

export function normalizeName(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]+/g, ' ')
    .trim();
}

export function nameTokens(s: string): string[] {
  const n = normalizeName(s);
  return n ? n.split(' ') : [];
}

// ── Token similarity ────────────────────────────────────────────────────────

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

/** Similarity of two name tokens, 0..1. */
export function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  // Initial vs full name: "K" matches "KATO" (weaker than a full match).
  if (a.length === 1 || b.length === 1) {
    return a[0] === b[0] ? 0.72 : 0;
  }
  // Nickname/short-form prefix: "MUHAMMED"/"MUHAMMEDI", "SAM"/"SAMUEL".
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length >= 3 && longer.startsWith(shorter)) {
    return Math.max(0.8, shorter.length / longer.length);
  }
  const dist = levenshtein(a, b);
  const sim = 1 - dist / Math.max(a.length, b.length);
  // Below 0.6 per-token means "different word" — don't reward noise.
  return sim >= 0.6 ? sim : 0;
}

// ── Name scoring ────────────────────────────────────────────────────────────

/**
 * Handle fused tokens: if `tok` matches the CONCATENATION of 2..3 unused
 * tokens on the other side ("JOHNDOE" vs JOHN+DOE), return the consumed
 * indexes + similarity of the joined comparison.
 */
function fusedMatch(tok: string, others: string[], used: boolean[]): { sim: number; consume: number[] } | null {
  const n = others.length;
  for (let count = 2; count <= 3; count++) {
    // try consecutive-index combinations first (names fuse adjacently),
    // then all pairs for count=2 (reversed fusions like "DOEJOHN").
    const combos: number[][] = [];
    for (let i = 0; i + count <= n; i++) combos.push(Array.from({ length: count }, (_, k) => i + k));
    if (count === 2) {
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) combos.push([i, j]);
    }
    for (const combo of combos) {
      if (combo.some(i => used[i])) continue;
      const joined = combo.map(i => others[i]).join('');
      if (Math.abs(joined.length - tok.length) > 3) continue;
      const dist = levenshtein(tok, joined);
      const sim = 1 - dist / Math.max(tok.length, joined.length);
      if (sim >= 0.85) return { sim, consume: combo };
    }
  }
  return null;
}

/**
 * Score how well a device name matches a DRAIS name. 0..100.
 *
 * Order-free greedy alignment of the SHORTER token list onto the longer;
 * unmatched tokens on the shorter side crash the score (a failed claim),
 * extra tokens on the longer side cost 6 points each (missing middle
 * names): "John Doe" vs "John David Doe" → 94.
 */
export function scoreNameMatch(deviceName: string, draisName: string): number {
  let ta = nameTokens(deviceName);
  let tb = nameTokens(draisName);
  if (ta.length === 0 || tb.length === 0) return 0;
  // Compare from the shorter side.
  if (ta.length > tb.length) [ta, tb] = [tb, ta];

  const used = new Array(tb.length).fill(false);
  let simSum = 0;
  let matched = 0;

  for (const tok of ta) {
    // best single-token match
    let bestI = -1, bestSim = 0;
    for (let i = 0; i < tb.length; i++) {
      if (used[i]) continue;
      const sim = tokenSimilarity(tok, tb[i]);
      if (sim > bestSim) { bestSim = sim; bestI = i; }
    }
    // fused alternative ("JOHNDOE" consuming JOHN+DOE)
    const fused = bestSim < 0.85 ? fusedMatch(tok, tb, used) : null;
    if (fused && fused.sim > bestSim) {
      for (const i of fused.consume) used[i] = true;
      simSum += fused.sim;
      matched++;
      continue;
    }
    if (bestI >= 0 && bestSim > 0) {
      used[bestI] = true;
      simSum += bestSim;
      matched++;
    }
    // unmatched shorter-side token contributes 0 to simSum
  }

  const base = simSum / ta.length; // failed claims punished
  // Extra (unmatched) tokens on the fuller name: a missing MIDDLE name is
  // normal (×0.94 each) — "John Doe" vs "John David Doe" → 94, still auto.
  // A missing FIRST name is suspicious (×0.85): "HAUMBA MOSES" vs
  // "Hamuza Moses Haumba" must land in review, not auto — sibling names
  // often share surname + one given name.
  let extraPenalty = 1;
  for (let i = 0; i < tb.length; i++) {
    if (!used[i]) extraPenalty *= i === 0 ? 0.85 : 0.94;
  }
  extraPenalty = Math.max(0.6, extraPenalty);
  const single = ta.length === 1 && matched === 1 ? 0.9 : 1; // one-token names are weak evidence
  return Math.round(base * extraPenalty * single * 100);
}

export function tierFor(confidence: number): MatchTier {
  if (confidence >= 90) return 'auto';
  if (confidence >= 60) return 'review';
  return 'unmatched';
}

// ── Directory matching ──────────────────────────────────────────────────────

/**
 * Match a device directory against DRAIS candidates.
 *
 * Protections built in:
 *   - a candidate can be the AUTO match of at most ONE device user; when two
 *     device users claim the same person at auto tier, both are downgraded
 *     to review and flagged `contested` (never map two PINs to one person
 *     automatically)
 *   - candidates the caller already knows are enrolled must be excluded
 *     BEFORE calling (orchestrator's job) — this engine only sees free
 *     people.
 */
export function matchDeviceUsers(
  deviceUsers: readonly DeviceUserForMatch[],
  candidates: readonly MatchCandidate[],
): DeviceUserMatch[] {
  const results: DeviceUserMatch[] = deviceUsers.map(device => {
    const scored: ScoredCandidate[] = [];
    for (const c of candidates) {
      const confidence = scoreNameMatch(device.name, c.name);
      if (confidence >= 40) scored.push({ ...c, confidence });
    }
    scored.sort((a, b) => b.confidence - a.confidence);
    const best = scored[0] ?? null;
    return {
      device,
      best,
      alternatives: scored.slice(1, 3),
      tier: best ? tierFor(best.confidence) : 'unmatched',
    };
  });

  // Contested-auto protection: one person, one PIN.
  const autoByRef = new Map<string, DeviceUserMatch[]>();
  for (const r of results) {
    if (r.tier === 'auto' && r.best) {
      const key = `${r.best.roleType}:${r.best.refId}`;
      const list = autoByRef.get(key) ?? [];
      list.push(r); autoByRef.set(key, list);
    }
  }
  for (const list of autoByRef.values()) {
    if (list.length > 1) {
      for (const r of list) { r.tier = 'review'; r.contested = true; }
    }
  }
  return results;
}
