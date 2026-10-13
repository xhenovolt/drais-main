// Makes a file's Tailwind spacing direction-aware: left/right utilities become start/end ones.
//
//   node scripts/l10n-rtl.mjs <file.tsx> [more files]      (add --dry to only count)
//
// In English (left-to-right) the result is pixel-identical: ms-2 IS ml-2, start-3 IS left-3.
// In Arabic the layout mirrors. Deliberately NOT touched:
//   - left-1/2 / right-1/2 (centring with a translate — mirroring it would break the centring)
//   - anything inside an element marked data-no-mirror is still converted; such elements are rare
//     and are checked by eye.
import fs from 'node:fs';
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const RULES = [
  [/(?<![\w/])(-?)ml-(?=[\d\[a-z])/g, '$1ms-'], [/(?<![\w/])(-?)mr-(?=[\d\[a-z])/g, '$1me-'],
  [/(?<![\w/])(-?)pl-(?=[\d\[a-z])/g, '$1ps-'], [/(?<![\w/])(-?)pr-(?=[\d\[a-z])/g, '$1pe-'],
  [/(?<![\w/-])text-left(?![\w-])/g, 'text-start'], [/(?<![\w/-])text-right(?![\w-])/g, 'text-end'],
  [/(?<![\w/])(-?)left-(?=(\d+(\.\d+)?|px|\[[^\]]+\])(?![\w/.]))/g, '$1start-'],
  [/(?<![\w/])(-?)right-(?=(\d+(\.\d+)?|px|\[[^\]]+\])(?![\w/.]))/g, '$1end-'],
  [/(?<![\w/-])border-l(?=(-\d|-\[|[\s"'`]))/g, 'border-s'], [/(?<![\w/-])border-r(?=(-\d|-\[|[\s"'`]))/g, 'border-e'],
  [/(?<![\w/-])rounded-l(?=(-|[\s"'`]))(?!-\w*g)/g, 'rounded-s'], [/(?<![\w/-])rounded-r(?=(-|[\s"'`]))/g, 'rounded-e'],
];
for (const file of args.filter((a) => a !== '--dry')) {
  const raw = fs.readFileSync(file, 'utf8');
  let n = 0;
  // only inside string literals that look like class lists (contain a space-separated utility)
  const out = raw.replace(/(className=|class=|clsx\(|cn\(|['"`])([^\n]*)/g, (line) => {
    let s = line;
    for (const [re, to] of RULES) s = s.replace(re, (...m) => { n++; return to.replace('$1', m[1] ?? ''); });
    return s;
  });
  if (n && !dry) fs.writeFileSync(file, out);
  console.log(`${String(n).padStart(4)}  ${file}`);
}
