/**
 * DRAIS Knowledge System — document registry.
 *
 * Single source of truth for the engineering knowledge base: navigation,
 * search, cross-links and prev/next all read from here. Adding a page means
 * adding an entry plus the route — nothing else to wire up.
 *
 * `keywords` drives search. Put in the words a developer would actually type
 * when they do not yet know the vocabulary: table names, hook names, error
 * strings, the symptom they are chasing. Search matches title, blurb, section,
 * topics and keywords.
 *
 * SCOPE: this is Xhenvolt-internal developer documentation, gated by the
 * Control Center session. School-facing how-tos live at /help/guides; public
 * product docs live on the marketing site. Never surface schema, invariants,
 * credentials or operational limits on those.
 */

export interface DocMeta {
  slug: string;
  title: string;
  blurb: string;
  section: string;
  /** Short labels shown as chips. Broad subject areas. */
  topics: string[];
  /** Search-only terms. Symptoms, identifiers, table and function names. */
  keywords: string[];
  /** Roughly how long to read. Used to set expectations, not to gamify. */
  minutes: number;
}

export const SECTION_ORDER = [
  'Foundations',
  'Frontend',
  'Backend & Data',
  'Modules',
  'Boundaries',
  'Interfaces',
  'Playbooks',
] as const;

export const DOCS: DocMeta[] = [
  // ── Foundations ────────────────────────────────────────────────────────────
  {
    slug: 'system-map',
    section: 'Foundations',
    title: 'System map',
    blurb: 'What actually exists: measured inventory of routes, modules, tables and the shape of the codebase.',
    topics: ['inventory', 'orientation'],
    keywords: ['size', 'how big', 'loc', 'lines of code', 'how many routes', 'file count', 'where do i start', 'onboarding', 'audit', 'scale'],
    minutes: 9,
  },
  {
    slug: 'architecture',
    section: 'Foundations',
    title: 'Architecture overview',
    blurb: 'What DRAIS is, how the pieces fit, and the external constraints that shaped every one of them.',
    topics: ['architecture', 'constraints'],
    keywords: ['serverless', 'vercel', 'cron', 'build memory', 'heap', 'multi-tenant', 'tenancy', 'electron', 'capacitor', 'overview', 'first principles'],
    minutes: 11,
  },
  {
    slug: 'decisions',
    section: 'Foundations',
    title: 'Architecture decisions',
    blurb: 'The ADRs. Implementation can be read from code; intent cannot.',
    topics: ['adr', 'rationale'],
    keywords: ['adr', 'why', 'decision record', 'rejected', 'trade-off', 'alternatives', 'rationale', 'immutable', 'snapshot', 'freeze'],
    minutes: 10,
  },

  // ── Frontend ───────────────────────────────────────────────────────────────
  {
    slug: 'frontend',
    section: 'Frontend',
    title: 'Frontend architecture',
    blurb: 'The provider tree, who owns which state, how a page gets its data, and the shell that wraps it.',
    topics: ['react', 'state', 'providers'],
    keywords: ['provider', 'context', 'authcontext', 'termcontext', 'swr', 'react-query', 'tanstack', 'zustand', 'state management', 'client component', 'use client', 'layout', 'shell', 'sidebar', 'navbar', 'hydration', 'caching'],
    minutes: 12,
  },
  {
    slug: 'hooks',
    section: 'Frontend',
    title: 'Hooks',
    blurb: 'Every custom hook: the business reason it exists, what owns its state, and how to misuse it.',
    topics: ['hooks', 'state'],
    keywords: ['useschoolconfig', 'useenabledmodules', 'usecurrency', 'usestudents', 'usenotifications', 'usefeatureflags', 'usethemestore', 'usesocket', 'usefingerprint', 'usewebauthn', 'usepagination', 'useexport', 'usepagetitle', 'custom hook'],
    minutes: 11,
  },

  {
    slug: 'components',
    section: 'Frontend',
    title: 'Components & the design system',
    blurb: 'What is actually shared, what is bespoke, and the honest state of components/ui.',
    topics: ['components', 'ui'],
    keywords: ['design system', 'button', 'modal', 'table', 'pagination', 'toast', 'badge', 'input', 'primitives', 'shared component', 'reusable', 'when to extract', 'components/ui', 'duplicate'],
    minutes: 10,
  },

  {
    slug: 'theming',
    section: 'Frontend',
    title: 'Theming & colour',
    blurb: 'Where every colour actually lives, the three-layer cascade, and why hardcoding a hex breaks four features at once.',
    topics: ['theme', 'colour', 'dark mode'],
    keywords: ['color', 'colour', 'colors', 'colours', 'coloring', 'colouring', 'theme', 'theme.tsx', 'themeprovider.tsx', 'why', 'dark mode', 'darkmode', 'light mode', 'globals.css', 'themeprovider', 'schoolthemeapplier', 'usethemestore', 'token', 'design token', 'css variable', 'var(--primary)', 'tailwind v4', 'custom variant', 'branding', 'brand color', 'glass', 'hex', 'palette', 'font scale', 'rtl', 'styling', 'css'],
    minutes: 12,
  },
  {
    slug: 'dashboard-anatomy',
    section: 'Frontend',
    title: 'The dashboard, component by component',
    blurb: 'Why the homepage contains what it does, how each block gets its data, and how to add one.',
    topics: ['dashboard', 'components'],
    keywords: ['homepage', 'home page', 'dashboard', 'kpi', 'widget', 'card', 'landing', 'overview', 'intelligence', 'signals', 'device status', 'clock health', 'dynamic import', 'ssr false', 'refreshinterval', 'add a widget'],
    minutes: 12,
  },

  // ── Backend & Data ─────────────────────────────────────────────────────────
  {
    slug: 'request-lifecycle',
    section: 'Backend & Data',
    title: 'Request lifecycles',
    blurb: 'Browser to database and back, traced end to end for the workflows that matter.',
    topics: ['lifecycle', 'data flow'],
    keywords: ['sequence', 'diagram', 'flow', 'middleware', 'route handler', 'admission', 'punch', 'attendance flow', 'report generation', 'end to end', 'how does data move', 'audit log'],
    minutes: 13,
  },
  {
    slug: 'data',
    section: 'Backend & Data',
    title: 'Data & migrations',
    blurb: 'Dual DB mode, the schema rules, soft delete, and the two driver settings that are load-bearing.',
    topics: ['database', 'migrations'],
    keywords: ['tidb', 'mysql', 'migration', 'schema', 'timezone', 'bignumberstrings', 'soft delete', 'deleted_at', 'trash', 'pool', 'connection', 'ensure schema', 'backup', 'school_id'],
    minutes: 12,
  },
  {
    slug: 'schema',
    section: 'Backend & Data',
    title: 'Core tables',
    blurb: 'The tables that carry the business: why each exists, what it relates to, and the queries that hurt.',
    topics: ['database', 'schema'],
    keywords: ['students', 'people', 'person_id', 'enrollments', 'attendance_raw_events', 'attendance_records', 'report_snapshots', 'biometric_enrollments', 'student_ledger', 'fee', 'payment', 'users', 'sessions', 'devices', 'table', 'foreign key', 'index'],
    minutes: 14,
  },

  {
    slug: 'data-flow',
    section: 'Backend & Data',
    title: 'Data end to end: fetch, shape, reshape',
    blurb: 'How a route returns data, how a component receives it, and exactly how to add or restructure your own.',
    topics: ['data', 'api'],
    keywords: ['fetch', 'fetcher', 'apifetch', 'useswr', 'swr key', 'conditional fetch', 'null key', 'envelope', 'success data', 'unwrap', 'response shape', 'add an api', 'restructure', 'mutate', 'revalidate', 'refreshinterval', 'transform', 'normalise', 'normalize'],
    minutes: 14,
  },

  // ── Modules ────────────────────────────────────────────────────────────────
  {
    slug: 'module-attendance',
    section: 'Modules',
    title: 'Attendance',
    blurb: 'From a finger on a sensor to a figure on a report card — the largest module in DRAIS.',
    topics: ['attendance', 'devices'],
    keywords: ['zkteco', 'adms', 'k40', 'punch', 'scan', 'ingestion', 'dedup', 'clock drift', 'raw events', 'register', 'absent', 'late', 'live popup', 'identity', 'fingerprint'],
    minutes: 15,
  },
  {
    slug: 'module-reports',
    section: 'Modules',
    title: 'Reporting & DRCE',
    blurb: 'Snapshots, the composition engine, and why a reprint must reproduce the original byte for byte.',
    topics: ['reports', 'drce'],
    keywords: ['report card', 'drce', 'snapshot', 'template', 'aggregate', 'division', 'grade', 'print', 'pdf', 'puppeteer', 'render', 'overrides', 'comments', 'verify token', 'qr'],
    minutes: 15,
  },
  {
    slug: 'module-finance',
    section: 'Modules',
    title: 'Finance',
    blurb: 'Why every balance is derived, and what that buys when a school is audited.',
    topics: ['finance', 'money'],
    keywords: ['fees', 'payment', 'receipt', 'ledger', 'balance', 'debit', 'credit', 'billing', 'import', 'reconciliation', 'wallet', 'money location', 'budget', 'pocket money', 'defaulters'],
    minutes: 12,
  },
  {
    slug: 'module-students',
    section: 'Modules',
    title: 'Learners',
    blurb: 'The identity spine everything else hangs off, and the lifecycle operations that must not lose history.',
    topics: ['learners', 'lifecycle'],
    keywords: ['student', 'admission', 'admission number', 'enrollment', 'enrolment', 'promotion', 'transfer', 'leaver', 'duplicate', 'merge', 'import', 'bulk', 'id card', 'guardian', 'contact', 'person_id'],
    minutes: 13,
  },
  {
    slug: 'module-tahfiz',
    section: 'Modules',
    title: 'Tahfiz',
    blurb: "Qur'an memorisation tracking — and the religious-accuracy stance that governs its reference data.",
    topics: ['tahfiz', 'islamic'],
    keywords: ['quran', "qur'an", 'memorisation', 'memorization', 'hifz', 'surah', 'ayah', 'juz', 'hizb', 'mushaf', 'yassarna', 'shatibiyyah', 'tajweed', 'portions', 'halaqa', 'arabic', 'module gate'],
    minutes: 11,
  },
  {
    slug: 'module-control',
    section: 'Modules',
    title: 'Control Center',
    blurb: 'The operator console: tenants, billing, health and impersonation — and why it shares no code with the school app.',
    topics: ['control', 'operations'],
    keywords: ['xhenvolt', 'operator', 'tenant', 'provisioning', 'billing', 'invoice', 'subscription', 'dunning', 'impersonation', 'suspend', 'hard delete', 'platform_jobs', 'health', 'totp', 'drais_control'],
    minutes: 13,
  },
  {
    slug: 'module-portal',
    section: 'Modules',
    title: 'Parent portal',
    blurb: 'The isolation gate, evidence versus grant, and the surface that faces families directly.',
    topics: ['parents', 'isolation'],
    keywords: ['guardian', 'parent', 'otp', 'phone', 'link', 'parent_student_links', 'access_uuid', 'learnerAccessId', 'visibility', 'portal', 'isolation gate', 'custody', 'revoke'],
    minutes: 11,
  },

  // ── Boundaries ─────────────────────────────────────────────────────────────
  {
    slug: 'security',
    section: 'Boundaries',
    title: 'Auth & tenancy',
    blurb: 'Three auth domains that share no code, and the one rule every tenant query obeys.',
    topics: ['auth', 'security'],
    keywords: ['session', 'cookie', 'drais_session', 'drais_control', 'parent session', 'rbac', 'permission', 'role', 'module gate', 'isolation', 'school_id', 'impersonation', 'otp', 'scrypt', 'bcrypt', 'redirect loop', 'cannot login'],
    minutes: 13,
  },
  {
    slug: 'subsystems',
    section: 'Boundaries',
    title: 'Subsystem map',
    blurb: 'What lives where under src/lib, and the invariant that governs each folder.',
    topics: ['code map'],
    keywords: ['src/lib', 'folder', 'where is', 'which file', 'readme', 'invariant', 'server twin', 'client bundle'],
    minutes: 9,
  },

  // ── Interfaces ─────────────────────────────────────────────────────────────
  {
    slug: 'platform-api',
    section: 'Interfaces',
    title: 'Platform API v1',
    blurb: 'The frozen external contract: keys, scopes, idempotency, webhooks — and what may never change.',
    topics: ['api', 'integration'],
    keywords: ['jeton', 'bearer', 'api key', 'scope', 'rate limit', 'idempotency', 'webhook', 'contract freeze', 'v1', 'v2', 'external', 'consumer'],
    minutes: 11,
  },
  {
    slug: 'operations',
    section: 'Interfaces',
    title: 'Build & operations',
    blurb: 'Deploy targets, the one-cron ceiling, the build memory ceiling, and destructive operations.',
    topics: ['ops', 'build'],
    keywords: ['deploy', 'vercel', 'build', 'memory', 'heap', 'cron', 'job runner', 'platform_jobs', 'maintenance', 'read only', 'hard delete', 'export', 'monitoring', 'health', 'tests'],
    minutes: 12,
  },

  // ── Playbooks ──────────────────────────────────────────────────────────────
  {
    slug: 'blueprint-students-list',
    section: 'Playbooks',
    title: 'Page blueprint: /students/list',
    blurb: 'The largest page in DRAIS, read end to end — and what it teaches about every list screen.',
    topics: ['blueprint', 'frontend'],
    keywords: ['students list', 'list page', 'table', 'pagination', 'filter', 'search', 'bulk actions', 'export', 'import', 'apifetch', 'inline edit', 'modal', 'archetype', 'largest page'],
    minutes: 13,
  },
  {
    slug: 'playbook-api',
    section: 'Playbooks',
    title: 'Add an API route',
    blurb: 'The full checklist: auth, tenancy, permissions, validation, errors, audit, tests.',
    topics: ['playbook', 'api'],
    keywords: ['new route', 'route.ts', 'post', 'get', 'handler', 'validation', 'zod', 'error handling', 'withroute', 'authorize', 'requirepermission', 'checklist'],
    minutes: 11,
  },
  {
    slug: 'playbook-page',
    section: 'Playbooks',
    title: 'Add a page',
    blurb: 'Routing, the shell, data fetching, permissions, i18n and dark mode — in the order that avoids rework.',
    topics: ['playbook', 'frontend'],
    keywords: ['new page', 'page.tsx', 'sidebar', 'navigation', 'route', 'translation', 'dark mode', 'permission gate', 'loading', 'empty state'],
    minutes: 10,
  },
  {
    slug: 'playbook-module',
    section: 'Playbooks',
    title: 'Add a module or table',
    blurb: 'Migration, tenancy, permissions, module gate, trash registry, backup — the six things that get forgotten.',
    topics: ['playbook', 'database'],
    keywords: ['new table', 'new module', 'migration', 'school_id', 'permission catalog', 'module gate', 'trash descriptor', 'backup discovery', 'seed', 'checklist'],
    minutes: 12,
  },
];

export const DOC_SECTIONS = SECTION_ORDER.filter((s) => DOCS.some((d) => d.section === s));

export function docBySlug(slug: string): DocMeta | undefined {
  return DOCS.find((d) => d.slug === slug);
}

export function docsInSection(section: string): DocMeta[] {
  return DOCS.filter((d) => d.section === section);
}

/** Ordered flat list, used for prev/next. */
export const DOC_ORDER: DocMeta[] = DOC_SECTIONS.flatMap((s) => docsInSection(s));

export function neighbours(slug: string): { prev: DocMeta | null; next: DocMeta | null } {
  const i = DOC_ORDER.findIndex((d) => d.slug === slug);
  return {
    prev: i > 0 ? DOC_ORDER[i - 1] : null,
    next: i >= 0 && i < DOC_ORDER.length - 1 ? DOC_ORDER[i + 1] : null,
  };
}

/**
 * Rank documents against a free-text query.
 *
 * Two-stage, because developers type both keywords AND whole questions:
 *
 *   1. STRICT — every meaningful token must appear. Precise for "cannot login",
 *      "school_id", "new table".
 *   2. LENIENT fallback — if strict yields nothing, rank by how many tokens
 *      matched. This is what rescues "how is data received" and
 *      "why does the homepage have these components", where no stopword list
 *      would ever be complete enough.
 *
 * Symptoms live in `keywords` alongside identifiers, so someone who does not yet
 * know the vocabulary still lands on the right page.
 */
/** Filler words that carry no discriminating signal. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'in', 'on', 'at', 'to', 'of',
  'for', 'and', 'or', 'do', 'does', 'did', 'i', 'my', 'me', 'it', 'its', 'this',
  'that', 'with', 'from', 'can', 'should', 'would', 'about',
]);

export function searchDocs(query: string): DocMeta[] {
  const phrase = query.toLowerCase().trim();
  const raw = phrase.split(/\s+/).filter(Boolean);

  // Drop stopwords, but never drop every token — a query of only stopwords
  // falls back to the raw list rather than matching everything.
  const stripped = raw.filter((t) => !STOPWORDS.has(t));
  const tokens = stripped.length ? stripped : raw;
  if (!tokens.length) return [];

  const scored = DOCS.map((d) => {
    const title = d.title.toLowerCase();
    const blurb = d.blurb.toLowerCase();
    const section = d.section.toLowerCase();
    const topics = d.topics.join(' ').toLowerCase();
    const keywords = d.keywords.join(' ').toLowerCase();
    const keywordList = keywords.split(' ');
    const haystack = `${title} ${blurb} ${section} ${topics} ${keywords}`;

    const matched = tokens.filter((t) => haystack.includes(t));
    if (matched.length === 0) return { d, score: 0, matched: 0 };

    let score = 0;

    // Whole-phrase hit outranks scattered token hits: someone typing
    // "dark mode" wants the theming page, not every page that mentions it.
    if (keywords.includes(phrase)) score += 80;
    if (title.includes(phrase)) score += 120;

    for (const t of matched) {
      if (title === t) score += 100;
      else if (title.startsWith(t)) score += 60;
      else if (title.includes(t)) score += 40;
      if (keywordList.includes(t)) score += 30;
      else if (keywords.includes(t)) score += 18;
      if (topics.includes(t)) score += 12;
      if (blurb.includes(t)) score += 8;
      if (section.includes(t)) score += 5;
    }

    // Reward breadth of coverage, so a doc matching 4 of 5 tokens outranks one
    // matching 1 of 5 that happens to hit a heavily-weighted field.
    score += Math.round((matched.length / tokens.length) * 60);

    return { d, score, matched: matched.length };
  });

  const hits = scored.filter((s) => s.score > 0);

  // Stage 1: strict. Prefer documents matching EVERY token.
  const strict = hits.filter((s) => s.matched === tokens.length);
  const pool = strict.length ? strict : hits;

  return pool
    .sort((a, b) => b.score - a.score || a.d.title.localeCompare(b.d.title))
    .map((s) => s.d);
}
