/**
 * Publisher template importer (pure).
 *
 * A `.pub` file is a proprietary binary that only Publisher can read. scripts/idcards/publisher-extract.ps1
 * asks an installed Publisher for every shape's real geometry, style and text and writes plain JSON; this
 * module turns that JSON into an ID Card Studio design:
 *   - the card outline(s) become the card size and (for two outlines) the FRONT and BACK sides,
 *   - borders / rule lines / filled boxes become vector shapes (crisp at any print size),
 *   - text becomes editable text elements at the exact measured position and font,
 *   - SAMPLE content (another school's name, a sample learner, class, ID and dates, address, phone) is
 *     recognised as placeholder and replaced by {tokens} — see placeholders.ts,
 *   - the sample photo / logo become the learner-photo and school-logo slots.
 */
import {
  classifyPhrase, tokenForLabel, splitLabelValue, tokenForValueShape, isSchoolNameTail,
  looksLikePersonName, isAllCaps,
  type Finding, type Side,
} from './placeholders';
import { sanitizeSpec, type IdCardElement, type IdCardSide, type IdCardSpec } from './spec';

// ───────────────────────── input (shape of the PowerShell dump) ─────────────────────────

export interface PubSeg { text: string; left?: number; top?: number; width?: number; height?: number; font?: string | null; size?: number; bold?: boolean; italic?: boolean; color?: string | null; }
export interface PubLine { text: string; align?: number; left: number; top: number; width: number; height: number; segments: PubSeg[]; }
export interface PubShape {
  name: string; type: number; z: number; group?: string | null;
  left: number; top: number; width: number; height: number; rotation?: number;
  fill: { visible: boolean; color: string | null; transparency: number };
  line: { visible: boolean; color: string | null; weight: number; dash?: number };
  lines?: PubLine[];
}
export interface PubDump { source?: string; page: { widthPt: number; heightPt: number }; pages: Array<{ index: number; shapes: PubShape[] }>; }

export interface ImportOptions {
  /** The importing school's real name: an exact appearance in the template is always a placeholder. */
  knownSchoolName?: string;
  /** 0-based page to import (default 0). */
  pageIndex?: number;
}

export interface PlaceholderReport extends Finding { side: Side; }

export interface ImportResult {
  spec: IdCardSpec;
  findings: PlaceholderReport[];
  warnings: string[];
}

// ───────────────────────── geometry ─────────────────────────

const MM = 25.4 / 72;
const r1 = (n: number) => Math.round(n * 10) / 10;
const TYPE_PICTURE = 13;
const TYPE_TEXT = 17;

interface Box { l: number; t: number; w: number; h: number; }
const boxOf = (s: { left: number; top: number; width: number; height: number }): Box => ({ l: s.left, t: s.top, w: s.width, h: s.height });
const centre = (b: Box) => ({ x: b.l + b.w / 2, y: b.t + b.h / 2 });
const inside = (b: Box, p: { x: number; y: number }, pad = 1) => p.x >= b.l - pad && p.x <= b.l + b.w + pad && p.y >= b.t - pad && p.y <= b.t + b.h + pad;

function overlapFraction(a: Box, b: Box): number {
  const A = { l: a.l, t: a.t, w: Math.max(a.w, 1), h: Math.max(a.h, 1) };
  const w = Math.min(A.l + A.w, b.l + b.w) - Math.max(A.l, b.l);
  const h = Math.min(A.t + A.h, b.t + b.h) - Math.max(A.t, b.t);
  return w > 0 && h > 0 ? (w * h) / (A.w * A.h) : 0;
}

const isOpaque = (s: PubShape) => s.type !== TYPE_PICTURE && s.fill.visible && s.fill.transparency < 0.5;
const isRule = (s: PubShape) => s.type !== TYPE_PICTURE && s.type !== TYPE_TEXT && s.line.visible && (s.height <= 1.5 || s.width <= 1.5);
const hasText = (s: PubShape) => !!s.lines?.some((l) => l.text.trim());

// ───────────────────────── fonts ─────────────────────────

const SERIF = /^(times|georgia|garamond|book antiqua|cambria|palatino|century schoolbook|baskerville|bookman|constantia|didot|minion)/i;
const MONO = /^(courier|consolas|lucida console|special elite|ocr|andale mono|monaco|lucida sans typewriter)/i;
const SCRIPT = /(chancery|brush script|handwriting|corsiva|script|bradley hand|vivaldi|zapfino|kunstler|freestyle|mistral|segoe print)/i;

/** Publisher font → a CSS stack that still looks right where that font is not installed. */
export function cssFontFamily(name?: string | null): string | undefined {
  const n = (name ?? '').replace(/[^\w\s-]/g, '').trim().slice(0, 30);
  if (!n) return undefined;
  if (SCRIPT.test(n)) return `'${n}', Georgia, serif`;   // decorative scripts are unreadable at 10 pt; fall back to a plain serif
  if (MONO.test(n)) return `'${n}', 'Courier New', monospace`;
  if (SERIF.test(n)) return `'${n}', Times, serif`;
  return `'${n}', Arial, sans-serif`;
}

const hex = (c?: string | null, dflt = '#000000') => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : dflt);

// ───────────────────────── importer ─────────────────────────

interface Phrase {
  text: string;               // sample text as found
  left: number; top: number; width: number; height: number;   // page points
  seg: PubSeg;                // style source
  role: 'static' | 'label' | 'value';
  template: string;
  findings: Finding[];
  placeholder: boolean;
  zOrder: number;
  boxRight: number;           // right edge of the text box it came from (page points)
  boxLeft?: number;
  limitRight?: number;        // page x the text must not cross (start of the next field on the line)
  tail?: boolean;
}

export function importPublisherShapes(dump: PubDump, opts: ImportOptions = {}): ImportResult {
  const warnings: string[] = [];
  const page = dump.pages[opts.pageIndex ?? 0];
  if (!page) throw new Error('The file has no pages to import');

  // 1. Drop shapes hidden completely behind a later opaque shape (Publisher files often keep old copies underneath).
  const all = [...page.shapes].sort((a, b) => a.z - b.z);
  const shapes = all.filter((s, i) => {
    if (!hasText(s) && s.type !== TYPE_PICTURE && !s.line.visible && !s.fill.visible) return false; // invisible helper
    return !all.slice(i + 1).some((o) => isOpaque(o) && overlapFraction(boxOf(s), boxOf(o)) >= 0.9);
  });

  // 2. Card outlines: the largest equal-sized box(es) with a visible fill or border.
  const candidates = shapes
    .filter((s) => (s.type === TYPE_TEXT || (!isRule(s) && s.type !== TYPE_PICTURE)) && (s.fill.visible || s.line.visible))
    .filter((s) => s.width * MM >= 40 && s.width * MM <= 120 && s.height * MM >= 30 && s.height * MM <= 90)
    .sort((a, b) => b.width * b.height - a.width * a.height);
  if (!candidates.length) throw new Error('No card outline was found — expected a rectangle about the size of an ID card');
  const first = candidates[0];
  const frames = candidates
    .filter((s) => Math.abs(s.width - first.width) < 3 && Math.abs(s.height - first.height) < 3)
    .filter((s, i, arr) => arr.findIndex((o) => overlapFraction(boxOf(o), boxOf(s)) > 0.5) === i)
    .slice(0, 2);

  const pictures = shapes.filter((s) => s.type === TYPE_PICTURE);
  const looksFront = (f: PubShape) =>
    pictures.some((p) => inside(boxOf(f), centre(boxOf(p)))) ||
    shapes.some((s) => hasText(s) && inside(boxOf(f), centre(boxOf(s))) && s.lines!.some((l) => l.segments.some((g) => tokenForLabel(g.text, 'front')?.token === 'full_name')));
  let ordered = [...frames].sort((a, b) => a.left - b.left || a.top - b.top);
  if (ordered.length === 2 && !looksFront(ordered[0]) && looksFront(ordered[1])) ordered = [ordered[1], ordered[0]];
  if (frames.length > 2) warnings.push('More than two card outlines were found; only the first two are used.');

  const size = { widthMm: r1(first.width * MM), heightMm: r1(first.height * MM) };
  const spec: IdCardSpec = { version: 2, size, front: { backgroundColor: '#ffffff', elements: [] } };
  const findings: PlaceholderReport[] = [];

  ordered.forEach((frame, idx) => {
    const side: Side = idx === 0 ? 'front' : 'back';
    const built = buildSide(frame, shapes, side, size, opts, warnings, findings);
    if (idx === 0) spec.front = built; else spec.back = built;
  });

  return { spec: sanitizeSpec(spec), findings, warnings };
}

function buildSide(
  frame: PubShape, shapes: PubShape[], side: Side, size: { widthMm: number; heightMm: number },
  opts: ImportOptions, warnings: string[], findings: PlaceholderReport[],
): IdCardSide {
  const fb = boxOf(frame);
  const bg = frame.fill.visible ? hex(frame.fill.color, '#ffffff') : '#ffffff';
  const out: IdCardSide = { backgroundColor: bg, elements: [] };
  const mm = (pt: number) => r1(pt * MM);
  const cardW = size.widthMm;
  let n = 0;
  const id = () => `${side[0]}${++n}`;
  const push = (e: Omit<IdCardElement, 'id'>) => out.elements.push({ id: id(), ...e } as IdCardElement);

  if (frame.line.visible && frame.line.weight > 0) {
    // Publisher centres a border on the edge, so only half of it lies inside the card.
    push({ kind: 'rect', x: 0, y: 0, w: cardW, h: size.heightMm, stroke: hex(frame.line.color), strokeMm: r1((frame.line.weight * MM) / 2) });
  }

  const addText = (s: PubShape) => textElements(s, side, opts).forEach((p) => {
    p.findings.forEach((f) => findings.push({ ...f, side }));
    emit(p);
  });
  // The outline is often itself a text box (the back of the card here holds the address text).
  if (hasText(frame)) addText(frame);

  const mine = shapes.filter((s) => s !== frame && inside(fb, centre(boxOf(s))));

  // Pictures: the biggest portrait picture is the learner's photo; a smaller picture is the school logo.
  const pics = mine.filter((s) => s.type === TYPE_PICTURE).sort((a, b) => b.width * b.height - a.width * a.height);
  let photoTaken = false; let logoTaken = false;
  const picRole = new Map<PubShape, 'photo' | 'logo'>();
  for (const p of pics) {
    if (!photoTaken && p.height >= p.width * 1.05) { picRole.set(p, 'photo'); photoTaken = true; }
    else if (!logoTaken) { picRole.set(p, 'logo'); logoTaken = true; }
    else warnings.push(`${side}: extra picture “${p.name}” was not imported (only one photo and one logo slot are used).`);
  }

  for (const s of mine) {
    const x = mm(s.left - frame.left); const y = mm(s.top - frame.top);
    if (s.type === TYPE_PICTURE) {
      const role = picRole.get(s);
      if (role === 'photo') push({ kind: 'image', source: 'photo', x, y, w: mm(s.width), h: mm(s.height), fit: 'cover', shape: 'rect' });
      else if (role === 'logo') push({ kind: 'image', source: 'logo', x, y, w: mm(s.width), h: mm(s.height), fit: 'contain', shape: 'rect' });
      continue;
    }
    if (isRule(s)) {
      const t = Math.max(0.15, s.line.weight * MM);
      const horizontal = s.width >= s.height;
      push(horizontal
        ? { kind: 'rect', x, y: r1(y - t / 2), w: mm(s.width), h: r1(t), fill: hex(s.line.color) }
        : { kind: 'rect', x: r1(x - t / 2), y, w: r1(t), h: mm(s.height), fill: hex(s.line.color) });
      continue;
    }
    if (s.type !== TYPE_TEXT && (s.fill.visible || s.line.visible)) {
      push({ kind: 'rect', x, y, w: mm(s.width), h: mm(s.height), fill: s.fill.visible ? hex(s.fill.color) : undefined, stroke: s.line.visible ? hex(s.line.color) : undefined, strokeMm: s.line.visible ? r1(s.line.weight * MM) : 0 });
      continue;
    }
    if (s.type === TYPE_TEXT && s.fill.visible && s.fill.transparency < 0.5 && hex(s.fill.color) !== bg) {
      push({ kind: 'rect', x, y, w: mm(s.width), h: mm(s.height), fill: hex(s.fill.color) });
    }
    if (hasText(s)) addText(s);
  }

  // Nothing said which text is the school's name? The biggest bold line near the top is a strong guess.
  if (side === 'front' && !findings.some((f) => f.side === 'front' && f.kind === 'school_name')) {
    const guess = out.elements
      .filter((e): e is Extract<IdCardElement, { kind: 'text' }> => e.kind === 'text' && !/\{/.test(e.text) && e.y < size.heightMm * 0.45 && e.text.trim().split(/\s+/).length >= 2 && !/card|identity/i.test(e.text))
      .sort((a, b) => b.fontSizePt - a.fontSizePt)[0];
    if (guess && guess.bold) {
      findings.push({ side, kind: 'school_name', token: 'school', original: guess.text, confidence: 'medium', reason: 'the largest bold line at the top of the card' });
      guess.uppercase = isAllCaps(guess.text) || undefined;
      guess.text = '{school}'; guess.align = 'center';
    }
  }

  function emit(p: Phrase) {
    const size0 = p.seg.size && p.seg.size > 0 ? p.seg.size : 8;
    const x0 = p.left - frame.left;
    const base = {
      kind: 'text' as const,
      fontSizePt: size0, bold: !!p.seg.bold, italic: !!p.seg.italic, color: hex(p.seg.color),
      fontFamily: cssFontFamily(p.seg.font),
    };
    const h = Math.max(p.height, size0 * 1.25);
    const schoolTitle = p.placeholder && p.template === '{school}';
    if (schoolTitle) {
      // A school name can be any length and any number of lines: a centred box, symmetrical around the sample's centre.
      const cx = mm(x0 + p.width / 2);
      const half = Math.max(8, Math.min(cx - 3, cardW - 3 - cx));
      push({ ...base, x: r1(cx - half), y: mm(p.top - frame.top), w: r1(half * 2), h: mm(Math.max(h, size0 * 2.5)), text: '{school}', align: 'center', valign: 'middle', uppercase: isAllCaps(p.text) || undefined });
      return;
    }
    const x = mm(x0);
    const wholeToken = /^\{[^{}]+\}$/.test(p.template);
    const capsKind = p.findings.some((f) => ['learner_name', 'class', 'admission_no', 'school_name'].includes(f.kind));
    const uppercase = p.placeholder && wholeToken && capsKind && isAllCaps(p.text) ? true : undefined;

    // A line the designer centred across a card-wide text box stays centred whatever its real length
    // (and whichever font is available). A left-aligned row that merely sits near the middle is not touched.
    const boxLeft = p.boxLeft ?? p.left;
    const boxW = p.boxRight - boxLeft;
    const wrapped = p.height > size0 * 1.9;   // wraps onto a second line inside a card-wide box: designers centre these
    const centred = boxW >= frame.width * 0.85 &&
      (wrapped || (p.width <= boxW * 0.92 && Math.abs(p.left + p.width / 2 - (boxLeft + boxW / 2)) <= boxW * 0.03));
    if (centred) {
      const cx = mm(boxLeft + boxW / 2 - frame.left);
      const half = Math.max(8, Math.min(cx - 1, cardW - 1 - cx));
      push({ ...base, x: r1(cx - half), y: mm(p.top - frame.top), w: r1(half * 2), h: mm(h), text: p.placeholder ? p.template : p.text, align: 'center', shrink: p.placeholder && wholeToken ? true : undefined, uppercase });
      return;
    }
    if (p.placeholder) {
      const room = p.limitRight !== undefined ? mm(p.limitRight - frame.left) - x : cardW - x - 3;
      push({ ...base, x, y: mm(p.top - frame.top), w: Math.max(6, r1(Math.min(room, cardW - x - 3))), h: mm(h), text: p.template, align: 'left', shrink: wholeToken || undefined, uppercase });
      return;
    }
    const w = Math.min(r1(p.width * MM * 1.1 + 1), r1(cardW - x - 1));
    push({ ...base, x, y: mm(p.top - frame.top), w: Math.max(4, w), h: mm(h), text: p.text, align: 'left' });
  }

  return out;
}

/** One Publisher text box → phrases (labels, values, sentences) with placeholders resolved. */
function textElements(s: PubShape, side: Side, opts: ImportOptions): Phrase[] {
  const phrases: Phrase[] = [];
  const ctx = { side, knownSchoolName: opts.knownSchoolName };
  const boxRight = s.left + s.width;

  for (const line of s.lines ?? []) {
    const segs = line.segments.filter((g) => g.text?.trim());
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i];
      const dims = (o: PubSeg) => ({ left: o.left ?? line.left, top: o.top ?? line.top, width: o.width ?? line.width, height: o.height ?? line.height });
      const text = g.text.trim();

      // "NAME:" followed by its value segment
      if (/[:：]\s*$/.test(text)) {
        phrases.push({ text, ...dims(g), seg: g, role: 'label', template: text, findings: [], placeholder: false, zOrder: s.z, boxRight });
        const rule = tokenForLabel(text, side);
        const val = segs[i + 1];
        if (rule && val && !/[:：]\s*$/.test(val.text.trim())) {
          const d = dims(val);
          phrases.push({
            text: val.text.trim(), ...d, seg: val, role: 'value', template: `{${rule.token}}`, placeholder: true, zOrder: s.z, boxRight,
            findings: [{ kind: rule.kind, token: rule.token, original: val.text.trim(), confidence: 'high', reason: `the value after “${text}”` }],
          });
          i++;
        } else if (rule && !val) {
          // a label with a blank after it (a form line): the placeholder goes right after the label
          const d = dims(g);
          phrases.push({ text: '', left: d.left + d.width + 3, top: d.top, width: 0, height: d.height, seg: g, role: 'value', template: `{${rule.token}}`, placeholder: true, zOrder: s.z, boxRight, findings: [] });
        }
        continue;
      }

      // "Tel: 0702…" / "NAME: OCERO MOSES" inside one segment
      const lv = splitLabelValue(text);
      if (lv && lv.value) {
        const rule = tokenForLabel(lv.label, side);
        if (rule) {
          const d = dims(g);
          phrases.push({
            text, ...d, seg: g, role: 'value', template: `${lv.label}: {${rule.token}}`, placeholder: true, zOrder: s.z, boxRight,
            findings: [{ kind: rule.kind, token: rule.token, original: lv.value, confidence: 'high', reason: `the value after “${lv.label}:”` }],
          });
          continue;
        }
      }

      // standalone phrase: join neighbouring segments that are really one run of words
      const start = i;
      let end = i; let joined = text;
      let right = (g.left ?? line.left) + (g.width ?? line.width);
      while (end + 1 < segs.length) {
        const nx = segs[end + 1];
        if (/[:：]\s*$/.test(nx.text.trim())) break;
        const gap = (nx.left ?? right) - right;
        if (gap > (g.size ?? 8) * 1.6) break;
        joined += ` ${nx.text.trim()}`;
        right = (nx.left ?? right) + (nx.width ?? 0);
        end++;
      }
      i = end;
      const d = dims(g);
      // a phrase that fills the whole line takes the line's own height (a sentence that wraps is taller than one segment)
      if (i - start === segs.length - 1 && start === 0) d.height = Math.max(d.height, line.height);
      const cls = classifyPhrase(joined, ctx);
      let template = cls.isPlaceholder ? cls.template : joined;
      let found = cls.findings;
      let placeholder = cls.isPlaceholder;

      if (!placeholder) {
        // no label, no keyword: fall back to the value's shape (a bare ID number, class or date)
        const shape = tokenForValueShape(joined, side);
        if (shape && shape.kind !== 'learner_name') {
          template = `{${shape.token}}`; placeholder = true;
          found = [{ kind: shape.kind, token: shape.token, original: joined, confidence: 'medium', reason: shape.reason }];
        }
      }
      phrases.push({
        text: joined, ...d, width: right - d.left, seg: g, role: placeholder ? 'value' : 'static', template, findings: found, placeholder, zOrder: s.z, boxRight,
        tail: !placeholder && isSchoolNameTail(joined),
      });
    }
  }

  // "…SECONDARY" / "SCHOOL" on the next line is one school name.
  for (let k = 0; k < phrases.length - 1; k++) {
    const a = phrases[k]; const b = phrases[k + 1];
    if (a.placeholder && a.template === '{school}' && b.tail && b.top - (a.top + a.height) < (a.seg.size ?? 10) * 1.2) {
      a.text = `${a.text} ${b.text}`;
      a.findings.forEach((f) => { if (f.kind === 'school_name') f.original = a.text; });
      a.height = b.top + b.height - a.top;
      a.left = Math.min(a.left, b.left);
      a.width = Math.max(a.left + a.width, b.left + b.width) - a.left;
      phrases.splice(k + 1, 1);
      k--;
    }
  }

  // A learner's sample name written with no label at all (front only): one clear person-name candidate.
  if (side === 'front') {
    const cand = phrases.filter((p) => p.role === 'static' && looksLikePersonName(p.text));
    if (cand.length === 1 && !s.lines?.some((l) => l.segments.some((g) => /[:：]\s*$/.test(g.text.trim())))) {
      const p = cand[0];
      p.template = '{full_name}'; p.placeholder = true; p.role = 'value';
      p.findings = [{ kind: 'learner_name', token: 'full_name', original: p.text, confidence: 'medium', reason: 'looks like a person’s name' }];
    }
  }
  phrases.forEach((p) => {
    p.boxLeft = s.left;
    // a value may not run into the next field on the same line ("CLASS: {class}   ID NO: …")
    const next = phrases.filter((o) => o !== p && o.left > p.left + 1 && Math.abs(o.top - p.top) < (p.seg.size ?? 8) * 0.6).sort((a, b) => a.left - b.left)[0];
    if (next) p.limitRight = next.left - 2;
  });
  return phrases;
}
