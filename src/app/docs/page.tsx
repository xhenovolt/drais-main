import { redirect } from 'next/navigation';

/**
 * `/docs` previously held a half-built set of platform/architecture pages
 * (overview, authentication, and three links that were never built). They were
 * DEVELOPER documentation reachable by anyone, which is exactly the wrong
 * audience: schools do not need the multi-tenant architecture, and it should
 * not be public.
 *
 * The split is now:
 *   /help/guides   — school-scope how-tos for staff
 *   /control/docs  — developer + architectural docs, Control Center session only
 *   marketing site — public product documentation
 *
 * Kept as a redirect so existing links and bookmarks do not 404.
 */
export default function DocsRedirect() {
  redirect('/help');
}
