#!/usr/bin/env node
/**
 * RBAC catalog lint (R5).
 *
 *   npm run lint:permissions
 *
 * Scans every .ts / .tsx file under src/ for permission-string literals
 * referenced through the centralised authorization helpers:
 *
 *   requirePermission(_, _, '<code>')
 *   userCan(_, _, '<code>')
 *   authorize(session, '<code>')
 *   requireAuthorize(session, '<code>')
 *   checkAuthorize(session, '<code>')
 *   checkPermission(_, _, '<code>')
 *
 * Validates each found code against the catalog in src/lib/rbac/catalog.ts.
 *
 * Exit codes:
 *   0  — every referenced code is declared in the catalog
 *   1  — at least one unknown code (typo or undeclared) — CI must fail
 *
 * Side report (informational, never fails the build):
 *   * Catalog codes that no route references — candidates for deprecation
 *
 * No external deps. Runs in pure Node.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), 'src');
const CATALOG_FILE = path.resolve(process.cwd(), 'src/lib/rbac/catalog.ts');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Load catalog
// ─────────────────────────────────────────────────────────────────────────────
function loadCatalog() {
  const src = fs.readFileSync(CATALOG_FILE, 'utf8');
  const codes = new Set();

  // Main p('module','resource','action',...) entries
  const mainBlock = src.match(/const ENTRIES[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (mainBlock) {
    const re = /p\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(mainBlock[1])) !== null) {
      codes.add(`${m[1]}.${m[2]}.${m[3]}`);
    }
  }

  // Legacy entries — ['code', { … }]
  const legacyBlock = src.match(/const LEGACY_ENTRIES[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (legacyBlock) {
    const re = /\[\s*'([^']+)'\s*,/g;
    let m;
    while ((m = re.exec(legacyBlock[1])) !== null) {
      codes.add(m[1]);
    }
  }

  return codes;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Walk src/ for .ts/.tsx files
// ─────────────────────────────────────────────────────────────────────────────
// Directories whose permission strings are ILLUSTRATIVE, not call sites.
// src/app/control/docs is the engineering knowledge base — its code samples
// contain requirePermission('…') inside teaching examples, which the naive
// scanner would otherwise report as uncatalogued permissions forever.
const SKIP_DIRS = new Set(['node_modules', 'docs']);

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith('.')) continue;
      // Only skip `docs` under src/app/control — never a real `docs` elsewhere.
      if (e.name === 'node_modules') continue;
      if (e.name === 'docs' && full.replace(/\\/g, '/').endsWith('src/app/control/docs')) continue;
      yield* walk(full);
    } else if (e.isFile() && /\.(ts|tsx)$/.test(e.name)) {
      yield full;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Scan for permission code usages
// ─────────────────────────────────────────────────────────────────────────────
//
// Patterns we recognise:
//   requirePermission(  …  ,  …  , 'code'  …)
//   userCan(  …  ,  …  , 'code'  …)
//   authorize(  …  , 'code'  …)
//   requireAuthorize(  …  , 'code'  …)
//   checkAuthorize(  …  , 'code'  …)
//   checkPermission(  …  ,  …  , 'code'  …)
//
// We extract the FIRST string literal whose position matches the expected
// arg slot. The regexes are intentionally permissive — false positives are
// harmless (they just need to be in the catalog too).
//
const HELPER_RE = /\b(requirePermission|userCan|checkPermission|authorize|requireAuthorize|checkAuthorize)\s*\(/g;

function findReferences(content, file) {
  const refs = [];
  let m;
  while ((m = HELPER_RE.exec(content)) !== null) {
    const helper = m[1];
    const start = m.index + m[0].length;
    // Naive arg-list scan: walk forward to closing paren, balanced.
    let i = start;
    let depth = 1;
    const args = [];
    let current = '';
    while (i < content.length && depth > 0) {
      const ch = content[i];
      if (ch === '(' ) depth++;
      else if (ch === ')') { depth--; if (depth === 0) { args.push(current); break; } }
      else if (ch === ',' && depth === 1) { args.push(current); current = ''; i++; continue; }
      current += ch;
      i++;
    }
    // Determine which arg holds the code.
    //   authorize/requireAuthorize/checkAuthorize → arg index 1 (second)
    //   requirePermission/userCan/checkPermission → arg index 2 (third)
    const idx = (helper === 'authorize' || helper === 'requireAuthorize' || helper === 'checkAuthorize') ? 1 : 2;
    const argRaw = args[idx];
    if (!argRaw) continue;
    // Skip args that are clearly computed (function calls, identifiers,
    // template literals). Only flag bare string literals — anything else
    // we can't validate statically without a real TS parser.
    const trimmed = argRaw.trim();
    const isStringLiteral = /^(['"])[a-z_][a-z0-9_.*]*\1$/.test(trimmed);
    if (!isStringLiteral) continue;
    const code = trimmed.slice(1, -1);

    // Line number for error message
    const before = content.slice(0, m.index);
    const line = before.split('\n').length;

    refs.push({ code, helper, file, line });
  }
  return refs;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Run
// ─────────────────────────────────────────────────────────────────────────────
const catalog = loadCatalog();
const allRefs = [];
for (const file of walk(ROOT)) {
  // Skip the catalog itself so its own example strings aren't flagged
  if (path.resolve(file) === CATALOG_FILE) continue;
  const content = fs.readFileSync(file, 'utf8');
  allRefs.push(...findReferences(content, file));
}

const unknown = allRefs.filter(r => !catalog.has(r.code) && r.code !== '*');
const used = new Set(allRefs.map(r => r.code));
const unused = [...catalog].filter(c => !used.has(c) && !c.endsWith('.*') && c !== '*').sort();

console.log(`Catalog codes:           ${catalog.size}`);
console.log(`Permission references:   ${allRefs.length}`);
console.log(`Distinct codes used:     ${used.size}`);
console.log(`Catalog codes unused:    ${unused.length}  (informational; not a failure)`);
console.log(``);

if (unknown.length === 0) {
  console.log(`\x1b[32m✔ All referenced permission codes are declared in the catalog.\x1b[0m`);
  process.exit(0);
} else {
  console.error(`\x1b[31m✘ ${unknown.length} reference(s) to permission codes NOT in the catalog:\x1b[0m`);
  for (const r of unknown) {
    const rel = path.relative(process.cwd(), r.file);
    console.error(`  ${rel}:${r.line}  ${r.helper}('${r.code}')`);
  }
  console.error(``);
  console.error(`Fix: add the code to src/lib/rbac/catalog.ts (preferred — module.resource.action)`);
  console.error(`     or to LEGACY_ENTRIES if it's a short two-segment compat code.`);
  process.exit(1);
}
