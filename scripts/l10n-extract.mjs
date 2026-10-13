// Lists every hardcoded, user-visible string in the given files with its exact location.
// This is the "full string-by-string inventory" step of the localization procedure
// (docs/localization/ARABIC_TRANSLATION_ROADMAP.md). Read-only.
//
//   node scripts/l10n-extract.mjs <file.tsx> [more files]            -> human-readable list
//   node scripts/l10n-extract.mjs --json out.json <file.tsx> [...]   -> machine-readable
//
// It is a heuristic: it finds text between tags, text-bearing attributes, toast/alert/confirm
// messages and label-like properties in objects. It can miss strings built in unusual ways and
// can report non-interface strings; the list is reviewed by a person before anything is changed.
import fs from 'node:fs';

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : null;

const ATTRS = 'placeholder|title|label|aria-label|alt|description|subtitle|helperText|emptyText|emptyMessage|confirmText|cancelText|tooltip|heading|caption|summary|buttonText|actionLabel|hint|message';
const PROPS = 'title|text|label|header|Header|message|description|placeholder|confirmButtonText|cancelButtonText|denyButtonText|subtitle|tooltip|error|html|footer|name|hint|emptyText';
const hasArabic = (s) => /[\u0600-\u06FF]/.test(s);
function visible(s) {
  const t = s.trim();
  if (t.length < 2 || !/[A-Za-z]{2}/.test(t)) return false;
  if (hasArabic(t) && !/[A-Za-z]{4}/.test(t)) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(t) && !/^[a-z]+$/.test(t)) return false; // camelCase identifier
  if (/^[a-z0-9_\-./:#]+$/.test(t)) return false;                           // slug, path, css value
  if (/[{}=;]|=>|&&|\|\||\)\s*\?/.test(t)) return false;                      // code
  if (/^(true|false|null|undefined|button|submit|text|number|password|email|checkbox|radio|hidden|date|file|search|tel|url)$/i.test(t)) return false;
  return true;
}
const lineOf = (src, index) => src.slice(0, index).split('\n').length;

export function extract(file) {
  const raw = fs.readFileSync(file, 'utf8');
  // blank out comments but keep offsets and line numbers intact
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
  const out = []; const seen = new Set();
  const add = (kind, text, index, extra = {}) => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!visible(t)) return;
    const line = lineOf(src, index);
    const id = `${line}:${kind}:${t}`;
    if (seen.has(id)) return; seen.add(id);
    out.push({ file, line, kind, text: t, ...extra });
  };
  // text between tags (single line and across lines)
  for (const m of src.matchAll(/>([^<>{}]*?[A-Za-z][^<>{}]*?)</g)) add('text', m[1], m.index + 1 + (m[1].length - m[1].trimStart().length));
  // text between a tag and an expression, or an expression and a tag: `>Showing {n}` / `{n} learners<`
  for (const m of src.matchAll(/>([^<>{}\n]*[A-Za-z]{2}[^<>{}\n]*)\{/g)) add('text', m[1], m.index + 1);
  for (const m of src.matchAll(/\}([^<>{}\n]*[A-Za-z]{2}[^<>{}\n]*)</g)) add('text', m[1], m.index + 1);
  for (const m of src.matchAll(/\}([^<>{}\n]*[A-Za-z]{2}[^<>{}\n]*)\{/g)) { if (/^\s*[A-Za-z(.,:]/.test(m[1]) && !/[;=()]/.test(m[1])) add('text', m[1], m.index + 1); }
  // attributes
  for (const m of src.matchAll(new RegExp(`\\b(${ATTRS})=(?:"([^"\\n]*)"|'([^'\\n]*)')`, 'g'))) add('attr', m[2] ?? m[3], m.index, { name: m[1] });
  for (const m of src.matchAll(new RegExp(`\\b(${ATTRS})=\\{\\s*(?:"([^"\\n]*)"|'([^'\\n]*)'|\`([^\`\\n$]*)\`)\\s*\\}`, 'g'))) add('attr', m[2] ?? m[3] ?? m[4], m.index, { name: m[1] });
  // feedback calls
  for (const m of src.matchAll(/\b(toast(?:\.\w+)?|showToast|alert|confirm|window\.confirm|window\.alert|setError|setMessage|setSuccess|setStatus)\(\s*(?:'(?:success|error|info|warning)'\s*,\s*)?(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`)/g)) add('feedback', m[2] ?? m[3] ?? m[4], m.index, { name: m[1] });
  // label-like properties in objects
  for (const m of src.matchAll(new RegExp(`\\b(${PROPS})\\s*:\\s*(?:'((?:[^'\\\\\\n]|\\\\.)*)'|"((?:[^"\\\\\\n]|\\\\.)*)"|\`((?:[^\`\\\\]|\\\\.)*)\`)`, 'g'))) {
    const v = m[2] ?? m[3] ?? m[4];
    if (/^[A-Z]/.test(v.trim()) || /\s/.test(v.trim())) add('label', v, m.index, { name: m[1] });
  }
  // ternaries and fallbacks that produce text: cond ? 'Saving…' : 'Save', value || 'Unknown'
  for (const m of src.matchAll(/[?:|]\s*(?:'((?:[^'\\\n]|\\.){2,80})'|"((?:[^"\\\n]|\\.){2,80})")/g)) {
    const v = (m[1] ?? m[2]).trim();
    if (/^[A-Z][a-z]/.test(v) && (/\s/.test(v) || /…|\.\.\.$/.test(v) || /^[A-Z][a-z]{2,}$/.test(v))) add('expr', v, m.index);
  }
  return out.sort((a, b) => a.line - b.line);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const all = args.flatMap((f) => extract(f));
  if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(all, null, 1)); console.log(`${all.length} strings from ${args.length} file(s) -> ${jsonOut}`); }
  else {
    let cur = '';
    for (const s of all) {
      if (s.file !== cur) { cur = s.file; console.log(`\n== ${cur}`); }
      console.log(`${String(s.line).padStart(5)}  ${s.kind.padEnd(8)} ${s.name ? `[${s.name}] ` : ''}${s.text}`);
    }
    console.log(`\n${all.length} strings in ${args.length} file(s)`);
  }
}
