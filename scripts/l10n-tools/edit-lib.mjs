// Localization tooling: exact-text replacement with an asserted match count. The file keeps its
// original line endings. Used by one-off per-route edit scripts:
//   import { editor } from '../../scripts/l10n-tools/edit-lib.mjs';
//   const { R, save } = editor('src/app/x/page.tsx'); R('old', 'new'); save();
import fs from 'node:fs';
export function editor(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  // Whitespace-only lines are treated as empty (and saved that way): edit maps written to disk lose
  // trailing spaces, so a find string spanning an indented blank line would otherwise never match.
  let s = raw.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
  const R = (a, b, n = 1) => {
    a = a.replace(/[ \t]+$/gm, '');
    const c = s.split(a).length - 1;
    if (c !== n) throw new Error(`${file}: expected ${n} match(es), found ${c}: ${a.slice(0, 160)}`);
    s = s.split(a).join(b);
  };
  const all = (a, b) => { s = s.split(a).join(b); };
  const save = () => { fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('edited', file); };
  return { R, all, save, get text() { return s; } };
}
