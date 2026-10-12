// Builds docs/localization/LOCALIZATION_ROUTE_INVENTORY.md from the audit JSON.
import fs from 'node:fs';
// Usage (from the repo root, after scripts/l10n-audit.mjs): node scripts/l10n-inventory.mjs
// Optional arguments: <auditJson> <outMarkdown> <date>
const d = JSON.parse(fs.readFileSync(process.argv[2] || 'docs/localization/.audit.json', 'utf8'));
const OUT = process.argv[3] || 'docs/localization/LOCALIZATION_ROUTE_INVENTORY.md';
const DATE = process.argv[4] || new Date().toISOString().slice(0, 10);

const STATUS = {
  'not-translated': 'Not translated',
  'partial-minority': 'Partial (under half)',
  'partial-majority': 'Partial (over half)',
  'mostly-wired': 'Mostly wired',
  'no-visible-text-detected': 'No own text (redirect/shell)',
};
const HIGH = /^\/(finance|payroll|academics\/(results|report|exams)|reports|results|print-|rpt|drce|promotions|students\/(import|migrate|promote|enroll-bulk|repair)|attendance\/(recovery|time-health|device))/;
const risk = (r) => (HIGH.test(r.route) || r.hard > 150 ? 'High' : r.hard > 40 || r.components.length > 4 ? 'Medium' : 'Low');
const rtl = (r) => {
  const p = r.rtl.physical, l = r.rtl.logical;
  if (p === 0) return 'No fixed-side classes found';
  return `${p} fixed-side class${p === 1 ? '' : 'es'}${l ? `, ${l} RTL-aware` : ', none RTL-aware'}`;
};
const short = (f) => f.replace(/^src\//, '');
const esc = (s) => String(s).replace(/\|/g, '\\|');

// module order = sidebar order, then everything not in the sidebar
const topOrder = [];
for (const n of d.nav.entries) if (!topOrder.includes(n.trail[0])) topOrder.push(n.trail[0]);
const groupOf = (r) => (r.sidebar ? r.sidebar.split(' › ')[0].replace(/ \(child page.*$/, '') : null);
const groups = new Map();
for (const r of d.routes) {
  const g = groupOf(r) ?? `Not in sidebar — /${r.module}`;
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(r);
}
const ordered = [...groups.keys()].sort((a, b) => {
  const ia = topOrder.indexOf(a), ib = topOrder.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  return a.localeCompare(b);
});

const count = (f) => d.routes.filter(f).length;
let md = '';
md += `# DRAIS Localization — Route Inventory\n\n`;
md += `_Generated ${DATE} by \`scripts/l10n-audit.mjs\` from the code as it stood at that commit. Re-run the script to refresh; do not hand-edit the generated tables. Hand-written verification records go in the "Verification log" section at the end._\n\n`;
md += `## How to read this\n\n`;
md += `- **Every row is a real route**, discovered from \`src/app/**/page.tsx\` (API routes excluded). There are **${d.routes.length}** of them.\n`;
md += `- **Sidebar location** comes from \`src/lib/navigationConfig.tsx\`. "Not in sidebar" means the page is reached by a link, a button or a URL, not a menu item.\n`;
md += `- **Translated calls / Hardcoded** are counts across the page file *and every component it renders* (import graph, 4 levels deep, layout chrome excluded). "Hardcoded" is an estimate of visible English strings written directly in the code: text between tags, \`placeholder\`/\`title\`/\`label\` attributes, toast and dialog messages, and table/column labels.\n`;
md += `- **These numbers are a static estimate, not proof.** They tell us where the work is; they do not show that Arabic renders. A route is only "done" when the four verification columns are filled in from a real browser check.\n`;
md += `- **Status** is derived from those counts: *Not translated* = no translated calls at all; *Partial* = some; *Mostly wired* = at least 90% of visible strings go through the translator **and** no child component bypasses it. "Mostly wired" still needs a browser check — see finding F4 in the architecture audit (English fallbacks can hide missing Arabic).\n\n`;
md += `## Progress — measured by verified routes, not dictionary size\n\n`;
md += `| Indicator | Count | What it proves |\n|---|---|---|\n`;
md += `| Routes discovered | ${d.routes.length} of ${d.routes.length} | Scope is known |\n`;
md += `| Routes with a static text count and component list | ${d.routes.length} of ${d.routes.length} | We know roughly how much text each route has and where it lives |\n`;
md += `| Routes with a full string-by-string inventory | 0 of ${d.routes.length} | Done per route at the start of its phase (Students first) |\n`;
md += `| Routes translated | 0 newly; ${count((r) => r.status === 'mostly-wired')} were already mostly wired before this audit | Translation implementation exists |\n`;
md += `| Routes browser-tested in Arabic | 0 of ${d.routes.length} | Arabic actually renders |\n`;
md += `| Routes with critical interactions re-tested | 0 of ${d.routes.length} | Translation did not break functionality |\n`;
md += `| Shared components regression-tested | 0 | Fixes work beyond one page |\n\n`;
md += `## Static status by sidebar section\n\n`;
md += `| Section | Routes | Not translated | Partial (under half) | Partial (over half) | Mostly wired | Translated calls | Hardcoded (est.) |\n|---|---|---|---|---|---|---|---|\n`;
for (const g of ordered) {
  const rs = groups.get(g);
  const c = (s) => rs.filter((r) => r.status === s).length;
  md += `| ${esc(g)} | ${rs.length} | ${c('not-translated')} | ${c('partial-minority')} | ${c('partial-majority')} | ${c('mostly-wired')} | ${rs.reduce((a, r) => a + r.tCalls, 0)} | ${rs.reduce((a, r) => a + r.hard, 0)} |\n`;
}
md += `| **All routes** | **${d.routes.length}** | **${count((r) => r.status === 'not-translated')}** | **${count((r) => r.status === 'partial-minority')}** | **${count((r) => r.status === 'partial-majority')}** | **${count((r) => r.status === 'mostly-wired')}** | | |\n\n`;
md += `Shared components are counted once per route that renders them, so the "Hardcoded" column cannot be summed into a single application total.\n\n`;

// ---------- Students: detailed (first module to implement) ----------
const isStudents = (r) => r.module === 'students' || groupOf(r) === 'Students';
const students = d.routes.filter(isStudents);
md += `## Students module — detailed inventory (first module to implement)\n\n`;
md += `${students.length} routes belong to the Students module (everything under \`/students\`, plus \`/admissions\`, which sits in the Students menu). ${students.filter((r) => r.sidebar && !/child page/.test(r.sidebar)).length} are sidebar items; the rest are reached from buttons and links inside those pages and must be translated with them.\n\n`;
md += `**Proposed order** (sidebar order first, then the pages each one links to):\n\n`;
const sOrder = [];
for (const n of d.nav.entries) { const r = students.find((x) => x.route === n.href); if (r && !sOrder.includes(r)) sOrder.push(r); }
for (const r of students) if (!sOrder.includes(r)) sOrder.push(r);
sOrder.forEach((r, i) => { md += `${i + 1}. \`${r.route}\` — ${r.sidebar ? esc(r.sidebar) : 'not in sidebar'}\n`; });
md += `\n`;
for (const r of sOrder) {
  md += `### \`${r.route}\`\n\n`;
  md += `| Field | Value |\n|---|---|\n`;
  md += `| Route | \`${r.route}\`${r.dynamic ? ' (dynamic segment)' : ''} |\n`;
  md += `| Module | Students |\n`;
  md += `| Sidebar location | ${r.sidebar ? esc(r.sidebar) : 'Not in sidebar'}${r.roles ? ` — roles: ${r.roles}` : ''} |\n`;
  md += `| Page file | \`${short(r.file)}\` |\n`;
  md += `| Child components | ${r.components.length ? r.components.map((c) => `\`${short(c)}\``).join(', ') : 'None (all text is in the page file)'} |\n`;
  md += `| Text inventory (static count) | ${r.hard} hardcoded: ${r.byKind.text} text between tags, ${r.byKind.attr} attributes (placeholders, titles), ${r.byKind.feedback} toasts/alerts, ${r.byKind.label} labels in config objects |\n`;
  md += `| Existing translation | ${r.tCalls ? `${r.tCalls} calls through \`useI18n().t\`` : 'None'}${r.legacyFiles.length ? `; legacy helper in ${r.legacyFiles.map((f) => `\`${short(f)}\``).join(', ')}` : ''} |\n`;
  md += `| Missing translation | ${STATUS[r.status]}${r.share != null ? ` — about ${r.share}% of visible strings go through the translator` : ''}${r.noHookFiles.length ? `. Files with visible text and no translation hook: ${r.noHookFiles.map((f) => `\`${short(f)}\``).join(', ')}` : ''} |\n`;
  md += `| RTL status | ${rtl(r)}${r.rtl.spaceX ? `; ${r.rtl.spaceX} \`space-x-*\` (${r.rtl.spaceXReverse} reversed for RTL)` : ''}. Not yet checked in a browser. |\n`;
  md += `| Dates and numbers | ${r.dateFmt ? `${r.dateFmt} \`toLocale*String\` call(s); ${r.dateFmtLocaleAware} use the active language` : 'No date/number formatting calls found'} |\n`;
  md += `| Dependencies (APIs) | ${r.apis.length ? r.apis.map((a) => `\`${a}\``).join(', ') : 'None found'} |\n`;
  md += `| Risk | ${risk(r)} |\n`;
  md += `| Verification required | Arabic and English render; every button, filter, form and dialog still works; toasts and validation messages in Arabic; desktop and mobile width; refresh and navigation keep the language |\n`;
  md += `| Verification state | Inventoried (static): yes · Full string list: no · Translated: no · Browser-tested: no · Interactions tested: no |\n\n`;
  if (r.samples.length) {
    const seen = new Set(); const pick = [];
    for (const s of r.samples) { const k = s.text.toLowerCase(); if (!seen.has(k) && s.text.length > 2) { seen.add(k); pick.push(s); } if (pick.length >= 14) break; }
    md += `Representative hardcoded strings (a sample, not the full list):\n\n`;
    for (const s of pick) md += `- "${esc(s.text)}" — ${s.kind}, \`${short(s.file).split('/').slice(-2).join('/')}\`\n`;
    md += `\n`;
  }
}

// ---------- every other section: compact table ----------
md += `## All other sections\n\n`;
md += `Compact form. Each route gets the same detailed block as the Students routes above when its module's phase begins — a full string-by-string inventory is the first step of each route, not something to guess at in advance.\n\n`;
for (const g of ordered) {
  const rs = groups.get(g).filter((r) => !isStudents(r));
  if (!rs.length) continue;
  md += `### ${g}\n\n`;
  md += `| Route | Sidebar location | Status (static) | Translated calls | Hardcoded (est.) | Child components | RTL | Risk | Browser-tested |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of rs) {
    md += `| \`${r.route}\` | ${r.sidebar ? esc(r.sidebar.split(' › ').slice(1).join(' › ') || r.sidebar) : '—'} | ${STATUS[r.status]}${r.legacyFiles.length ? ' ⚠ legacy helper' : ''} | ${r.tCalls} | ${r.hard} | ${r.components.length} | ${rtl(r)} | ${risk(r)} | No |\n`;
  }
  md += `\n`;
}
md += `⚠ legacy helper = the route renders a component that imports \`t\` from \`@/lib/i18n\` or \`next-i18next\`; those calls never produce Arabic (architecture audit, finding F2).\n\n`;

// ---------- shared components ----------
md += `## Shared components (used by 3 or more routes)\n\n`;
md += `Fixing one of these changes every route that uses it, so each must be re-tested across its routes.\n\n`;
md += `| Component | Routes using it | Hardcoded (est.) | Translated calls | Translation hook |\n|---|---|---|---|---|\n`;
for (const s of d.shared.filter((x) => !/I18nProvider/.test(x.file)).slice(0, 40)) {
  md += `| \`${short(s.file)}\` | ${s.routes} | ${s.hard} | ${s.tCalls} | ${s.useI18n ? '`useI18n`' : s.legacyT ? 'legacy `@/lib/i18n` (broken)' : s.nextI18next ? '`next-i18next` (not initialised)' : 'none'} |\n`;
}
md += `\n## Verification log\n\n`;
md += `_Empty. Add one entry per route as it is completed: date, translation keys added or changed, files changed, tests run and their results, what was checked in the browser (Arabic and English, desktop and mobile), interactions exercised, and any known limitation._\n`;
fs.writeFileSync(OUT, md);
console.log('written', OUT, md.length, 'chars', md.split('\n').length, 'lines');
