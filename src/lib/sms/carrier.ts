/**
 * Uganda mobile network classification by phone prefix.
 *
 * This is a best-effort heuristic, not a lookup against the real number
 * portability database — a ported number keeps classifying by its ORIGINAL
 * network's prefix, which is wrong for however many numbers in a school's
 * contact book have been ported. There is no portability API wired in; if
 * UgaText or another provider ever exposes one, swap it in here. Until then
 * this is "best guess from the prefix," labeled as such everywhere it's shown.
 *
 * Prefixes below are the standard allocation as of this writing (2026). A
 * school's contact list will drift from this over time as numbers are
 * reassigned — review periodically rather than treating it as permanent.
 */
import { normalizePhoneNumber } from '@/lib/africastalking';

export type UgandaCarrier = 'mtn' | 'airtel' | 'other';

// Keyed by the 2 digits right after +256 (i.e. the local 0-prefix minus the 0).
const MTN_PREFIXES = new Set(['76', '77', '78', '39']);
const AIRTEL_PREFIXES = new Set(['70', '74', '75', '20']);

/** Best-effort Uganda carrier from a phone number's prefix. Non-Uganda or unparsable → 'other'. */
export function classifyUgandaCarrier(phone: string | null | undefined): UgandaCarrier {
  if (!phone) return 'other';
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return 'other';
  const prefix = normalized.slice(4, 6); // +256 XX ...
  if (MTN_PREFIXES.has(prefix)) return 'mtn';
  if (AIRTEL_PREFIXES.has(prefix)) return 'airtel';
  return 'other';
}
