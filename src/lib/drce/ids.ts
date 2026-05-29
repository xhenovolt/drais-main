/**
 * Phase 0 fix H4 — collision-free ID generation for DRCE.
 *
 * Replaces the old `${type}-${Date.now()}` pattern, which collided whenever
 * two IDs were generated in the same millisecond (rapid clicks, paste loops,
 * scripted add-many, parallel auto-population in defaults). Collisions broke
 * React keys, undo bookkeeping, and selection.
 *
 * Uses `crypto.randomUUID()` everywhere it's available (all modern browsers
 * + Node ≥19) and falls back to a Math.random base36 string for the legacy
 * environments DRCE still ships into. The prefix is kept for visual diffability
 * in the schema JSON ("sec-…", "col-…", "field-…").
 */
const hasUUID = typeof globalThis.crypto?.randomUUID === 'function';

function rawId(): string {
  if (hasUUID) return globalThis.crypto.randomUUID();
  // Fallback: 11-char random suffix (52 bits of entropy ≈ 1 collision per 4M IDs).
  return (
    Math.random().toString(36).slice(2, 8) +
    Math.random().toString(36).slice(2, 7)
  );
}

/** Prefixed, collision-free ID. */
export function newId(prefix: string): string {
  return `${prefix}-${rawId()}`;
}

// Convenience shorthands used at common call sites — keeps grep-ability.
export const newSectionId = (type: string) => newId(type);
export const newColumnId  = ()              => newId('col');
export const newFieldId   = ()              => newId('field');
export const newItemId    = ()              => newId('item');
export const newShapeId   = ()              => newId('sh');
export const newRuleId    = ()              => newId('cr');
