#!/usr/bin/env node
/**
 * DRAIS Sentinel — architecture scanner (build-time).
 *
 * This is Sentinel's ARCHITECTURE AUDITOR data source. It walks the actual
 * repository and writes a versioned manifest that the runtime diagnosis
 * engine (src/lib/sentinel/diagnosis/engine.ts) reads as a bundled JSON
 * import. This split exists for a concrete technical reason, not style:
 * a Next.js serverless function does not reliably have the full repository
 * source tree available for fs.readdir at request time (Vercel's file
 * tracing only ships what's statically imported), so "inspect the
 * repository" has to happen at scan time and be shipped as data, not
 * re-derived per request.
 *
 * That means every architecture/code-structure finding in a Full System
 * Diagnosis is AS OF THIS SCAN (timestamp + commit sha recorded below), not
 * live-per-request. The diagnosis engine says so explicitly rather than
 * implying real-time certainty it doesn't have.
 *
 * Run: node scripts/sentinel/architecture-scan.mjs
 * Wired as: npm run sentinel:scan (package.json)
 *
 * Pure filesystem + git reads. No database connection. Safe to run anywhere,
 * anytime, including in CI.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const out = path.join(repoRoot, 'src', 'lib', 'sentinel', 'generated', 'architecture-manifest.json');

function walk(dir, matcher, results = []) {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.next' || entry === '__tests__') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, matcher, results);
    else if (matcher(entry, full)) results.push(full);
  }
  return results;
}

function walkIncludingTests(dir, matcher, results = []) {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.next') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkIncludingTests(full, matcher, results);
    else if (matcher(entry, full)) results.push(full);
  }
  return results;
}

function readSafe(p) { try { return readFileSync(p, 'utf8'); } catch { return ''; } }

// ── 1. API route inventory ─────────────────────────────────────────────
const apiDir = path.join(repoRoot, 'src', 'app', 'api');
const routeFiles = walk(apiDir, (name) => name === 'route.ts');

// ── 2. Tenant isolation — TWO separate questions, deliberately not blended:
//
//   (a) STRUCTURAL CONSISTENCY — does this file use the formal wrapper
//       (queryTenant/execTenant/withTenantTransaction)? A codebase-hygiene
//       / future-proofing signal: a NEW route can't forget to scope by
//       school_id if the wrapper makes that the only way to query at all.
//
//   (b) VERIFIED COVERAGE — for files that DON'T use the wrapper, is there
//       actual evidence of a manual school_id check derived from the
//       session (not from user input)? This is the real safety signal —
//       DRAIS overwhelmingly isolates tenants this way today, and
//       treating "manual but correct" as equivalent to "no check at all"
//       (the previous version of this scanner) produced a score that
//       looked like a near-total failure when the real gap is narrower:
//       a minority of routes with NO detectable check at all.
//
//   Neither is a proof of correctness — this is static heuristic
//   analysis, same caveat as every other check in this file — but (b) is
//   a materially more honest safety signal than (a) alone, and the two
//   are reported as separate dimensions rather than one blended number.
// Route categories that are legitimately NOT tenant-scoped by design —
// they either run before a school session exists (auth), operate
// deliberately ACROSS every school (platform control-center, superadmin),
// or touch no tenant data at all (cron liveness pings, health checks).
// First-pass live data showed these dominating the "no detected check"
// list — auth/login, control-center/*, cron/*, health — which was
// noise, not signal: flagging "auth/login has no school_id filter" as a
// tenant-isolation gap is a category error, not a finding. Excluded from
// the denominator entirely rather than left to inflate an "undetected"
// count that would otherwise look like 84 real gaps when the true
// number is far smaller.
const NOT_TENANT_SCOPED_BY_DESIGN = [
  /^src\/app\/api\/auth\//,
  /^src\/app\/api\/control-center\//,
  /^src\/app\/api\/control\/route\.ts$/,
  /^src\/app\/api\/cron\//,
  /^src\/app\/api\/health\//,
  /^src\/app\/api\/heartbeat\//,
  // Platform-internal / external-partner API — authenticated by API key
  // (key_id/consumer, see platform_api_audit) or cross-school by design,
  // not by a browser session's school_id at all.
  /^src\/app\/api\/internal\//,
  /^src\/app\/api\/platform\/v1\//,
  // Pre-authentication parent/guardian portal routes — same reasoning as
  // /api/auth: nothing has established which school's data this caller
  // may see yet, that's the whole point of these endpoints.
  /^src\/app\/api\/parent\/auth\//,
  /^src\/app\/api\/portal\/auth\//,
];

let tenantSafeWrapperFiles = 0;
let rawQueryFiles = 0;
let verifiedManualCheckFiles = 0;
let excludedNotTenantScoped = 0;
let noDetectedCheckFiles = [];
for (const f of routeFiles) {
  const rel = path.relative(repoRoot, f).replace(/\\/g, '/');
  if (NOT_TENANT_SCOPED_BY_DESIGN.some((re) => re.test(rel))) { excludedNotTenantScoped++; continue; }

  const src = readSafe(f);
  const usesTenantWrapper = /queryTenant|execTenant|withTenantTransaction/.test(src);
  const usesRawQuery = /from ['"]@\/lib\/db['"]/.test(src) && /\bquery\(/.test(src);
  if (usesTenantWrapper) {
    tenantSafeWrapperFiles++;
    continue;
  }
  if (!usesRawQuery) continue; // no DB access in this route at all — not a tenant-isolation question
  rawQueryFiles++;

  // Session-derived schoolId, actually referenced in a query filter.
  // Doesn't prove EVERY query in the file is scoped — same limitation as
  // every heuristic here — but a file with neither signal at all is a
  // meaningfully different (and rarer) risk than one that clearly does
  // this correctly just not via the wrapper.
  const derivesSchoolIdFromSession = /getSessionSchoolId|session\.schoolId|session!\.schoolId/.test(src);
  const filtersOnSchoolId = /school_id\s*[=:]\s*\?|school_id\s*=\s*session|\.schoolId\s*[,)]/.test(src);
  // The parent/guardian portal scopes by a different, equally legitimate
  // anchor — a learner-access token, or the target student's own row —
  // that itself resolves to one school, not a browser session's
  // school_id (there is no school-admin session in that portal to derive
  // one from). Any file under parent/ or portal/ that references
  // school_id at all is doing this, just not via getSessionSchoolId.
  const isPortalRoute = /^src\/app\/api\/(parent|portal)\//.test(rel);
  const usesLearnerAccessScoping = (isPortalRoute && /school_id/.test(src))
    || (/learnerAccessId|learner_access_id|parent_student_links/.test(src) && /school_id/.test(src));
  if ((derivesSchoolIdFromSession && filtersOnSchoolId) || usesLearnerAccessScoping) {
    verifiedManualCheckFiles++;
  } else {
    noDetectedCheckFiles.push(path.relative(repoRoot, f).replace(/\\/g, '/'));
  }
}

// ── 3. Test inventory ───────────────────────────────────────────────────
const testFiles = [
  ...walkIncludingTests(path.join(repoRoot, 'src'), (name) => /\.test\.(mjs|ts|tsx)$/.test(name)),
  ...walkIncludingTests(path.join(repoRoot, '__tests__'), (name) => /\.test\.(mjs|ts|tsx)$/.test(name)),
];
const testFilesByArea = {};
for (const f of testFiles) {
  const rel = path.relative(repoRoot, f);
  const m = rel.match(/^(?:src\/(?:app\/api|lib)\/([a-zA-Z0-9_-]+))/);
  const area = m ? m[1] : (rel.startsWith('__tests__') ? 'root' : 'other');
  testFilesByArea[area] = (testFilesByArea[area] ?? 0) + 1;
}

// ── 4. CI gate presence ──────────────────────────────────────────────────
const workflowsDir = path.join(repoRoot, '.github', 'workflows');
const ciWorkflows = existsSync(workflowsDir) ? readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f)) : [];
let hasPrOrPushCiGate = false;
for (const f of ciWorkflows) {
  const src = readSafe(path.join(workflowsDir, f));
  const triggersOnPrOrPush = /on:\s*\n(\s|\S)*?(pull_request|push:\s*\n\s*branches)/m.test(src) && !/tags:/.test(src.split('\n').slice(0, 12).join('\n'));
  const runsTestOrTypecheck = /(npm (run )?test|npm run typecheck|tsc\s|npm run lint)/.test(src);
  if (triggersOnPrOrPush && runsTestOrTypecheck) hasPrOrPushCiGate = true;
}

// ── 5. Build config ──────────────────────────────────────────────────────
const nextConfigJs = readSafe(path.join(repoRoot, 'next.config.js'));
const nextConfigTs = readSafe(path.join(repoRoot, 'next.config.ts'));
const nextConfigSrc = nextConfigJs + nextConfigTs;
const nextConfigIgnoresBuildErrors = /ignoreBuildErrors:\s*true/.test(nextConfigSrc);
const nextConfigIgnoresLint = /ignoreDuringBuilds:\s*true/.test(nextConfigSrc);

let tsconfigStrict = null;
try {
  const tsconfigRaw = readSafe(path.join(repoRoot, 'tsconfig.json'));
  const tsconfig = JSON.parse(tsconfigRaw.replace(/\/\/.*$/gm, ''));
  tsconfigStrict = tsconfig?.compilerOptions?.strict === true;
} catch { tsconfigStrict = null; }

// ── 6. Cron reality check ────────────────────────────────────────────────
let vercelCronCount = 0;
try {
  const vercelJson = JSON.parse(readSafe(path.join(repoRoot, 'vercel.json')) || '{}');
  vercelCronCount = Array.isArray(vercelJson.crons) ? vercelJson.crons.length : 0;
} catch { vercelCronCount = 0; }
const cronRouteCount = walk(path.join(apiDir, 'cron'), (name) => name === 'route.ts').length;

// ── 7. Unbounded list endpoints (source-comment heuristic) ───────────────
const unboundedListRoutesDetected = [];
for (const f of routeFiles) {
  const src = readSafe(f);
  if (/NO PAGINATION|REMOVED:\s*pagination/i.test(src)) {
    unboundedListRoutesDetected.push(path.relative(repoRoot, f).replace(/\\/g, '/'));
  }
}

// ── 8. Git commit ────────────────────────────────────────────────────────
let commitSha = null;
try { commitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim(); } catch { commitSha = null; }

const manifest = {
  generatedAt: new Date().toISOString(),
  commitSha,
  repo: {
    apiRouteCount: routeFiles.length,
    excludedNotTenantScoped,
    tenantSafeWrapperFiles,
    rawQueryFiles,
    verifiedManualCheckFiles,
    noDetectedCheckFileCount: noDetectedCheckFiles.length,
    noDetectedCheckFilesSample: noDetectedCheckFiles.slice(0, 30),
    testFileCount: testFiles.length,
    testFilesByArea,
    ciWorkflows,
    hasPrOrPushCiGate,
    nextConfigIgnoresBuildErrors,
    nextConfigIgnoresLint,
    tsconfigStrict,
    vercelCronCount,
    cronRouteCount,
    unboundedListRoutesDetected,
  },
};

writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`[sentinel] architecture manifest written → ${path.relative(repoRoot, out)}`);
console.log(JSON.stringify(manifest, null, 2));
