// Renders one page or component in a real (headless) browser, in English and in Arabic, WITHOUT
// the app server or a login, and reports what text actually appears.
//
//   node scripts/l10n-render.mjs src/app/students/admit/page.tsx [--out dir] [--click "selector"]
//
// What it proves: the component mounts under the real I18nProvider with the real dictionaries;
// in Arabic no translation key leaks ("students.admit.title") and it lists every piece of Latin
// text still visible; switching back to English restores English; <html dir> follows the language.
//
// What it does NOT prove: styling and layout (Tailwind is not compiled here, so the page is
// unstyled), anything behind data the page fetches (requests are answered with an empty success),
// or interactions beyond the optional --click. A signed-in look at the real page is still required
// before a route is closed (docs/localization/ARABIC_TRANSLATION_ROADMAP.md).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const outDir = flag('--out') || fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-render-'));
const clickSel = flag('--click');
const mockPath = flag('--mock');
// --props '{"open":true}' : props for a component that needs them (a dialog needs open/isOpen).
// Any prop the component calls that is not given (onClose, onSubmit, ...) is a no-op.
const propsJson = flag('--props') || '{}';
// --css file.css : the compiled app stylesheet (node scripts/l10n-css.mjs out.css). With it the page
// is rendered with its real styling, so the screenshots can be used to judge layout and RTL.
const cssPath = flag('--css');
// --width N : viewport width in CSS pixels (390 = phone, 1280 = laptop). Default 1000.
const width = Number(flag('--width') || 1000);
// --lang ar|en : only render that language (faster when iterating on layout).
const onlyLang = flag('--lang');
// --params '{"id":"5"}' : what useParams() returns, for pages under a [dynamic] folder.
const paramsJson = flag('--params') || '{}';
JSON.parse(paramsJson);
JSON.parse(propsJson); // fail early on a typo
// --mock file.json : { "<url substring>": <response body>, ... } — first matching substring wins.
const mocks = mockPath ? JSON.parse(fs.readFileSync(mockPath, 'utf8')) : {};
const requested = new Set();
const target = args[0];
if (!target) { console.error('usage: node scripts/l10n-render.mjs <page-or-component.tsx> [--out dir] [--click selector]'); process.exit(2); }
const ROOT = process.cwd();
fs.mkdirSync(outDir, { recursive: true });

const entry = path.join(outDir, 'entry.tsx');
const rel = (p) => path.resolve(ROOT, p).replace(/\\/g, '/');
fs.writeFileSync(entry, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '${rel('src/components/i18n/I18nProvider.tsx')}';
import { useThemeStore } from '${rel('src/hooks/useThemeStore.ts')}';
import * as Mod from '${rel(target)}';
const Component = (Mod as any).default ?? Object.values(Mod).find((v) => typeof v === 'function');
(window as any).__setLang = (l: string) => useThemeStore.getState().setLanguage(l);
const given: Record<string, unknown> = ${propsJson};
const props = new Proxy(given, { get: (t, k: string) => (k in t ? t[k] : (typeof k === 'string' && /^on[A-Z]/.test(k) ? () => {} : undefined)), has: () => true, ownKeys: (t) => Reflect.ownKeys(t), getOwnPropertyDescriptor: (t, k) => Object.getOwnPropertyDescriptor(t, k) });
class Boundary extends React.Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: any) { return { err: String(e?.message || e) }; }
  render() { return this.state.err ? <pre id="__render_error">{this.state.err}</pre> : this.props.children; }
}
createRoot(document.getElementById('root')!).render(
  <Boundary><I18nProvider loadSchoolDefault={false}><Component {...props} /></I18nProvider></Boundary>
);
`);

// Next.js runtime pieces a page imports, replaced by inert stand-ins.
const stubs = {
  'next/navigation': `export const useRouter = () => ({ push() {}, replace() {}, back() {}, refresh() {}, prefetch() {} });
    export const usePathname = () => '/'; export const useSearchParams = () => new URLSearchParams(); export const useParams = () => (${paramsJson}); export const redirect = () => {};`,
  'next/link': `import React from 'react'; export default function Link({ href, children, prefetch, ...rest }) { return React.createElement('a', { href: typeof href === 'string' ? href : '#', ...rest }, children); }`,
  'next/image': `import React from 'react'; export default function Image({ src, alt, fill, priority, ...rest }) { return React.createElement('img', { src: typeof src === 'string' ? src : '', alt, ...rest }); }`,
  'next/dynamic': `import React from 'react'; export default function dynamic() { return function Stub() { return null; }; }`,
  // A signed-in staff user, so pages that call useAuth() mount without the real session provider.
  '@/contexts/AuthContext': `import React from 'react'; const value = { user: { id: 1, schoolId: 1, school_id: 1, role: 'admin', firstName: 'Test', lastName: 'User', permissions: [] }, loading: false, isAuthenticated: true, hasPermission: () => true, hasRole: () => true, login: async () => {}, logout: async () => {}, refresh: async () => {} }; export const useAuth = () => value; export const AuthProvider = ({ children }) => React.createElement(React.Fragment, null, children);`,
  'next/headers': `export const cookies = async () => ({ get() { return undefined; } }); export const headers = async () => new Map();`,
};
const stubPlugin = {
  name: 'next-stubs',
  setup(b) {
    b.onResolve({ filter: /^next\/(navigation|link|image|dynamic|headers)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onResolve({ filter: /^@\/contexts\/AuthContext$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: stubs[a.path], loader: 'jsx', resolveDir: ROOT }));
    b.onResolve({ filter: /\.(css|scss)$/ }, (a) => ({ path: a.path, namespace: 'empty' }));
    b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' }));
  },
};

await build({
  entryPoints: [entry], bundle: true, format: 'iife', outfile: path.join(outDir, 'bundle.js'), platform: 'browser',
  jsx: 'automatic', alias: { '@': path.join(ROOT, 'src') }, plugins: [stubPlugin], logLevel: 'error',
  absWorkingDir: ROOT, nodePaths: [path.join(ROOT, 'node_modules')], // the entry file lives outside the repo
  define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}', global: 'window' },
  loader: { '.json': 'json', '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.woff2': 'dataurl' },
});
fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>l10n render</title>
${cssPath ? `<link rel="stylesheet" href="app.css">` : `<style>body{font:14px 'Segoe UI',Tahoma,sans-serif;padding:16px;max-width:900px} input,select,button{font:inherit;margin:2px} svg{width:14px;height:14px}</style>`}
</head><body class="font-sans antialiased"><div id="root" class="min-h-screen bg-slate-50 dark:bg-slate-950"></div><script src="bundle.js"></script></body></html>`);

if (cssPath) fs.copyFileSync(cssPath, path.join(outDir, 'app.css'));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width, height: 900, deviceScaleFactor: width < 600 ? 2 : 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
page.on('console', (m) => { if (m.type() === 'error' || /\[i18n\] missing key/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });
// Every request the page makes gets an empty success, so loading states resolve without a server.
await page.setRequestInterception(true);
page.on('request', (r) => {
  const url = r.url();
  if (url.startsWith('file://') && /\/(index\.html|bundle\.js|app\.css)(\?|$)/.test(url)) return r.continue();
  const staticHit = url.match(/\/(fonts|icons|images)\/[^?]+/);
  if (staticHit && fs.existsSync(path.join(ROOT, 'public', staticHit[0]))) return r.respond({ status: 200, body: fs.readFileSync(path.join(ROOT, 'public', staticHit[0])) });
  if (url.startsWith('data:') || url.startsWith('blob:')) return r.continue();
  const apiPath = url.replace(/^file:\/\/\/?[A-Za-z]:/, '').replace(/^https?:\/\/[^/]+/, '');
  requested.add(apiPath.split('?')[0]);
  const hit = Object.keys(mocks).find((k) => apiPath.includes(k));
  r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(hit ? mocks[hit] : { success: true, data: [], rows: [], items: [], total: 0 }) });
});
await page.goto('file:///' + path.join(outDir, 'index.html').replace(/\\/g, '/'), { waitUntil: 'load' });
const settle = () => new Promise((r) => setTimeout(r, 900));

async function snapshot(lang) {
  await page.evaluate((l) => window.__setLang(l), lang);
  await settle();
  if (clickSel) { try { await page.click(clickSel); await settle(); } catch { /* selector not present in this state */ } }
  const data = await page.evaluate(() => {
    const visible = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden'; };
    const out = new Set();
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); // body, not #root: dialogs render in portals
    for (let n = walk.nextNode(); n; n = walk.nextNode()) { const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t && n.parentElement && visible(n.parentElement)) out.add(t); }
    for (const el of document.querySelectorAll('[placeholder], [title], [aria-label], [alt]')) {
      for (const a of ['placeholder', 'title', 'aria-label', 'alt']) { const v = el.getAttribute(a); if (v && v.trim()) out.add(`[${a}] ${v.trim()}`); }
    }
    return { texts: [...out], dir: document.documentElement.dir, lang: document.documentElement.lang, crashed: document.getElementById('__render_error')?.textContent ?? null };
  });
  await page.screenshot({ path: path.join(outDir, `${lang}-${width}.png`), fullPage: true });
  return data;
}

const en = onlyLang === 'ar' ? await snapshot('ar') : await snapshot('en');
const ar = onlyLang === 'en' ? en : await snapshot('ar');
const enAgain = onlyLang ? en : await snapshot('en');
await browser.close();

const KEYLIKE = /^(\[[a-z-]+\] )?[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+){1,5}$/;
const hasArabic = (s) => /[؀-ۿ]/.test(s);
const latinOnly = ar.texts.filter((t) => !hasArabic(t) && /[A-Za-z]{2}/.test(t));
const leakedKeys = [...en.texts, ...ar.texts].filter((t) => KEYLIKE.test(t));
const same = JSON.stringify(en.texts) === JSON.stringify(enAgain.texts);

console.log(`\n${target}`);
console.log(`  English : ${en.texts.length} texts, <html lang="${en.lang}" dir="${en.dir}">${en.crashed ? '  CRASHED: ' + en.crashed : ''}`);
console.log(`  Arabic  : ${ar.texts.length} texts, <html lang="${ar.lang}" dir="${ar.dir}">${ar.crashed ? '  CRASHED: ' + ar.crashed : ''}`);
console.log(`  Arabic texts containing Arabic script : ${ar.texts.filter(hasArabic).length}`);
console.log(`  Translation keys leaked to the screen : ${leakedKeys.length}${leakedKeys.length ? '  -> ' + leakedKeys.join(' | ') : ''}`);
console.log(`  English -> Arabic -> English restores the same text : ${same ? 'yes' : 'NO'}`);
console.log(`  Still Latin-only in Arabic (${latinOnly.length}) — review each: is it intentional?`);
for (const t of latinOnly) console.log(`     ${t.slice(0, 110)}`);
console.log(`  Errors / missing-key warnings: ${errors.length ? '\n     ' + [...new Set(errors)].slice(0, 12).join('\n     ') : 'none'}`);
console.log(`  Requests the page made (answered with ${mockPath ? 'mock data or ' : ''}an empty success): ${[...requested].slice(0, 30).join(', ') || 'none'}`);
console.log(`  Screenshots (unstyled): ${path.join(outDir, 'en.png')} , ${path.join(outDir, 'ar.png')}`);
fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify({ target, en, ar, latinOnly, leakedKeys, restores: same, errors }, null, 1));
process.exit(leakedKeys.length || ar.crashed || en.crashed || !same || (!onlyLang && ar.dir !== 'rtl') ? 1 : 0);
