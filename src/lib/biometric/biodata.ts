/**
 * Classify one uploaded template record (ADMS tables TEMPLATEV10 / BIODATA / OPERLOG "FP" lines).
 *
 * Keys arrive upper-cased (see parseZKBody). Devices send:
 *   TEMPLATEV10 / FP lines:  PIN, FID (or FINGERID), SIZE, VALID, TMP
 *   BIODATA:                 PIN, NO (finger slot for fingerprints), INDEX, VALID, DURESS, TYPE, MAJORVER,
 *                            MINORVER, FORMAT, TMP
 * BIODATA TYPE: 1 = fingerprint, 2 = face (near-infrared), 9 = face (visible light); others (palm, iris,
 * vein, voice) are not used by DRAIS.
 *
 * Why this exists: BIODATA used to be handled as a fingerprint whatever its TYPE, and the finger slot was read
 * from FID/IDX which BIODATA does not send — so every finger from such a device landed in slot 0 (a second
 * finger overwrote the first) and a face template was stored as if it were a fingerprint.
 */

export type BioKind = 'finger' | 'face' | 'other';

export interface BioRecord {
  kind: BioKind;
  pin: string;
  /** Finger slot 0-9 (fingerprints only). */
  fingerIndex: number;
  /** Raw BIODATA TYPE, when present. */
  type: string | null;
  size: number;
  valid: string;
  template: string;
}

const FACE_TYPES = new Set(['2', '9']);

export function classifyBioRecord(rec: Record<string, string>): BioRecord {
  const pin = String(rec.PIN ?? rec['FP PIN'] ?? '').trim();
  const rawType = rec.TYPE != null && String(rec.TYPE).trim() !== '' ? String(rec.TYPE).trim() : null;
  const template = String(rec.TMP ?? rec.TEMPLATE ?? '').trim();

  const kind: BioKind = rawType == null || rawType === '1' ? 'finger' : FACE_TYPES.has(rawType) ? 'face' : 'other';

  // Finger slot: FID (FP lines, TEMPLATEV10) → FINGERID → NO (BIODATA). INDEX/IDX is the template instance, not the finger.
  const slotRaw = rec.FID ?? rec.FINGERID ?? rec.NO ?? '0';
  const slot = parseInt(String(slotRaw), 10);
  const fingerIndex = Number.isFinite(slot) && slot >= 0 && slot <= 9 ? slot : 0;

  const declared = parseInt(String(rec.SIZE ?? '0'), 10);
  // A base64 template of length L holds about L*3/4 bytes.
  const size = Number.isFinite(declared) && declared > 0 ? declared : Math.floor((template.length * 3) / 4);

  return { kind, pin, fingerIndex, type: rawType, size, valid: String(rec.VALID ?? '1'), template };
}
