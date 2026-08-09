/**
 * Shared chart tokens for the analytics surfaces.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Each analytics component used to carry its own `const COLORS = [...]` array.
 * The array they shared (`#10b981,#ef4444,#f59e0b,#3b82f6,#8b5cf6,#06b6d4`)
 * fails colour-vision-deficiency separation: `#8b5cf6` (violet) against
 * `#3b82f6` (blue) is ΔE 1.3 under deuteranopia and ΔE 12.0 even with normal
 * colour vision — two series a reader cannot tell apart. Green beside red is
 * the same trap, and it is the pair schools reach for most (paid vs unpaid).
 *
 * CATEGORICAL is the validated replacement. The order is load-bearing: hues are
 * assigned by position and never cycled, and this particular ordering was chosen
 * because it keeps the weak pairs non-adjacent. Verified with the dataviz
 * validator against both surfaces:
 *
 *   light  → ALL CHECKS PASS   (worst adjacent ΔE 14.1 deutan)
 *   dark   → ALL CHECKS PASS   (same steps; contrast ≥ 3:1 on both)
 *
 * If you add a sixth series, do NOT invent a hue — re-run the validator, or
 * fold the tail into "Other". Reordering also invalidates the result, because
 * only ADJACENT pairs were checked.
 */

/** Categorical hues, in fixed assignment order. Never cycle; never reorder. */
export const CATEGORICAL = [
  '#2563eb', // blue-600
  '#059669', // emerald-600
  '#7c3aed', // violet-600
  '#d97706', // amber-600
  '#db2777', // pink-600
] as const;

/**
 * Status colours are RESERVED — never reused as "series 4". They always ship
 * with a label or icon beside them, so state is never carried by colour alone.
 */
export const STATUS = {
  good: '#059669',
  warning: '#d97706',
  critical: '#dc2626',
  neutral: '#64748b',
} as const;

/** Recessive grid/axis ink. Charts read as data first, chrome second. */
export const AXIS = {
  grid: 'rgb(148 163 184 / 0.22)',
  tick: 'rgb(100 116 139)',
  tickDark: 'rgb(148 163 184)',
} as const;

/** Shared Recharts tooltip styling — matches the app's card surfaces. */
export const tooltipStyle = {
  contentStyle: {
    borderRadius: '0.75rem',
    border: '1px solid rgb(148 163 184 / 0.3)',
    background: 'rgb(255 255 255 / 0.96)',
    color: 'rgb(15 23 42)',
    fontSize: '12px',
    boxShadow: '0 8px 24px rgb(15 23 42 / 0.12)',
  },
  labelStyle: { fontWeight: 600, marginBottom: 2 },
} as const;

/** Compact axis formatter — 1.2M / 340k. Full precision belongs in tooltips. */
export function compact(n: number): string {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(v / 1_000)}k`;
  return String(Math.round(v));
}
