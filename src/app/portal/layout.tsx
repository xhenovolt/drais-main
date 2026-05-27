import React from 'react';

/**
 * Parent portal shell — intentionally minimal and SEPARATE from the staff app
 * chrome (no staff sidebar/navbar). The root layout excludes /portal from
 * MainLayout, so this is the only wrapper parents see.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {children}
    </div>
  );
}
