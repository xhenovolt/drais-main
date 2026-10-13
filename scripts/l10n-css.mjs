// Compiles the app stylesheet (Tailwind v4 via PostCSS) to one CSS file, so scripts/l10n-render.mjs
// can render pages with their real styling: node scripts/l10n-css.mjs <out.css>
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const input = path.resolve('src/app/globals.css');
const out = process.argv[2] || 'l10n.css';
const result = await postcss([tailwind()]).process(fs.readFileSync(input, 'utf8'), { from: input, to: out });
fs.writeFileSync(out, result.css);
console.log('compiled', out, Math.round(result.css.length / 1024) + ' KB');
