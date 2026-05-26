import Link from 'next/link';
import { History } from 'lucide-react';
import { SubjectAllocationsManager } from '@/components/academics/SubjectAllocationsManager';

export default function SubjectAllocationsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teacher Subject Allocation</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Assign teachers to subjects per class. This is the source of truth for report card initials.
          </p>
        </div>
        <Link
          href="/academics/allocations/history"
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <History className="w-3.5 h-3.5" /> View History
        </Link>
      </div>
      <SubjectAllocationsManager />
    </div>
  );
}
