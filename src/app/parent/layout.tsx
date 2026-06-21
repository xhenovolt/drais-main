import React from 'react';

/**
 * Parent portal (Track A) shell — mobile-first, fully separate from staff
 * chrome. The root layout excludes /parent from MainLayout, so this is the
 * only wrapper parents see.
 */
export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-md">{children}</div>
    </div>
  );
}
