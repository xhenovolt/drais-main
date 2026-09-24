/**
 * Android-only fix for a confirmed runtime incompatibility:
 *
 *   SyntaxError: Invalid regular expression:
 *   /[$_\p{ID_Start}][$‌‍\p{ID_Continue}]* (end of pattern):
 *   Invalid property name in character class
 *
 * ROOT CAUSE (confirmed by direct binary inspection, not assumed): the
 * embedded Node 18.20.4 runtime shipped by nodejs-mobile-react-native
 * (node_modules/nodejs-mobile-react-native/android/libnode/bin/<abi>/libnode.so)
 * was compiled with ICU support entirely disabled. `strings` on the 62MB
 * binary finds ZERO icu-related symbols anywhere (no icudt tables, no
 * U_ICU_VERSION, no locale strings) — this is a `--without-intl` Node
 * build, not merely `small-icu`. V8's regex engine gates Unicode property
 * escapes (`\p{...}`/`\P{...}` inside a `u`-flagged regex literal) behind
 * ICU at compile time (`v8_enable_i18n_support`); without it ANY such
 * literal throws this exact SyntaxError at parse time, unconditionally —
 * confirmed by the crash log's own self-test (`icu-regex — FAIL`,
 * `icu-intl — ABSENT`) failing on the simplest possible pattern, /\p{L}/.
 * This is a property of the RUNTIME BINARY, not of DRAIS's own code, the
 * installed Next.js version, or a "wrong" dependency — it affects any
 * bundled JS (Next's own compiled dependencies included) that happens to
 * use this modern-but-common regex idiom, regardless of who wrote it.
 *
 * FIX: rewrite the `\p{...}`/`\P{...}` regex literals into their
 * equivalent explicit Unicode code-point ranges (the same transform
 * Babel itself applies via `@babel/plugin-transform-unicode-property-regex`
 * — built on regexpu-core, the standard, battle-tested tool for exactly
 * this "target an engine without Unicode property escape support" case).
 * The rewritten regex is semantically identical but has zero ICU
 * dependency — it's just explicit \u{...} ranges baked into the pattern.
 *
 * SCOPE: Android-only. Applied to mobile/nodejs-project/ (the mirrored
 * copy build-mobile.mjs stages for the embedded runtime) AFTER the mirror
 * step, so it never touches .next/standalone itself — Electron and Vercel
 * both run on a normal, full-ICU Node.js and don't need this at all;
 * patching their tree too would just be unnecessary extra work.
 *
 * Every `.js`/`.cjs` file actually present in the mirrored tree was
 * scanned for `\p{`/`\P{` (see the accompanying audit) — 7 files matched,
 * all inside next/dist (compiled zod / zod-validation-error, edge-runtime
 * primitives, next-devtools, a build-time css-loader helper, and
 * launch-editor.js). Patching all of them rather than only the one seen
 * crashing so far — per the investigation mandate, fixing the first
 * reported exception does not prove nothing else on the startup path
 * hits the same wall.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { transformSync, transformFromAstSync, traverse, types as t } from '@babel/core';
import unicodePropertyRegexPlugin from '@babel/plugin-transform-unicode-property-regex';

/**
 * @babel/plugin-transform-unicode-property-regex only rewrites actual
 * RegExpLiteral AST nodes (/pattern/flags) — by design, it can't safely
 * touch `new RegExp("...", "u")` built from a runtime string, since that
 * string could come from anywhere. But when the string IS a plain,
 * non-interpolated literal (as it is in every case found in this tree —
 * e.g. edge-runtime's `new RegExp("[$_\\p{ID_Start}]", "u")"), it throws
 * the exact same SyntaxError the moment that line actually executes,
 * just later than a literal would (parse time vs. call time) — so it's
 * the same bug, just a delayed fuse instead of an immediate one.
 *
 * Rather than hand-tune regexpu-core's low-level options (real risk of a
 * subtle correctness bug in parsing-sensitive code like zod/edge-runtime
 * if gotten wrong), this reuses the exact already-verified-correct code
 * path: wrap the string pattern as a temporary REAL regex literal, run
 * it through the same Babel plugin, and lift the transformed pattern back
 * out as a string.
 */
function transformStringPattern(pattern, flags) {
  const literalSource = `(/${pattern}/${flags})`;
  const out = transformSync(literalSource, {
    babelrc: false,
    configFile: false,
    compact: true,
    plugins: [unicodePropertyRegexPlugin],
  });
  // out.code is like "/[$_ranges...]/u;\n" — strip the wrapping delimiters
  // and flags back off to recover just the pattern text.
  const match = /^\/(.*)\/([a-z]*);?\s*$/s.exec(out.code.trim());
  if (!match) {
    throw new Error(`transformStringPattern: unexpected Babel output for pattern ${JSON.stringify(pattern)}: ${out.code}`);
  }
  return match[1];
}

const SKIP_DIRS = new Set(['.bin', '.cache']);

async function collectJsFiles(dir, out = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectJsFiles(full, out);
    } else if (/\.(js|cjs|mjs)$/.test(entry.name) && !entry.name.endsWith('.map')) {
      out.push(full);
    }
  }
  return out;
}

async function patchFile(file) {
  // DRAIS's own hand-written nodejs-mobile entrypoint. Its only \p{ is an
  // intentional startup self-test (`new RegExp('\\p{L}', 'u')`) that must
  // keep reporting this runtime's real ICU capability accurately, and it
  // has no regex literal needing a rewrite — but running it through Babel
  // anyway would still reformat it and strip its documentation comments
  // for zero benefit. Skip it outright.
  if (path.basename(file) === 'main.js' && !file.includes(`${path.sep}node_modules${path.sep}`)) return false;

  const original = await fs.readFile(file, 'utf8');
  // Cheap pre-filter — only files that could possibly contain the pattern
  // are worth the cost of a full Babel parse.
  if (!original.includes('\\p{') && !original.includes('\\P{')) return false;

  // The tree mixes real CommonJS bundles (which use a bare top-level
  // `return` — only valid because Node wraps CJS files in a function;
  // Babel needs sourceType:'commonjs' to tolerate that) with genuine ESM
  // output (e.g. puppeteer-core's lib/esm/**, which uses top-level
  // `export`) — 'unambiguous' can't have it both ways (it still rejects
  // the CJS top-level return). Try 'commonjs' first since it's the
  // common case in this tree; fall back to 'module' only on a parse
  // error, rather than pre-guessing from the file path.
  const baseOptions = {
    filename: file,
    babelrc: false,
    configFile: false,
    compact: false,
    comments: false,
    sourceMaps: false,
    // Don't inject any runtime helpers — Unicode-property-regex is a
    // pure syntax-level rewrite (regexpu-core expands the pattern in
    // place), no polyfill/helper code is needed.
    plugins: [unicodePropertyRegexPlugin],
    ast: true, // needed for the post-transform RegExpLiteral safety check below
  };
  let result;
  try {
    result = transformSync(original, { ...baseOptions, sourceType: 'commonjs' });
  } catch (commonjsErr) {
    try {
      result = transformSync(original, { ...baseOptions, sourceType: 'module' });
    } catch {
      // Report the ORIGINAL (commonjs) error — it's the more likely
      // sourceType for this tree, so its message is more actionable.
      console.error(`[patch-unicode-regex-android] FAILED to parse/transform ${file}: ${commonjsErr.message}`);
      throw commonjsErr;
    }
  }

  if (!result?.code) {
    throw new Error(`[patch-unicode-regex-android] Babel produced no output for ${file}`);
  }
  // Check the AST specifically for RegExpLiteral nodes — NOT a raw text
  // search. A string like "new RegExp('\\p{L}', 'u')" (main.js's own
  // startup self-test, by design) legitimately still contains "\p{" after
  // transform: it's a StringLiteral, not a RegExpLiteral, so Babel
  // correctly leaves it untouched, and it isn't a parse-time crash risk —
  // only an actual regex LITERAL containing \p{}/\P{} would still throw
  // SyntaxError on this runtime.
  const survivingLiterals = [];
  traverse(result.ast, {
    RegExpLiteral(path) {
      if (path.node.pattern.includes('\\p{') || path.node.pattern.includes('\\P{')) {
        survivingLiterals.push(`/${path.node.pattern}/${path.node.flags}`);
      }
    },
  });
  if (survivingLiterals.length > 0) {
    throw new Error(
      `[patch-unicode-regex-android] ${file} still has regex LITERAL(s) with \\p{}/\\P{} ` +
      `after transform: ${survivingLiterals.join(', ')} — the plugin didn't rewrite every ` +
      `occurrence. This file needs manual review, not a silent pass-through.`,
    );
  }

  // Second pass: `new RegExp("...\p{...}...", flags)` / `RegExp(...)` built
  // from a PLAIN string literal (no interpolation, no runtime-built
  // pattern — those aren't statically transformable and are left alone,
  // same as Babel's own literal-only scope). DRAIS's own main.js has
  // exactly one such call, and it's an intentional startup self-test for
  // this runtime's ICU capability — transforming it away would make the
  // diagnostic silently report "ok" even though the underlying engine
  // limitation is still real. Skip that file's runtime self-test entirely
  // rather than special-case around it.
  const isDraisOwnMainJs = path.basename(file) === 'main.js' && !file.includes(`${path.sep}node_modules${path.sep}`);
  let mutated = false;
  if (!isDraisOwnMainJs) {
    traverse(result.ast, {
      NewExpression(nodePath) { maybeRewriteRegExpCall(nodePath); },
      CallExpression(nodePath) { maybeRewriteRegExpCall(nodePath); },
    });
  }
  function maybeRewriteRegExpCall(nodePath) {
    const { node } = nodePath;
    if (!t.isIdentifier(node.callee, { name: 'RegExp' })) return;
    const [patternArg, flagsArg] = node.arguments;
    if (!t.isStringLiteral(patternArg)) return; // not a plain literal — not statically transformable
    if (!patternArg.value.includes('\\p{') && !patternArg.value.includes('\\P{')) return;
    const flags = t.isStringLiteral(flagsArg) ? flagsArg.value : '';
    if (!flags.includes('u')) return; // \p{} isn't even valid without the u flag; nothing to do
    const newPattern = transformStringPattern(patternArg.value, flags);
    patternArg.value = newPattern;
    mutated = true;
  }

  let finalCode = result.code;
  if (mutated) {
    const regenerated = transformFromAstSync(result.ast, original, {
      babelrc: false,
      configFile: false,
      compact: false,
      comments: false,
      cloneInputAst: false,
      ast: true,
    });
    if (!regenerated?.code) {
      throw new Error(`[patch-unicode-regex-android] failed to regenerate ${file} after string-pattern rewrite`);
    }
    finalCode = regenerated.code;
    // Same safety net as the RegExpLiteral check above, but for the
    // string-argument form: re-walk for any RegExp(...) call whose
    // u-flagged string pattern still contains \p{}/\P{} — would mean this
    // specific rewrite silently missed something.
    const survivingStringPatterns = [];
    traverse(regenerated.ast ?? result.ast, {
      NewExpression(p) { checkSurvivingCall(p); },
      CallExpression(p) { checkSurvivingCall(p); },
    });
    function checkSurvivingCall(nodePath) {
      const { node } = nodePath;
      if (!t.isIdentifier(node.callee, { name: 'RegExp' })) return;
      const [patternArg, flagsArg] = node.arguments;
      if (!t.isStringLiteral(patternArg)) return;
      const flags = t.isStringLiteral(flagsArg) ? flagsArg.value : '';
      if (!flags.includes('u')) return;
      if (patternArg.value.includes('\\p{') || patternArg.value.includes('\\P{')) {
        survivingStringPatterns.push(patternArg.value);
      }
    }
    if (survivingStringPatterns.length > 0) {
      throw new Error(
        `[patch-unicode-regex-android] ${file} still has RegExp() string pattern(s) with ` +
        `\\p{}/\\P{} after transform: ${survivingStringPatterns.join(', ')} — manual review needed.`,
      );
    }
  }

  if (finalCode !== original) {
    await fs.writeFile(file, finalCode, 'utf8');
    return true;
  }
  return false;
}

export async function patchUnicodeRegexForAndroid(rootDir) {
  const files = await collectJsFiles(rootDir);
  const candidates = files.filter(() => true); // patchFile does its own cheap pre-filter
  let patched = 0;
  const patchedFiles = [];
  for (const file of candidates) {
    if (await patchFile(file)) {
      patched++;
      patchedFiles.push(path.relative(rootDir, file));
    }
  }
  return { scanned: files.length, patched, patchedFiles };
}

// Allow running standalone: node scripts/patch-unicode-regex-android.mjs <dir>
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/') || process.argv[1]?.endsWith('patch-unicode-regex-android.mjs')) {
  const target = process.argv[2] || path.join(process.cwd(), 'mobile', 'nodejs-project');
  const { scanned, patched, patchedFiles } = await patchUnicodeRegexForAndroid(target);
  console.log(`✔ Unicode-property-regex Android patch: scanned ${scanned} JS files, patched ${patched}.`);
  for (const f of patchedFiles) console.log(`   - ${f}`);
  if (patched === 0) {
    console.warn('  (0 patched — either already patched, or no \\p{}/\\P{} literals found. If this is unexpected, re-check the target directory.)');
  }
}
