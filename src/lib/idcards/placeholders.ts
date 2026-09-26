/**
 * Placeholder intelligence for imported ID-card templates (pure, no imports).
 *
 * A template made in Publisher/Word/Canva always carries SAMPLE content: some other school's
 * name, a sample learner ("OCERO MOSES"), a sample class, ID number and dates. None of that is
 * final — it is filler that shows where the real data goes. This module decides, for each piece
 * of imported text, whether it is
 *   - a label to keep        ("NAME:", "CLASS:", "HEAD TEACHER'S SIGN:")
 *   - a placeholder          (→ {full_name}, {class}, {admission_no}, {issue_date}, {valid_until},
 *                                {school}, {school_address}, {school_phone}, …)
 *   - fixed wording to keep  ("STUDENT IDENTITY CARD", "If found please return …")
 * and returns the template text with `{tokens}` in place of the samples, plus an explanation of
 * every decision so the school can see (and correct) what DRAIS understood.
 */

export type PlaceholderKind =
  | 'school_name' | 'school_address' | 'school_phone' | 'school_email'
  | 'learner_name' | 'class' | 'admission_no' | 'issue_date' | 'valid_until' | 'dob' | 'guardian_phone';

export interface Finding {
  kind: PlaceholderKind;
  token: string;
  /** The sample text found in the template. */
  original: string;
  confidence: 'high' | 'medium';
  reason: string;
}

export type Side = 'front' | 'back';

export interface ClassifyContext {
  side: Side;
  /** The real school's name, when known — an exact appearance is always a placeholder. */
  knownSchoolName?: string;
}

// ───────────────────────── helpers ─────────────────────────

const collapse = (s: string) => s.replace(/[\s ]+/g, ' ').trim();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (s: string) => collapse(s).split(' ').filter(Boolean);
const stripPunct = (w: string) => w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');

const SCHOOL_KEYWORDS = new Set([
  'school', 'secondary', 'primary', 'college', 'academy', 'institute', 'university', 'nursery',
  'kindergarten', 'seminary', 'polytechnic', 'preparatory', 'madrasa', 'madrasah', 'tvet',
]);

/** Words that make a phrase a sentence / instruction / heading rather than a name. */
const NOT_A_NAME = new Set([
  'is', 'are', 'was', 'please', 'if', 'found', 'return', 'returned', 'property', 'this', 'that', 'the', 'above',
  'card', 'identity', 'identification', 'student', 'learner', 'pupil', 'holder', 'sign', 'signature', 'date', 'expiry',
  'valid', 'class', 'address', 'box', 'road', 'street', 'tel', 'phone', 'head', 'teacher', 'headteacher', 'principal',
  'headmaster', 'headmistress', 'director', 'no', 'id', 'name', 'motto', 'email', 'contact', 'call', 'to', 'of', 'for',
]);

/** Words that show a phrase is an instruction/label, so it cannot be a school's name. */
const SENTENCE_WORDS = new Set([
  'is', 'are', 'was', 'please', 'if', 'found', 'return', 'returned', 'property', 'this', 'that', 'above', 'card',
  'identity', 'identification', 'address', 'box', 'tel', 'phone', 'sign', 'signature', 'date', 'expiry', 'valid',
  'holder', 'student', 'learner', 'pupil',
]);

const hasKeyword = (s: string) => words(s).some((w) => SCHOOL_KEYWORDS.has(stripPunct(w).toLowerCase()));

// ───────────────────────── value shapes ─────────────────────────

export const looksLikeDate = (v: string): boolean => {
  const s = collapse(v);
  if (/\b\d{1,2}(st|nd|rd|th)?\s*[\/.\-\s]\s*\d{1,2}\s*[\/.\-\s]\s*\d{2,4}\b/i.test(s)) return true;
  if (/\b\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+\d{2,4}\b/i.test(s)) return true;
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\b/i.test(s)) return true;
  return false;
};

export const looksLikeClass = (v: string): boolean => {
  const s = collapse(v);
  if (/^(s|p|f|j|k)\s?\.?\s?[1-7][a-z]?$/i.test(s)) return true;                                   // S.6  P7  F4
  if (/^(form|class|grade|year|std|standard|senior|junior|primary)\s*\.?\s*([1-9]|[ivx]{1,4})\b/i.test(s)) return true;
  if (/^(baby|middle|top|nursery|kg|reception|pre-?unit)(\s+(class|one|two|three|\d))?$/i.test(s)) return true;
  return false;
};

export const looksLikeRegNo = (v: string): boolean => {
  const s = collapse(v);
  if (/^[A-Z]{1,8}\/[A-Za-z0-9]{1,8}(\/[A-Za-z0-9-]{1,10})+$/.test(s)) return true;               // JPA/A/822, ADM/2026/0042
  if (/^[A-Z]{1,5}[-\s]?\d{3,}$/.test(s)) return true;                                               // S1234, ADM-0042
  if (/^\d{2,4}\/[A-Za-z][A-Za-z0-9]{0,7}\/\d{1,6}$/.test(s)) return true;                           // 2026/S/0042 (a letter in the middle: 31/12/2025 is a date)
  return false;
};

export const looksLikePersonName = (v: string): boolean => {
  const ws = words(v);
  if (ws.length < 2 || ws.length > 5) return false;
  if (!ws.every((w) => /^[A-Za-z][A-Za-z'’.-]{1,24}$/.test(w))) return false;
  const lower = ws.map((w) => stripPunct(w).toLowerCase());
  if (lower.some((w) => NOT_A_NAME.has(w) || SCHOOL_KEYWORDS.has(w))) return false;
  const allCaps = ws.every((w) => w === w.toUpperCase());
  const titleCase = ws.every((w) => /^[A-Z][a-z'’.-]+$/.test(w));
  return allCaps || titleCase;
};

export const looksLikePhoneList = (v: string): boolean => /^[+\d][\d\s/,;+()-]{6,}$/.test(collapse(v));

// ───────────────────────── labels ─────────────────────────

/** Labels that belong to someone other than the learner/school — never treated as the learner's data. */
const OTHER_PERSON = /(head|teacher|principal|headmaster|headmistress|director|holder|parent|guardian|signature|sign|stamp|seal|authori[sz]ed|next ?of ?kin)/i;

interface LabelRule { re: RegExp; token: string; kind: PlaceholderKind; }

const LABEL_RULES: LabelRule[] = [
  { re: /^(name|names|fullname|fullnames|learnername|studentname|pupilname|nameofstudent|nameoflearner|nameofpupil|holdername|nameofholder)$/, token: 'full_name', kind: 'learner_name' },
  { re: /^(firstname|givenname|forename)$/, token: 'first_name', kind: 'learner_name' },
  { re: /^(surname|lastname|familyname)$/, token: 'last_name', kind: 'learner_name' },
  { re: /^(class|form|grade|level|stream|classstream|classform|classlevel)$/, token: 'class', kind: 'class' },
  { re: /^(idno|idnumber|id|regno|regnumber|registrationno|registrationnumber|admno|admissionno|admissionnumber|studentid|studentno|studentnumber|pupilno|indexno|lin|payno|cardno|cardnumber)$/, token: 'admission_no', kind: 'admission_no' },
  { re: /^(dateofissue|issuedate|dateissued|issued|issuedon|date|dateofissuing|issuingdate)$/, token: 'issue_date', kind: 'issue_date' },
  { re: /^(expiry|expirydate|expires|expireson|validuntil|validto|validtill|validity|expdate|dateofexpiry|validthru)$/, token: 'valid_until', kind: 'valid_until' },
  { re: /^(dob|dateofbirth|birthdate|born|dateborn)$/, token: 'dob', kind: 'dob' },
  { re: /^(address|postaladdress|schooladdress|location)$/, token: 'school_address', kind: 'school_address' },
  { re: /^(email|emailaddress|schoolemail)$/, token: 'school_email', kind: 'school_email' },
];

/** Which token does this label introduce? (`side` decides whose phone number "Tel:" is.) */
export function tokenForLabel(rawLabel: string, side: Side): { token: string; kind: PlaceholderKind } | null {
  const label = collapse(rawLabel.replace(/[:：]+\s*$/, ''));
  if (!label || OTHER_PERSON.test(label)) return null;
  const n = norm(label);
  if (/^(tel|telephone|phone|phoneno|contact|contacts|mobile|call|tels)$/.test(n)) {
    return side === 'back'
      ? { token: 'school_phone', kind: 'school_phone' }
      : { token: 'guardian_phone', kind: 'guardian_phone' };
  }
  for (const r of LABEL_RULES) if (r.re.test(n)) return { token: r.token, kind: r.kind };
  return null;
}

/** "NAME: OCERO MOSES" written as one run → label / value. Only for short, label-like prefixes. */
export function splitLabelValue(text: string): { label: string; value: string } | null {
  const m = collapse(text).match(/^([A-Za-z][A-Za-z.'’/ ]{0,28}?)\s*[:：]\s*(.*)$/);
  return m ? { label: m[1].trim(), value: m[2].trim() } : null;
}

/** Best guess for what an unlabelled value is, from its shape alone. */
export function tokenForValueShape(value: string, side: Side): { token: string; kind: PlaceholderKind; reason: string } | null {
  const v = collapse(value);
  if (!v) return null;
  if (looksLikeRegNo(v)) return { token: 'admission_no', kind: 'admission_no', reason: 'looks like a registration / ID number' };
  if (looksLikeClass(v)) return { token: 'class', kind: 'class', reason: 'looks like a class' };
  if (words(v).length <= 3 && looksLikeDate(v)) return { token: 'issue_date', kind: 'issue_date', reason: 'looks like a date' };
  if (side === 'front' && looksLikePersonName(v)) return { token: 'full_name', kind: 'learner_name', reason: 'looks like a person’s name' };
  return null;
}

// ───────────────────────── school name ─────────────────────────

/** Is this whole phrase a school's name? (≥ 2 words, a school keyword, not a sentence or a label.) */
export function isSchoolNameLike(text: string): boolean {
  const s = collapse(text);
  if (!s || /[:：\d]/.test(s)) return false;
  const ws = words(s);
  if (ws.length < 2 || ws.length > 9) return false;
  if (!hasKeyword(s)) return false;
  if (ws.some((w) => SENTENCE_WORDS.has(stripPunct(w).toLowerCase()))) return false;
  return true;
}

/** "SCHOOL" / "PRIMARY SCHOOL" on its own line: the tail of a school name broken over two lines. */
export function isSchoolNameTail(text: string): boolean {
  const ws = words(text);
  return ws.length >= 1 && ws.length <= 3 && ws.every((w) => SCHOOL_KEYWORDS.has(stripPunct(w).toLowerCase()));
}

const LEAD_IN = /\b(property\s+of|belongs\s+to|issued\s+by|issued\s+at|owned\s+by|courtesy\s+of|welcome\s+to)\s+(.+?)([.!]*)$/i;

function knownNameRegex(known: string): RegExp | null {
  const parts = collapse(known).split(' ').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return parts.length ? new RegExp(parts.join('[\\s\\u00a0]+'), 'i') : null;
}

/**
 * Replace a school name inside `text` with {school}. Returns the template text, or null when the
 * text contains no school name. Handles a bare name ("JINJA PROGRESSIVE SECONDARY SCHOOL"), a
 * name inside a sentence ("… is a property of Jinja progressive secondary school"), and — when
 * `known` is given — the real school's own name anywhere.
 */
export function replaceSchoolName(text: string, known?: string): { template: string; original: string; reason: string; confidence: 'high' | 'medium' } | null {
  const s = collapse(text);
  if (!s) return null;

  if (known && collapse(known).length >= 3) {
    const re = knownNameRegex(known);
    const m = re ? s.match(re) : null;
    if (m) return { template: s.replace(re!, '{school}'), original: m[0], reason: 'matches this school’s own name', confidence: 'high' };
  }

  const lead = s.match(LEAD_IN);
  if (lead && isSchoolNameLike(lead[2])) {
    return {
      template: s.slice(0, lead.index! + lead[0].length - lead[2].length - lead[3].length) + '{school}' + lead[3],
      original: lead[2],
      reason: `the school name after “${lead[1].toLowerCase()}”`,
      confidence: 'high',
    };
  }

  if (isSchoolNameLike(s)) {
    return { template: '{school}', original: s, reason: 'a school name (contains a school word, no sentence words)', confidence: 'high' };
  }
  return null;
}

// ───────────────────────── phrases: address / phone ─────────────────────────

const PO_BOX = /\bP\s*\.?\s*O\s*\.?\s*Box\b/i;

/**
 * Classify one standalone phrase (not part of a "LABEL: value" pair).
 * Returns the template text and any placeholders found, or `static` when it should be kept as is.
 */
export function classifyPhrase(text: string, ctx: ClassifyContext): { template: string; findings: Finding[]; isPlaceholder: boolean } {
  const s = collapse(text);
  const keep = { template: s, findings: [] as Finding[], isPlaceholder: false };
  if (!s) return keep;

  const school = replaceSchoolName(s, ctx.knownSchoolName);
  if (school) {
    return {
      template: school.template, isPlaceholder: true,
      findings: [{ kind: 'school_name', token: 'school', original: school.original, confidence: school.confidence, reason: school.reason }],
    };
  }

  if (PO_BOX.test(s)) {
    return {
      template: '{school_address}', isPlaceholder: true,
      findings: [{ kind: 'school_address', token: 'school_address', original: s, confidence: 'high', reason: 'a postal address (P.O. Box …)' }],
    };
  }

  // "Tel: 0702182687 / 0772338892" — a label followed by numbers, on its own line.
  const lv = splitLabelValue(s);
  if (lv && looksLikePhoneList(lv.value)) {
    const t = tokenForLabel(lv.label, ctx.side);
    if (t) {
      return {
        template: `${lv.label}: {${t.token}}`, isPlaceholder: true,
        findings: [{ kind: t.kind, token: t.token, original: lv.value, confidence: 'high', reason: `phone number(s) after “${lv.label}:”` }],
      };
    }
  }

  return keep;
}

// ───────────────────────── letter case ─────────────────────────

/** ALL-CAPS samples ("OCERO MOSES") mean the template wants the value in capitals. */
export const isAllCaps = (s: string): boolean => {
  const letters = s.replace(/[^A-Za-z]/g, '');
  return letters.length >= 2 && letters === letters.toUpperCase();
};

export const FINDING_LABELS: Record<PlaceholderKind, string> = {
  school_name: 'School name', school_address: 'School address', school_phone: 'School phone', school_email: 'School email',
  learner_name: 'Learner name', class: 'Class', admission_no: 'Reg. / ID number', issue_date: 'Date of issue',
  valid_until: 'Valid until', dob: 'Date of birth', guardian_phone: 'Guardian phone',
};
