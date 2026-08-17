/**
 * Sheet-name semantics — deterministic, no I/O, no DB.
 *
 * A worksheet name is data: "S.2 Blue", "Senior 1 Red", "P.6 Girls",
 * "Form 3", "Term 2 Fees" all carry real information a school never
 * typed into a column. This module extracts that as INFERRED CONTEXT
 * with a confidence score — never applied silently. The caller (Phase B
 * review UI) shows it to the user as "Sheet 'S.2 Blue' appears to mean
 * Class = Senior 2, Stream = Blue. Confidence: 91%" and lets them
 * correct it, exactly as specified.
 *
 * Deliberately pattern-based, not ML — a small set of named-level
 * vocabularies (Uganda-shaped by default: Nursery/Baby/Middle/Top,
 * Primary/P., Senior/S., Form) plus generic Grade/Class/Year N. A school
 * whose naming doesn't match any pattern gets confidence 0 and the
 * caller falls back to column-based class resolution — this module
 * never blocks anything, it only adds a hint when it has one.
 */

export interface SheetNameContext {
  className: string | null;
  streamName: string | null;
  genderHint: 'male' | 'female' | null;
  /** e.g. "Fees" if the name reads as a dataset label rather than a class. */
  datasetHint: 'students' | 'fees' | 'results' | null;
  termHint: string | null;
  /** 0..1 overall confidence in the extraction as a whole. 0 = no signal found. */
  confidence: number;
  /** Human-readable explanation for the review UI. */
  reason: string;
}

const CLASS_LEVEL_PATTERNS: Array<{ re: RegExp; label: (m: RegExpMatchArray) => string }> = [
  { re: /\bp\.?\s*(\d{1,2})\b/i, label: (m) => `Primary ${m[1]}` },
  { re: /\bprimary\s*(\d{1,2})\b/i, label: (m) => `Primary ${m[1]}` },
  { re: /\bs\.?\s*(\d{1,2})\b/i, label: (m) => `Senior ${m[1]}` },
  { re: /\bsenior\s*(\d{1,2})\b/i, label: (m) => `Senior ${m[1]}` },
  { re: /\bform\s*(\d{1,2})\b/i, label: (m) => `Form ${m[1]}` },
  { re: /\bgrade\s*(\d{1,2})\b/i, label: (m) => `Grade ${m[1]}` },
  { re: /\byear\s*(\d{1,2})\b/i, label: (m) => `Year ${m[1]}` },
  { re: /\bbaby\s*class\b/i, label: () => 'Baby Class' },
  { re: /\bmiddle\s*class\b/i, label: () => 'Middle Class' },
  { re: /\btop\s*class\b/i, label: () => 'Top Class' },
  { re: /\bnursery\b/i, label: () => 'Nursery' },
];

const DATASET_PATTERNS: Array<{ re: RegExp; label: SheetNameContext['datasetHint'] }> = [
  { re: /\bfees?\b/i, label: 'fees' },
  { re: /\bpayments?\b/i, label: 'fees' },
  { re: /\bbalances?\b/i, label: 'fees' },
  { re: /\bresults?\b/i, label: 'results' },
  { re: /\bmarks?\b/i, label: 'results' },
  { re: /\bscores?\b/i, label: 'results' },
  { re: /\b(students?|learners?|roll|register)\b/i, label: 'students' },
];

const TERM_PATTERN = /\bterm\s*(\d)\b/i;

export function inferContextFromSheetName(sheetName: string): SheetNameContext {
  const name = sheetName.trim();
  if (!name) {
    return { className: null, streamName: null, genderHint: null, datasetHint: null, termHint: null, confidence: 0, reason: 'empty sheet name' };
  }

  let className: string | null = null;
  let classMatchEnd = -1;
  for (const p of CLASS_LEVEL_PATTERNS) {
    const m = name.match(p.re);
    if (m && m.index !== undefined) {
      className = p.label(m);
      classMatchEnd = m.index + m[0].length;
      break;
    }
  }

  let genderHint: SheetNameContext['genderHint'] = null;
  if (/\bgirls?\b/i.test(name)) genderHint = 'female';
  else if (/\bboys?\b/i.test(name)) genderHint = 'male';

  let datasetHint: SheetNameContext['datasetHint'] = null;
  for (const p of DATASET_PATTERNS) {
    if (p.re.test(name)) { datasetHint = p.label; break; }
  }

  const termMatch = name.match(TERM_PATTERN);
  const termHint = termMatch ? `Term ${termMatch[1]}` : null;

  // Stream: whatever's left after removing the class-level match, gender
  // words, dataset words, and term words — if it's a short, plain word,
  // treat it as a stream name (e.g. "Blue", "Red", "A", "North").
  let streamName: string | null = null;
  if (className) {
    let remainder = name.slice(classMatchEnd).trim();
    remainder = remainder.replace(/\b(girls?|boys?)\b/gi, '').replace(TERM_PATTERN, '').trim();
    remainder = remainder.replace(/^[-–—\s]+|[-–—\s]+$/g, '');
    if (remainder && /^[A-Za-z][A-Za-z0-9 ]{0,20}$/.test(remainder) && !DATASET_PATTERNS.some((p) => p.re.test(remainder))) {
      streamName = remainder;
    }
  }

  const signals = [className, streamName, genderHint, datasetHint, termHint].filter(Boolean).length;
  const confidence = signals === 0 ? 0 : Math.min(0.98, 0.55 + signals * 0.15);

  const parts: string[] = [];
  if (className) parts.push(`Class = ${className}`);
  if (streamName) parts.push(`Stream = ${streamName}`);
  if (genderHint) parts.push(`Gender = ${genderHint}`);
  if (datasetHint) parts.push(`Dataset = ${datasetHint}`);
  if (termHint) parts.push(termHint);
  const reason = parts.length ? `Sheet "${name}" appears to mean: ${parts.join(', ')}` : `No recognizable pattern in sheet name "${name}"`;

  return { className, streamName, genderHint, datasetHint, termHint, confidence, reason };
}
