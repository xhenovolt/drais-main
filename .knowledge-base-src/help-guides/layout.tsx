/**
 * Route-segment config for the school-facing help guides.
 *
 * Same reasoning as src/app/control/docs/layout.tsx: ten guide routes of large
 * static JSX that Next.js would otherwise prerender at build time, on a build
 * that is already at its heap ceiling. They sit behind the school session, so
 * static generation buys nothing.
 *
 * Server component deliberately — route-segment config is ignored in a client
 * component, and every guide below is 'use client'.
 */
export const dynamic = 'force-dynamic';

export default function HelpGuidesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
