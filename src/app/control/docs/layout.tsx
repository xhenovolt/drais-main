/**
 * Route-segment config for the engineering knowledge base.
 *
 * BUILD MEMORY. This segment holds ~39 documentation routes, each a large
 * static JSX tree. Next.js prerenders every one of them to HTML at build time,
 * and that pass is what pushed an already-ceilinged build over its heap limit
 * (FATAL at --max_old_space_size=2560 on the 8GB/2-core build box).
 *
 * These pages are gated behind the Control Center session, so prerendering buys
 * nothing — no crawler sees them and no anonymous visitor can load them. Marking
 * the segment dynamic keeps them out of the static-generation pass entirely.
 *
 * This is a SERVER component on purpose: route-segment config exports are not
 * honoured from a client component, and every page below is 'use client'.
 *
 * See docs/BUILD_PIPELINE.md and the Build & operations page for why the build
 * working set is structural rather than tunable.
 */
export const dynamic = 'force-dynamic';

export default function ControlDocsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
