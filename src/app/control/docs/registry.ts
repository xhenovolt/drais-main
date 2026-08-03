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
 * Deliberately simple and transparent: AND semantics over tokens, weighted by
 * where the token matched. A developer searching "cannot login" should land on
 * Auth & tenancy, so symptoms live in `keywords` alongside identifiers.
 */
export function searchDocs(query: string): DocMeta[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  const scored = DOCS.map((d) => {
    const title = d.title.toLowerCase();
    const blurb = d.blurb.toLowerCase();
    const section = d.section.toLowerCase();
    const topics = d.topics.join(' ').toLowerCase();
    const keywords = d.keywords.join(' ').toLowerCase();
    const haystack = `${title} ${blurb} ${section} ${topics} ${keywords}`;

    // Every token must appear somewhere, or it is not a match.
    if (!tokens.every((t) => haystack.includes(t))) return { d, score: 0 };

    let score = 0;
    for (const t of tokens) {
      if (title === t) score += 100;
      else if (title.startsWith(t)) score += 60;
      else if (title.includes(t)) score += 40;
      if (keywords.split(' ').includes(t)) score += 30;
      else if (keywords.includes(t)) score += 18;
      if (topics.includes(t)) score += 12;
      if (blurb.includes(t)) score += 8;
      if (section.includes(t)) score += 5;
    }
    return { d, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.d.title.localeCompare(b.d.title))
    .map((s) => s.d);
}
