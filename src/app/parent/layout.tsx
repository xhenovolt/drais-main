import React from 'react';

/**
 * Parent portal (Track A) shell — mobile-first, fully separate from staff
 * chrome. The root layout excludes /parent from MainLayout, so this is the
 * only wrapper parents see.
 */
export default function ParentLayout({ children }: { children: React.ReactNode }) {
  // No width clamp here — each page picks its own responsive max-width so the
  // dashboard/detail can use the full screen on laptop while staying tidy on phones.
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">{children}</div>
  );
}
