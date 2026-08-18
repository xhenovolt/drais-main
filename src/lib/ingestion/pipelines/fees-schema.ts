/**
 * Fees canonical field catalog + pure validation/identity logic —
 * import redesign Phase C.
 *
 * Consolidates the readiness audit's #2-ranked gap: four separate,
 * inconsistent fee-writing paths (src/lib/finance/import.ts,
 * src/lib/finance/feeImport.ts, /api/finance/bulk-import, and a lump-sum
 * write buried inside the STUDENT importer itself) with three different
 * matching keys. This is not a rewrite of those four — they stay exactly
 * as they are, reachable exactly as before. This is the ONE new,
 * consolidated path going forward, built on the same generic
 * IngestionPipeline<TRow> contract already proven for students/results.
 *
 * Row shape models a single PAYMENT record (admission_no + amount +
 * method + date + optional term/reference) — the shape
 * src/lib/finance/import.ts already uses, and the one most real school
 * fee-history exports actually look like. A wide, one-column-per-fee-item
 * shape (tuition | transport | lunch | balance) is NOT handled here —
 * that needs its own explode step, the same way results' wide marksheets
 * get exploded before hitting the generic pipeline
 * (class_results/import/v2/route.ts's explodeWideResultsRows). Out of
 * scope for this pass; the purpose-guesser already recognizes such
 * sheets as 'fees', so a future explode step slots in the same place.
 *
 * Split into a pure, DB-free file (same reasoning as
 * students-schema.ts / results-schema.ts): fees.ts imports getConnection
 * for its commit() implementation, which pulls in mysql2 → tls and
 * breaks tsx --test. Nothing here needs the database.
 */
import type { CanonicalField, IdentityClaim, RawCellValue, RowProvenance } from '../types';

export const FEE_FIELDS: CanonicalField[] = [
  {
    name: 'admission_no',
    label: 'Admission Number',
    synonyms: [
      'admission no', 'adm no', 'adm number', 'admno', 'admission number',
      'reg no', 'regno', 'registration no', 'registration number',
      'student id', 'student number', 'student no', 'studentid',
      'index no', 'index number', 'pin', 'pupil no', 'learner id',
    ],
    type: 'string',
    required: true,
  },
  {
    name: 'amount',
    label: 'Amount',
    synonyms: [
      'amount paid', 'paid', 'payment', 'amount', 'tuition', 'fees paid',
      'total paid', 'amt', 'amt paid', 'value',
    ],
    type: 'float',
    required: true,
  },
  {
    name: 'method',
    label: 'Payment Method',
    synonyms: ['payment method', 'mode of payment', 'mode', 'channel'],
    type: 'string',
  },
  {
    name: 'date',
    label: 'Payment Date',
    synonyms: ['payment date', 'date paid', 'transaction date', 'paid on'],
    type: 'date',
  },
  {
    name: 'term',
    label: 'Term',
    synonyms: ['term name', 'semester'],
    type: 'string',
  },
  {
    name: 'reference',
    label: 'Reference',
    synonyms: ['ref', 'ref no', 'reference no', 'transaction id', 'receipt no', 'receipt number'],
    type: 'string',
  },
  {
    name: 'payer_name',
    label: 'Paid By',
    synonyms: ['paid by', 'payer', 'parent name', 'guardian name'],
    type: 'string',
  },
];

export interface FeeRow {
  admission_no: string;
  amount: number;
  method: string | null;
  date: string | null;      // YYYY-MM-DD
  term: string | null;      // raw text — resolved to a termId (or not) at commit time
  reference: string | null;
  payer_name: string | null;
}

function coerceString(v: RawCellValue): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function parseMoney(v: RawCellValue): number | null {
  if (v == null || v === '') return null;
  const cleaned = String(v).replace(/[\s,]/g, '');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDateToIso(v: RawCellValue): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const mon = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${mon}-${day}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function validateFeeRow(
  mapped: Record<string, RawCellValue>,
  _provenance: RowProvenance,
): { ok: true; value: FeeRow } | { ok: false; error: string } {
  const admission = coerceString(mapped.admission_no);
  if (!admission) return { ok: false, error: 'admission_no is empty' };

  const amount = parseMoney(mapped.amount);
  if (amount == null) return { ok: false, error: 'amount is missing or not a number' };
  if (amount <= 0) return { ok: false, error: `amount must be positive, got ${amount}` };

  return {
    ok: true,
    value: {
      admission_no: admission,
      amount,
      method: coerceString(mapped.method),
      date: parseDateToIso(mapped.date),
      term: coerceString(mapped.term),
      reference: coerceString(mapped.reference),
      payer_name: coerceString(mapped.payer_name),
    },
  };
}

/**
 * Deliberately admission_no ONLY — no firstName/lastName in the claim.
 * A fee row's admission number either matches a real student or it
 * doesn't; falling back to fuzzy name-matching for MONEY is exactly the
 * kind of authoritative-fuzzy-match the brief explicitly forbids ("Do
 * NOT use fuzzy name matching as an authoritative identity mechanism").
 * personRole is 'student' so the identity resolver's admission-exact
 * path (the fast, strong signal) runs — it just never reaches the
 * name-fallback path at all, because no name is offered.
 */
export function feeIdentityFromRow(row: FeeRow): IdentityClaim {
  return {
    admissionNo: row.admission_no,
    personRole: 'student',
  };
}
