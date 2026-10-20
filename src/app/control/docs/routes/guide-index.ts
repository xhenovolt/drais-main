/**
 * Hand-written guides attached to a route (target starts with '/') or a source
 * file (target is a repo path). The generated documentation says WHAT a file
 * does; a guide says WHY, what not to change, and how to extend it.
 *
 * Plain data (no JSX) so the server search index can read it. The guide bodies
 * live in ./guides.tsx under the same `target`. src/lib/devdocs/__tests__
 * fails if a target no longer exists in the code, or a body is missing.
 */
export interface GuideMeta {
  target: string;
  title: string;
  keywords: string[];
  /** Commit at which the guide was last checked against the code. */
  verifiedAt: string;
}

export const GUIDE_INDEX: GuideMeta[] = [
  {
    target: '/attendance/settings',
    title: 'Teaching example — a full-featured route, layer by layer',
    keywords: ['teaching example', 'full featured', 'architecture', 'layers', 'tabs', 'form', 'validation', 'server vs client', 'where does code go', 'business rule', 'api call', 'php', 'vanilla javascript', 'analogy'],
    verifiedAt: '82c55490',
  },
  {
    target: '/attendance',
    title: 'Attendance dashboard — where its data comes from',
    keywords: ['attendance data loading', 'live feed', 'eventsource', 'sse', 'useswr', 'dashboard counts', 'where is the data loaded'],
    verifiedAt: '82c55490',
  },
  {
    target: 'src/app/layout.tsx',
    title: 'Root layout — the one layout every school page really inherits',
    keywords: ['root layout', 'providers', 'app shell', 'sidebar', 'authenticatedshell', 'mainlayout', 'protected layout', 'offline safe'],
    verifiedAt: '82c55490',
  },
  {
    target: 'src/app/(protected)/layout.tsx',
    title: 'The (protected) layout protects nothing — read this before relying on it',
    keywords: ['protected layout', 'route group', 'auth', 'redirect login', 'session check'],
    verifiedAt: '82c55490',
  },
  {
    target: '/students/list',
    title: 'Students list — read the blueprint',
    keywords: ['students list', 'largest page', 'blueprint'],
    verifiedAt: '82c55490',
  },
];
