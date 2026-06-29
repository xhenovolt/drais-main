/**
 * Rule-based Latin→Arabic transliteration for learner/staff names.
 *
 * This produces a DRAFT only. Arabic omits short vowels and many Latin
 * spellings are ambiguous, so every result carries a confidence and a
 * needsReview flag. Nothing here is ever written to the database without an
 * explicit human "apply" — it exists to give ALBAYAN a sensible starting point
 * (the approved "Both" strategy: AI draft + staff confirm).
 */

export type Confidence = 'high' | 'medium' | 'low';

export interface TranslitResult {
  arabic: string;
  confidence: Confidence;
  needsReview: boolean;
  /** Per-token detail so the UI can highlight which parts were guessed. */
  tokens: { source: string; arabic: string; matched: boolean }[];
}

/**
 * High-confidence dictionary of common Arabic/Islamic names (and a few common
 * Latin spelling variants). Keys are lower-cased. This covers the bulk of an
 * Islamic school's roster; anything outside it falls back to letter rules and
 * is flagged for review.
 */
const NAME_MAP: Record<string, string> = {
  // Muhammad + variants
  muhammad: 'محمد', mohammed: 'محمد', mohamed: 'محمد', mohammad: 'محمد', muhammed: 'محمد', mohd: 'محمد',
  ahmad: 'أحمد', ahmed: 'أحمد', ahmet: 'أحمد',
  mahmoud: 'محمود', mahmud: 'محمود',
  mustafa: 'مصطفى', mostafa: 'مصطفى',
  // Abd al- compounds (the leading "abdul/abd" + attribute)
  abdul: 'عبد ال', abd: 'عبد', abdal: 'عبد ال',
  abdullah: 'عبد الله', abdallah: 'عبد الله',
  abdulrahman: 'عبد الرحمن', abdurrahman: 'عبد الرحمن', rahman: 'الرحمن',
  abdulaziz: 'عبد العزيز', aziz: 'عزيز',
  abdulkarim: 'عبد الكريم', karim: 'كريم', kareem: 'كريم',
  abdulrahim: 'عبد الرحيم', rahim: 'رحيم', raheem: 'رحيم',
  abdulmalik: 'عبد المالك', malik: 'مالك',
  abdulsalam: 'عبد السلام', salam: 'سلام',
  // Common male names
  ali: 'علي', omar: 'عمر', umar: 'عمر', uthman: 'عثمان', othman: 'عثمان', usman: 'عثمان',
  hassan: 'حسن', hasan: 'حسن', hussein: 'حسين', hussain: 'حسين', husain: 'حسين',
  yusuf: 'يوسف', yousef: 'يوسف', yousuf: 'يوسف', yusufu: 'يوسف',
  ibrahim: 'إبراهيم', ibraheem: 'إبراهيم',
  ismail: 'إسماعيل', ismael: 'إسماعيل',
  idris: 'إدريس', idriss: 'إدريس',
  bilal: 'بلال', hamza: 'حمزة', khalid: 'خالد', khaled: 'خالد',
  tariq: 'طارق', tarek: 'طارق', saad: 'سعد', said: 'سعيد', saeed: 'سعيد',
  salim: 'سالم', saleh: 'صالح', sulaiman: 'سليمان', suleiman: 'سليمان', sulaimani: 'سليمان',
  zakaria: 'زكريا', zakariya: 'زكريا', yahya: 'يحيى', yaqub: 'يعقوب', yakub: 'يعقوب',
  musa: 'موسى', isa: 'عيسى', dawud: 'داود', dawood: 'داود', adam: 'آدم', nuh: 'نوح',
  anas: 'أنس', faisal: 'فيصل', nasser: 'ناصر', nasir: 'ناصر', jamal: 'جمال', kamal: 'كمال',
  imran: 'عمران', ridwan: 'رضوان', rizwan: 'رضوان',
  // Common female names
  fatima: 'فاطمة', fatimah: 'فاطمة', fatuma: 'فاطمة',
  aisha: 'عائشة', aishah: 'عائشة', aysha: 'عائشة',
  khadija: 'خديجة', khadijah: 'خديجة',
  maryam: 'مريم', mariam: 'مريم', maria: 'مريم',
  zainab: 'زينب', zaynab: 'زينب',
  hafsa: 'حفصة', halima: 'حليمة', halimah: 'حليمة',
  amina: 'آمنة', aminah: 'آمنة', aminah2: 'أمينة',
  safiya: 'صفية', safia: 'صفية', sumaya: 'سمية', sumayya: 'سمية',
  asma: 'أسماء', ruqayya: 'رقية', ruqayyah: 'رقية', umm: 'أم',
  nafisa: 'نفيسة', rahma: 'رحمة', sara: 'سارة', sarah: 'سارة', hawa: 'حواء',
  zahra: 'زهراء', zahara: 'زهراء', najma: 'نجمة', salma: 'سلمى', samira: 'سميرة',
  // Frequent attributes / particles
  al: 'ال', bin: 'بن', ibn: 'ابن', bint: 'بنت', noor: 'نور', nur: 'نور', din: 'الدين', deen: 'الدين',
};

// Digraphs must be tried before single letters.
const DIGRAPHS: [string, string][] = [
  ['sh', 'ش'], ['ch', 'تش'], ['th', 'ث'], ['dh', 'ذ'], ['kh', 'خ'], ['gh', 'غ'],
  ['ph', 'ف'], ['aa', 'ا'], ['ee', 'ي'], ['ii', 'ي'], ['oo', 'و'], ['ou', 'و'],
  ['ai', 'اي'], ['ay', 'اي'], ['ei', 'ي'],
];

const LETTERS: Record<string, string> = {
  a: 'ا', b: 'ب', c: 'ك', d: 'د', e: '', f: 'ف', g: 'ج', h: 'ه', i: 'ي',
  j: 'ج', k: 'ك', l: 'ل', m: 'م', n: 'ن', o: 'و', p: 'ب', q: 'ق', r: 'ر',
  s: 'س', t: 'ت', u: 'و', v: 'ف', w: 'و', x: 'كس', y: 'ي', z: 'ز',
};

/** Letter-by-letter fallback for tokens not in the dictionary. Approximate —
 *  always low confidence / needs review. */
function letterFallback(token: string): string {
  let s = token.toLowerCase();
  let out = '';
  let i = 0;
  while (i < s.length) {
    const pair = s.slice(i, i + 2);
    const dg = DIGRAPHS.find(([k]) => k === pair);
    if (dg) { out += dg[1]; i += 2; continue; }
    const ch = s[i];
    out += LETTERS[ch] ?? '';
    i += 1;
  }
  return out;
}

const clean = (s: string) => s.normalize('NFKD').replace(/[^A-Za-z'\- ]/g, '').trim();

/** Transliterate a single name token. */
function translitToken(raw: string): { arabic: string; matched: boolean } {
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  if (!key) return { arabic: '', matched: false };
  if (NAME_MAP[key]) return { arabic: NAME_MAP[key], matched: true };
  return { arabic: letterFallback(key), matched: false };
}

/**
 * Transliterate a full (possibly multi-token) name into Arabic with a
 * confidence rating. All-dictionary → high; mixed → medium (review);
 * none/fallback → low (review).
 */
export function transliterateName(input: string | null | undefined): TranslitResult {
  const src = clean(String(input ?? ''));
  if (!src) return { arabic: '', confidence: 'low', needsReview: true, tokens: [] };

  const parts = src.split(/\s+/).filter(Boolean);
  const tokens: { source: string; arabic: string; matched: boolean }[] = [];
  let compound = false;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const key = p.toLowerCase().replace(/[^a-z]/g, '');
    // "Abd(ul) <attribute>" → "عبد ال<attribute>" (e.g. Abdul Rahman → عبد الرحمن).
    // Compounds are error-prone, so they cap confidence at medium (review).
    if ((key === 'abdul' || key === 'abd' || key === 'abdal') && i + 1 < parts.length) {
      const next = parts[++i];
      const attr = translitToken(next).arabic.replace(/^ال/, '');
      tokens.push({ source: `${p} ${next}`, arabic: `عبد ال${attr}`.trim(), matched: false });
      compound = true;
      continue;
    }
    const { arabic, matched } = translitToken(p);
    tokens.push({ source: p, arabic, matched });
  }

  const arabic = tokens.map(t => t.arabic).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const matchedCount = tokens.filter(t => t.matched).length;

  let confidence: Confidence;
  if (compound) confidence = matchedCount === tokens.length - 1 ? 'medium' : 'low';
  else if (matchedCount === tokens.length) confidence = 'high';
  else if (matchedCount > 0) confidence = 'medium';
  else confidence = 'low';

  return {
    arabic,
    confidence,
    needsReview: confidence !== 'high',
    tokens,
  };
}
