/**
 * ID Card Studio — design spec (v2).
 *
 * A design is a card size in millimetres plus one or two SIDES. Each side is a
 * static backdrop (colour and/or an imported artwork image) with dynamic
 * elements positioned on top in millimetres. Static art and dynamic fields are
 * kept separate on purpose: importing a designer's PNG/JPEG never flattens the
 * name/photo/QR positions, so the same artwork serves every learner.
 *
 * No server imports: safe on client and server.
 */

export const ID1_WIDTH_MM = 85.6;
export const ID1_HEIGHT_MM = 54;

export type IdCardElement =
  | (ElementBase & {
      kind: 'text';
      text: string;             // may contain {tokens}
      fontSizePt: number;
      bold?: boolean;
      italic?: boolean;
      color: string;
      align?: 'left' | 'center' | 'right';
      uppercase?: boolean;
      fontFamily?: string;
    })
  | (ElementBase & {
      kind: 'image';
      source: 'photo' | 'logo' | 'static';
      src?: string;             // static image URL when source === 'static'
      fit?: 'cover' | 'contain';
      shape?: 'rect' | 'circle';
    })
  | (ElementBase & {
      kind: 'qr';
      value: string;            // may contain {tokens}
    })
  | (ElementBase & {
      kind: 'rect';
      fill?: string;
      stroke?: string;
      strokeMm?: number;
      radiusMm?: number;
    });

interface ElementBase {
  id: string;
  x: number; y: number; w: number; h: number; // mm from the card's top-left
}

export interface IdCardSide {
  backgroundColor?: string;
  backgroundImage?: { url: string; fit: 'cover' | 'stretch' };
  elements: IdCardElement[];
}

export interface IdCardSpec {
  version: 2;
  size: { widthMm: number; heightMm: number };
  front: IdCardSide;
  back?: IdCardSide;
}

export type SourceKind = 'designed' | 'imported' | 'legacy';

/** Tokens available to every design. Excel jobs add `col:<Header>` tokens. */
export const STANDARD_TOKENS: Array<{ token: string; label: string }> = [
  { token: 'full_name', label: 'Full name' },
  { token: 'first_name', label: 'First name' },
  { token: 'last_name', label: 'Last name' },
  { token: 'admission_no', label: 'Admission / reg. no' },
  { token: 'class', label: 'Class' },
  { token: 'gender', label: 'Gender' },
  { token: 'dob', label: 'Date of birth' },
  { token: 'school', label: 'School name' },
  { token: 'academic_year', label: 'Academic year' },
  { token: 'valid_until', label: 'Valid until' },
  { token: 'guardian_phone', label: 'Guardian phone' },
];

export type CardRecord = Record<string, string>;

const TOKEN_RE = /\{([^{}]{1,80})\}/g;

/** Replace {token} with record values; unknown tokens render empty (never leak braces). */
export function resolveTokens(template: string, record: CardRecord): string {
  return template.replace(TOKEN_RE, (_m, key: string) => record[key.trim()] ?? '');
}

export function tokensIn(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(TOKEN_RE)) out.add(m[1].trim());
  return [...out];
}

export function specTokens(spec: IdCardSpec): string[] {
  const out = new Set<string>();
  for (const side of [spec.front, spec.back]) {
    if (!side) continue;
    for (const el of side.elements) {
      if (el.kind === 'text') tokensIn(el.text).forEach((t) => out.add(t));
      if (el.kind === 'qr') tokensIn(el.value).forEach((t) => out.add(t));
    }
  }
  return [...out];
}

export function isTwoSided(spec: IdCardSpec): boolean {
  return !!spec.back;
}

// ── Sanitising / validation (server-side on save; never trust client JSON) ──

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|[a-zA-Z]{3,20})$/;
const MAX_ELEMENTS_PER_SIDE = 60;
const MAX_TEXT = 300;

const clampNum = (n: unknown, min: number, max: number, dflt: number): number => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
};
const safeColor = (c: unknown, dflt: string | undefined): string | undefined =>
  typeof c === 'string' && COLOR_RE.test(c.trim()) ? c.trim() : dflt;
const safeUrl = (u: unknown): string | undefined => {
  if (typeof u !== 'string') return undefined;
  const s = u.trim();
  return /^https:\/\/[^\s"'<>]{1,1000}$/.test(s) ? s : undefined;
};
const safeStr = (s: unknown, max = MAX_TEXT): string => (typeof s === 'string' ? s.slice(0, max) : '');

function sanitizeElement(raw: any, idx: number): IdCardElement | null {
  if (!raw || typeof raw !== 'object') return null;
  const base = {
    id: safeStr(raw.id, 40) || `el${idx}`,
    x: clampNum(raw.x, -50, 400, 0),
    y: clampNum(raw.y, -50, 400, 0),
    w: clampNum(raw.w, 0.5, 400, 10),
    h: clampNum(raw.h, 0.5, 400, 10),
  };
  switch (raw.kind) {
    case 'text':
      return {
        ...base, kind: 'text',
        text: safeStr(raw.text),
        fontSizePt: clampNum(raw.fontSizePt, 3, 60, 9),
        bold: !!raw.bold, italic: !!raw.italic,
        color: safeColor(raw.color, '#000000')!,
        align: ['left', 'center', 'right'].includes(raw.align) ? raw.align : 'left',
        uppercase: !!raw.uppercase,
        fontFamily: /^[\w\s,'"-]{1,80}$/.test(raw.fontFamily ?? '') ? raw.fontFamily : undefined,
      };
    case 'image': {
      const source = ['photo', 'logo', 'static'].includes(raw.source) ? raw.source : 'photo';
      return {
        ...base, kind: 'image', source,
        src: source === 'static' ? safeUrl(raw.src) : undefined,
        fit: raw.fit === 'contain' ? 'contain' : 'cover',
        shape: raw.shape === 'circle' ? 'circle' : 'rect',
      };
    }
    case 'qr':
      return { ...base, kind: 'qr', value: safeStr(raw.value) };
    case 'rect':
      return {
        ...base, kind: 'rect',
        fill: safeColor(raw.fill, undefined), stroke: safeColor(raw.stroke, undefined),
        strokeMm: clampNum(raw.strokeMm, 0, 5, 0), radiusMm: clampNum(raw.radiusMm, 0, 50, 0),
      };
    default:
      return null;
  }
}

function sanitizeSide(raw: any): IdCardSide {
  const elements = Array.isArray(raw?.elements)
    ? raw.elements.slice(0, MAX_ELEMENTS_PER_SIDE).map(sanitizeElement).filter(Boolean) as IdCardElement[]
    : [];
  const bgUrl = safeUrl(raw?.backgroundImage?.url);
  return {
    backgroundColor: safeColor(raw?.backgroundColor, '#ffffff'),
    backgroundImage: bgUrl
      ? { url: bgUrl, fit: raw.backgroundImage.fit === 'stretch' ? 'stretch' : 'cover' }
      : undefined,
    elements,
  };
}

/** Coerce arbitrary JSON into a safe IdCardSpec. Throws only on a non-object. */
export function sanitizeSpec(raw: unknown): IdCardSpec {
  if (!raw || typeof raw !== 'object') throw new Error('Design must be an object');
  const r = raw as any;
  const spec: IdCardSpec = {
    version: 2,
    size: {
      widthMm: clampNum(r.size?.widthMm, 30, 210, ID1_WIDTH_MM),
      heightMm: clampNum(r.size?.heightMm, 30, 297, ID1_HEIGHT_MM),
    },
    front: sanitizeSide(r.front),
  };
  if (r.back) spec.back = sanitizeSide(r.back);
  return spec;
}

let uid = 0;
export const newElementId = (prefix = 'el'): string => `${prefix}${Date.now().toString(36)}${(uid++).toString(36)}`;

export function blankSpec(twoSided = false): IdCardSpec {
  const side = (): IdCardSide => ({ backgroundColor: '#ffffff', elements: [] });
  return {
    version: 2,
    size: { widthMm: ID1_WIDTH_MM, heightMm: ID1_HEIGHT_MM },
    front: side(),
    ...(twoSided ? { back: side() } : {}),
  };
}

/** Starter layout so a new design is never an empty canvas. */
export function starterSpec(twoSided: boolean): IdCardSpec {
  const spec = blankSpec(twoSided);
  spec.front.elements = [
    { id: 'f_photo', kind: 'image', source: 'photo', x: 4, y: 14, w: 22, h: 26, fit: 'cover', shape: 'rect' },
    { id: 'f_logo', kind: 'image', source: 'logo', x: 4, y: 3, w: 9, h: 9, fit: 'contain', shape: 'rect' },
    { id: 'f_school', kind: 'text', x: 15, y: 4, w: 66, h: 7, text: '{school}', fontSizePt: 10, bold: true, color: '#0e2447', align: 'left', uppercase: true },
    { id: 'f_name', kind: 'text', x: 29, y: 16, w: 52, h: 8, text: '{full_name}', fontSizePt: 11, bold: true, color: '#111111', align: 'left' },
    { id: 'f_adm', kind: 'text', x: 29, y: 25, w: 52, h: 5, text: 'Reg No: {admission_no}', fontSizePt: 8, color: '#333333', align: 'left' },
    { id: 'f_class', kind: 'text', x: 29, y: 31, w: 52, h: 5, text: 'Class: {class}', fontSizePt: 8, color: '#333333', align: 'left' },
  ];
  if (spec.back) {
    spec.back.elements = [
      { id: 'b_qr', kind: 'qr', x: 4, y: 6, w: 24, h: 24, value: '{admission_no}' },
      { id: 'b_title', kind: 'text', x: 32, y: 6, w: 50, h: 6, text: 'If found, please return to', fontSizePt: 7, color: '#333333', align: 'left' },
      { id: 'b_school', kind: 'text', x: 32, y: 12, w: 50, h: 7, text: '{school}', fontSizePt: 9, bold: true, color: '#0e2447', align: 'left' },
      { id: 'b_valid', kind: 'text', x: 4, y: 44, w: 77, h: 5, text: 'Valid until: {valid_until}', fontSizePt: 7, color: '#333333', align: 'left' },
    ];
  }
  return spec;
}

/**
 * Legacy single-sided IDCardConfig → v2 front side. The legacy designer and its
 * saved templates are untouched; this only lets a school START a two-sided
 * design from the look it already has.
 */
export function specFromLegacyConfig(cfg: {
  bgColor?: string; accentColor?: string; textColor?: string; footerText?: string; schoolLogoUrl?: string;
}): IdCardSpec {
  const text = cfg.textColor || '#ffffff';
  const spec = blankSpec(false);
  spec.front.backgroundColor = cfg.bgColor || '#1a3a6b';
  spec.front.elements = [
    { id: 'l_bar', kind: 'rect', x: 0, y: 0, w: ID1_WIDTH_MM, h: 4, fill: cfg.accentColor || '#d4a017' },
    { id: 'l_photo', kind: 'image', source: 'photo', x: 4, y: 9, w: 18, h: 20, fit: 'cover', shape: 'rect' },
    { id: 'l_school', kind: 'text', x: 26, y: 6, w: 56, h: 6, text: '{school}', fontSizePt: 9, bold: true, color: text, align: 'left', uppercase: true },
    { id: 'l_name', kind: 'text', x: 26, y: 14, w: 56, h: 7, text: '{full_name}', fontSizePt: 11, bold: true, color: text, align: 'left' },
    { id: 'l_adm', kind: 'text', x: 26, y: 22, w: 56, h: 5, text: 'Reg No: {admission_no}', fontSizePt: 8, color: text, align: 'left' },
    { id: 'l_class', kind: 'text', x: 26, y: 28, w: 56, h: 5, text: 'Class: {class}', fontSizePt: 8, color: text, align: 'left' },
  ];
  if (cfg.schoolLogoUrl) {
    spec.front.elements.push({ id: 'l_logo', kind: 'image', source: 'static', src: cfg.schoolLogoUrl, x: 72, y: 5, w: 10, h: 10, fit: 'contain', shape: 'rect' });
  }
  return spec;
}
