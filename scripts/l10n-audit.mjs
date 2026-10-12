// Read-only localization audit: measures, per route, how much visible text goes through the
// translator and how much is hardcoded. Static analysis only — it does not prove what renders.
//
// Usage (from the repo root):
//   node scripts/l10n-audit.mjs                     -> writes docs/localization/.audit.json
//   node scripts/l10n-inventory.mjs                 -> rebuilds LOCALIZATION_ROUTE_INVENTORY.md from it
// Optional arguments: <repoRoot> <outJson>
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const OUT = process.argv[3] || path.join(ROOT, 'docs/localization/.audit.json');
const SRC = path.join(ROOT, 'src');
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const all = walk(SRC);
const codeFiles = all.filter((f) => /\.(tsx|ts)$/.test(f) && !/__tests__|\.test\.|\.d\.ts$/.test(f));

// ---------- dictionaries ----------
const flat = (o, pre = '', out = {}) => { for (const [k, v] of Object.entries(o)) { const key = pre ? `${pre}.${k}` : k; if (v && typeof v === 'object') flat(v, key, out); else out[key] = String(v); } return out; };
const en = flat(JSON.parse(read(path.join(SRC, 'locales/en.json'))));
const ar = flat(JSON.parse(read(path.join(SRC, 'locales/ar.json'))));
const vars = (s) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',');
const hasArabic = (s) => /[؀-ۿ]/.test(s);
const dict = {
  enKeys: Object.keys(en).length, arKeys: Object.keys(ar).length,
  missingInAr: Object.keys(en).filter((k) => !(k in ar)),
  missingInEn: Object.keys(ar).filter((k) => !(k in en)),
  arValueNotArabic: Object.keys(ar).filter((k) => !hasArabic(ar[k]) && /[A-Za-z]{3}/.test(ar[k])),
  varMismatch: Object.keys(en).filter((k) => k in ar && vars(en[k]) !== vars(ar[k])).map((k) => ({ key: k, en: vars(en[k]), ar: vars(ar[k]) })),
  topLevel: {},
};
for (const k of Object.keys(en)) { const t = k.split('.')[0]; dict.topLevel[t] = (dict.topLevel[t] || 0) + 1; }

// ---------- per-file text statistics ----------
const NOT_TEXT = /^(https?:|\/|#|\.|[a-z0-9_\-]+$|[A-Z0-9_]+$|\d)/;
const looksVisible = (s) => {
  const t = s.trim();
  if (t.length < 2 || !/[A-Za-z]{2}/.test(t)) return false;
  if (hasArabic(t) && !/[A-Za-z]{4}/.test(t)) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(t) && !/^[a-z]+$/.test(t)) return false; // camelCase identifier
  if (/^[a-z0-9_\-./:]+$/.test(t)) return false;                              // slug / path / css
  if (/[{}=;]|=>|&&|\|\|/.test(t)) return false;                              // code
  return true;
};
const ATTRS = 'placeholder|title|label|aria-label|alt|description|subtitle|helperText|emptyText|emptyMessage|confirmText|cancelText|tooltip|heading|caption|summary|buttonText|actionLabel|hint|message';
function analyse(file) {
  const src = read(file);
  if (src == null) return null;
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const samples = [];
  const push = (kind, text) => { if (looksVisible(text)) { samples.push({ kind, text: text.trim().replace(/\s+/g, ' ').slice(0, 90) }); return 1; } return 0; };
  let jsxText = 0, attr = 0, feedback = 0, objLabel = 0;
  for (const m of code.matchAll(/>\s*([^<>{}\n]{2,160}?)\s*</g)) jsxText += push('text', m[1]);
  for (const m of code.matchAll(/>\s*\n\s*([A-Za-z][^<>{}\n]{2,160}?)\s*\n\s*</g)) jsxText += push('text', m[1]);
  for (const m of code.matchAll(new RegExp(`\\b(?:${ATTRS})=(?:"([^"\\n]{2,160})"|'([^'\\n]{2,160})')`, 'g'))) attr += push('attr', m[1] ?? m[2]);
  for (const m of code.matchAll(/\b(?:toast(?:\.\w+)?|showToast|alert|confirm|window\.confirm|window\.alert|setError|setMessage|setSuccess)\(\s*(?:'(?:success|error|info|warning)'\s*,\s*)?(?:'([^'\n]{3,200})'|"([^"\n]{3,200})"|`([^`\n]{3,200})`)/g)) feedback += push('feedback', m[1] ?? m[2] ?? m[3]);
  for (const m of code.matchAll(/\b(?:title|text|label|header|Header|message|description|placeholder|confirmButtonText|cancelButtonText|name|subtitle|tooltip|error)\s*:\s*(?:'([^'\n]{3,160})'|"([^"\n]{3,160})")/g)) {
    const v = m[1] ?? m[2];
    if (/^[A-Z]/.test(v) || /\s/.test(v)) objLabel += push('label', v);
  }
  const tCalls = (code.match(/(?<![\w.])t\(\s*['"`]/g) || []).length;
  const tKeys = [...code.matchAll(/(?<![\w.])t\(\s*['"]([a-zA-Z0-9_.\-]+)['"]/g)].map((m) => m[1]);
  const tWithFallback = (code.match(/(?<![\w.])t\(\s*['"][^'"]+['"]\s*,\s*['"`]/g) || []).length;
  return {
    file: rel(file),
    client: /^\s*['"]use client['"]/m.test(src.slice(0, 300)),
    useI18n: /useI18n\s*\(/.test(code),
    legacyT: /from\s+['"]@\/lib\/i18n['"]/.test(code),
    nextI18next: /from\s+['"](?:next-i18next|react-i18next)['"]/.test(code),
    usesLang: /\b(?:lang|dir|isRTL|isRtl)\b/.test(code) && /useI18n|useThemeStore/.test(code),
    tCalls, tWithFallback, tKeys,
    hard: jsxText + attr + feedback + objLabel, jsxText, attr, feedback, objLabel,
    samples: samples.slice(0, 400),
    rtl: {
      physical: (code.match(/(?<![\w-])(?:ml|mr|pl|pr)-(?:\d|\[|px|auto)|(?<![\w-:])(?:left|right)-(?:\d|\[|px|full|auto|1\/2)|text-(?:left|right)\b|(?<![\w-])(?:border|rounded)-(?:l|r)(?:-|\b)|float-(?:left|right)/g) || []).length,
      logical: (code.match(/(?<![\w-])(?:ms|me|ps|pe)-(?:\d|\[|px|auto)|(?<![\w-])(?:start|end)-(?:\d|\[|px|full|auto)|text-(?:start|end)\b|rtl:/g) || []).length,
      spaceX: (code.match(/space-x-\d/g) || []).length,
      spaceXReverse: (code.match(/rtl:space-x-reverse/g) || []).length,
    },
    imports: [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]),
    dateFmt: (code.match(/toLocale(?:Date|Time)?String\(/g) || []).length,
    dateFmtLocaleAware: (code.match(/toLocale(?:Date|Time)?String\(\s*(?:lang|locale|[a-zA-Z]*[Ll]ocale|lang\s*===)/g) || []).length,
  };
}
const stats = new Map();
for (const f of codeFiles) { const a = analyse(f); if (a) stats.set(rel(f), a); }

// ---------- import resolution (local component graph) ----------
function resolve(fromRel, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.join(ROOT, path.dirname(fromRel), spec);
  else return null;
  for (const c of [base + '.tsx', base + '.ts', path.join(base, 'index.tsx'), path.join(base, 'index.ts')]) {
    const r = rel(c); if (stats.has(r)) return r;
  }
  return null;
}
const isUi = (r) => /\.tsx$/.test(r) && !/\/api\//.test(r);
function closure(start, maxDepth = 4) {
  const seen = new Set([start]); let frontier = [start];
  for (let d = 0; d < maxDepth; d++) {
    const next = [];
    for (const f of frontier) for (const spec of stats.get(f)?.imports ?? []) {
      const r = resolve(f, spec);
      if (r && isUi(r) && !seen.has(r) && !/components\/layout\/(Navbar|Sidebar|Topbar|MobileDrawer|AppShell|BottomNav|Footer)/.test(r)) { seen.add(r); next.push(r); }
    }
    frontier = next;
  }
  seen.delete(start);
  return [...seen];
}

// ---------- sidebar hierarchy ----------
const navSrc = read(path.join(SRC, 'lib/navigationConfig.tsx')) || '';
const navStart = navSrc.indexOf('export function getNavigationItems');
const navLines = navSrc.slice(navStart).split('\n');
const labelOf = (line) => {
  let m = line.match(/label:\s*t\(\s*'([^']+)'\s*,\s*'([^']+)'/); if (m) return { label: m[2], key: m[1] };
  m = line.match(/label:\s*t\(\s*'([^']+)'\s*\)/); if (m) return { label: en[m[1]] ?? m[1], key: m[1] };
  m = line.match(/label:\s*'([^']+)'/) || line.match(/label:\s*"([^"]+)"/); if (m) return { label: m[1], key: null };
  return null;
};
const nav = []; const stack = [];
for (let i = 0; i < navLines.length; i++) {
  const line = navLines[i];
  if (!/label:/.test(line)) continue;
  const indent = line.match(/^\s*/)[0].length;
  const lab = labelOf(line); if (!lab) continue;
  while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
  const href = (line.match(/href:\s*'([^']+)'/) || [])[1] ?? (navLines.slice(i, i + 4).join(' ').match(/href:\s*'([^']+)'/) || [])[1];
  const hasChildrenSoon = /children:/.test(navLines.slice(i, i + 6).join(' ')) && !/href:/.test(line);
  const trail = [...stack.map((s) => s.label), lab.label];
  if (href && !hasChildrenSoon) nav.push({ href: href.split('?')[0], trail, labelKey: lab.key, roles: (line.match(/roles:\s*\[([^\]]+)\]/) || [])[1]?.replace(/['\s]/g, '') ?? null });
  stack.push({ indent, label: lab.label });
}
const labelArSrc = navSrc.slice(navSrc.indexOf('const LABEL_AR'), navSrc.indexOf('function translateMenuTree'));
const labelAr = new Set([...labelArSrc.matchAll(/^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z]+))\s*:/gm)].map((m) => m[1] ?? m[2] ?? m[3]));
const literalNavLabels = [...new Set(navLines.filter((l) => /label:\s*['"]/.test(l)).map((l) => labelOf(l)?.label).filter(Boolean))];
const navLabelsMissingAr = literalNavLabels.filter((l) => !labelAr.has(l));

// ---------- routes ----------
const APP = path.join(SRC, 'app');
const pages = all.filter((f) => /[\\/]page\.tsx$/.test(f) && !/[\\/]api[\\/]/.test(f));
const routeOf = (f) => '/' + rel(path.dirname(f)).replace(/^src\/app\/?/, '').replace(/\([^)]+\)\/?/g, '').replace(/\/$/, '');
const navByHref = new Map(); for (const n of nav) if (!navByHref.has(n.href)) navByHref.set(n.href, n);
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const routes = pages.map((f) => {
  const r = rel(f); const page = stats.get(r); const kids = closure(r);
  const files = [page, ...kids.map((k) => stats.get(k))].filter(Boolean);
  const tCalls = sum(files, (x) => x.tCalls), hard = sum(files, (x) => x.hard);
  const route = routeOf(f) || '/';
  let navEntry = navByHref.get(route);
  if (!navEntry) { // nearest ancestor that is in the sidebar
    const parts = route.split('/').filter(Boolean);
    for (let i = parts.length - 1; i > 0 && !navEntry; i--) navEntry = navByHref.get('/' + parts.slice(0, i).join('/'));
    if (navEntry) navEntry = { ...navEntry, inherited: true };
  }
  const legacyFiles = files.filter((x) => x.legacyT || x.nextI18next).map((x) => x.file);
  const noHookFiles = files.filter((x) => !x.useI18n && !x.legacyT && !x.nextI18next && x.hard > 0).map((x) => x.file);
  const share = tCalls + hard === 0 ? null : tCalls / (tCalls + hard);
  let status;
  if (tCalls + hard === 0) status = 'no-visible-text-detected';
  else if (tCalls === 0) status = 'not-translated';
  else if (share >= 0.9 && noHookFiles.length === 0 && legacyFiles.length === 0) status = 'mostly-wired';
  else if (share >= 0.5) status = 'partial-majority';
  else status = 'partial-minority';
  return {
    route, file: r, dynamic: /\[/.test(route),
    module: route.split('/').filter(Boolean)[0] ?? 'root',
    sidebar: navEntry ? navEntry.trail.join(' › ') + (navEntry.inherited ? ' (child page — not itself in sidebar)' : '') : null,
    sidebarLabelViaDictionary: navEntry ? !!navEntry.labelKey : null,
    roles: navEntry?.roles ?? null,
    components: kids,
    pageUsesI18n: !!page?.useI18n,
    tCalls, hard, share: share == null ? null : Math.round(share * 100),
    byKind: { text: sum(files, (x) => x.jsxText), attr: sum(files, (x) => x.attr), feedback: sum(files, (x) => x.feedback), label: sum(files, (x) => x.objLabel) },
    legacyFiles, noHookFiles, status,
    rtl: { physical: sum(files, (x) => x.rtl.physical), logical: sum(files, (x) => x.rtl.logical), spaceX: sum(files, (x) => x.rtl.spaceX), spaceXReverse: sum(files, (x) => x.rtl.spaceXReverse) },
    dateFmt: sum(files, (x) => x.dateFmt), dateFmtLocaleAware: sum(files, (x) => x.dateFmtLocaleAware),
    apis: [...new Set(files.flatMap((x) => [...(read(path.join(ROOT, x.file)) || '').matchAll(/['"`](\/api\/[a-zA-Z0-9_\-/]+)/g)].map((m) => m[1])))].slice(0, 12),
    samples: files.flatMap((x) => x.samples.map((s) => ({ ...s, file: x.file }))).slice(0, 60),
  };
}).sort((a, b) => a.route.localeCompare(b.route));

// ---------- key usage ----------
const usedKeys = new Set(); const keyUsers = {};
for (const s of stats.values()) for (const k of s.tKeys) { usedKeys.add(k); (keyUsers[k] ||= []).push(s.file); }
const dynamicPrefixes = new Set();
for (const s of stats.values()) for (const m of (read(path.join(ROOT, s.file)) || '').matchAll(/(?<![\w.])t\(\s*`([a-zA-Z0-9_.]+)\.\$\{/g)) dynamicPrefixes.add(m[1]);
const isDynamicallyUsed = (k) => [...dynamicPrefixes].some((p) => k.startsWith(p + '.'));
dict.usedButMissingEn = [...usedKeys].filter((k) => !(k in en) && /\./.test(k)).map((k) => ({ key: k, files: [...new Set(keyUsers[k])].slice(0, 3) }));
dict.usedButMissingAr = [...usedKeys].filter((k) => (k in en) && !(k in ar));
dict.unused = Object.keys(en).filter((k) => !usedKeys.has(k) && !isDynamicallyUsed(k));
dict.dynamicPrefixes = [...dynamicPrefixes];
dict.usedKeyCount = usedKeys.size;

// ---------- shared components ----------
const usage = {};
for (const r of routes) for (const c of r.components) (usage[c] ||= new Set()).add(r.route);
const shared = Object.entries(usage).map(([file, set]) => { const s = stats.get(file); return { file, routes: set.size, tCalls: s.tCalls, hard: s.hard, useI18n: s.useI18n, legacyT: s.legacyT, nextI18next: s.nextI18next }; })
  .filter((x) => x.routes >= 3).sort((a, b) => b.routes * b.hard - a.routes * a.hard);

// ---------- API user-visible messages ----------
const apiFiles = codeFiles.filter((f) => /[\\/]app[\\/]api[\\/]/.test(f) && /route\.ts$/.test(f));
let apiMsgs = 0, apiFilesWithMsgs = 0, apiLangAware = 0; const apiSamples = [];
for (const f of apiFiles) {
  const s = read(f) || '';
  const ms = [...s.matchAll(/\b(?:error|message)\s*:\s*(?:'([^'\n]{4,160})'|"([^"\n]{4,160})"|`([^`\n]{4,160})`)/g)].map((m) => m[1] ?? m[2] ?? m[3]).filter((v) => /[A-Za-z]{3}/.test(v) && /\s/.test(v));
  if (ms.length) { apiFilesWithMsgs++; apiMsgs += ms.length; if (apiSamples.length < 25) apiSamples.push({ file: rel(f), text: ms[0] }); }
  if (/langFromRequest|asLang\(|x-lang/.test(s)) apiLangAware++;
}

// ---------- language consumers of each mechanism ----------
const mech = {
  useI18nFiles: [...stats.values()].filter((s) => s.useI18n).length,
  legacyTFiles: [...stats.values()].filter((s) => s.legacyT).map((s) => ({ file: s.file, tCalls: s.tCalls })),
  nextI18nextFiles: [...stats.values()].filter((s) => s.nextI18next).map((s) => s.file),
  windowI18nInjected: [...stats.values()].some((s) => /window(?:\s+as\s+any)?\)?\.__I18N__\s*=/.test(read(path.join(ROOT, s.file)) || '')),
  i18nServerUsers: [...stats.values()].filter((s) => s.imports.includes('@/lib/i18nServer')).map((s) => s.file),
  localizeUsers: [...stats.values()].filter((s) => s.imports.includes('@/lib/i18n/localize')).map((s) => s.file),
  tsxTotal: [...stats.values()].filter((s) => /\.tsx$/.test(s.file)).length,
  tsxWithHard: [...stats.values()].filter((s) => /\.tsx$/.test(s.file) && s.hard > 0).length,
  tsxWithHardNoHook: [...stats.values()].filter((s) => /\.tsx$/.test(s.file) && s.hard > 0 && !s.useI18n && !s.legacyT && !s.nextI18next && !/\/api\//.test(s.file)).length,
};

fs.writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(), dict, nav: { entries: nav, literalLabels: literalNavLabels.length, labelArEntries: labelAr.size, navLabelsMissingAr }, routes, shared,
  api: { files: apiFiles.length, filesWithMessages: apiFilesWithMsgs, messages: apiMsgs, langAwareFiles: apiLangAware, samples: apiSamples }, mech,
}, null, 1));
const by = {}; for (const r of routes) by[r.status] = (by[r.status] || 0) + 1;
console.log('routes', routes.length, JSON.stringify(by));
console.log('dict', dict.enKeys, dict.arKeys, 'missingAr', dict.missingInAr.length, 'arNotArabic', dict.arValueNotArabic.length, 'varMismatch', dict.varMismatch.length, 'usedMissingEn', dict.usedButMissingEn.length, 'unused', dict.unused.length);
console.log('nav entries', nav.length, 'literal labels', literalNavLabels.length, 'missing LABEL_AR', navLabelsMissingAr.length);
console.log('mech', JSON.stringify({ ...mech, legacyTFiles: mech.legacyTFiles.length, nextI18nextFiles: mech.nextI18nextFiles, i18nServerUsers: mech.i18nServerUsers.length, localizeUsers: mech.localizeUsers.length }));
console.log('api', apiFiles.length, apiFilesWithMsgs, apiMsgs, apiLangAware);
