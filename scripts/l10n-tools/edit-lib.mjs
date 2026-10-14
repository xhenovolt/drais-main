// Localization tooling: exact-text replacement with an asserted match count. The file keeps its
// original line endings. Used by one-off per-route edit scripts:
//   import { editor } from '../../scripts/l10n-tools/edit-lib.mjs';
//   const { R, save } = editor('src/app/x/page.tsx'); R('old', 'new'); save();
import fs from 'node:fs';
export function editor(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let s = raw.replace(/\r\n/g, '\n');
  const R = (a, b, n = 1) => {
    const c = s.split(a).length - 1;
    if (c !== n) throw new Error(`${file}: expected ${n} match(es), found ${c}: ${a.slice(0, 160)}`);
    s = s.split(a).join(b);
  };
  const all = (a, b) => { s = s.split(a).join(b); };
  const save = () => { fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('edited', file); };
  return { R, all, save, get text() { return s; } };
}
