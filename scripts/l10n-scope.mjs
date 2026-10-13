// Catches the mistake that crashed the learner snapshot in production: a component calls t(),
// digits(), formatNumber()… but its own `useI18n()` line does not hand that name out.
//
//   node scripts/l10n-scope.mjs <file.tsx> [more files]
//
// Heuristic, line based: each use is checked against the nearest `useI18n()` destructuring above
// it. It can be wrong for helpers defined between components (pass the function in, or ignore the
// report after reading the code); it exists to make a missing name impossible to overlook.
import fs from 'node:fs';
const NAMES = ['t', 'rich', 'digits', 'formatNumber', 'formatMoney', 'formatPercent', 'formatDate', 'lang', 'dir'];
let problems = 0;
for (const file of process.argv.slice(2)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let have = null, haveLine = 0;
  const reported = new Set();
  lines.forEach((line, i) => {
    const m = /const \{([^}]*)\} = (?:await )?(?:useI18n|getServerI18n)\(/.exec(line);
    if (m) { have = new Set(m[1].split(',').map((s) => s.trim().split(':')[0].trim())); haveLine = i + 1; return; }
    for (const name of NAMES.slice(0, 7)) {
      const used = new RegExp(`(^|[^.\\w$'"\`])${name}\\(`).test(line);
      if (!used) continue;
      // a parameter or local of the same name on this line (e.g. `.map(t => t(…))`) is not ours to judge
      if (new RegExp(`\\b${name}\\s*(=>|:)|\\(${name}\\)|function ${name}\\b|const ${name}\\b`).test(line)) continue;
      const key = `${haveLine}:${name}`;
      if (have && have.has(name)) continue;
      if (reported.has(key)) continue;
      reported.add(key); problems++;
      console.log(`${file}:${i + 1}: ${name}() used, but ${have ? `the useI18n() at line ${haveLine} does not provide it` : 'no useI18n() above it'}`);
    }
  });
}
console.log(problems ? `${problems} possible scope problem(s)` : 'scope ok');
process.exit(problems ? 1 : 0);
