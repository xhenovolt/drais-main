'use client';

/**
 * Shown in place of page content — never in place of the Sidebar/Topbar
 * themselves — when the signed-in session is running in local-sqlite mode
 * and the current page isn't one of the Offline Workspace's five modules.
 * Phase 7 sub-effort 27: the user explicitly wants the SAME nav in every
 * DB mode, so this replaces sub-effort 26's approach of hiding the links
 * that don't work. A link still leads here if clicked; it just says so
 * clearly instead of loading a shell that silently never gets its data.
 */
import Link from 'next/link';
import { HardDrive, ArrowLeft } from 'lucide-react';

const OFFLINE_WORKSPACE_LINKS = [
  { href: '/students/offline', label: 'Students' },
  { href: '/staff/offline', label: 'Staff' },
  { href: '/attendance/offline', label: 'Attendance' },
  { href: '/academics/offline', label: 'Academics' },
  { href: '/reports/offline', label: 'Reports' },
];

export function OfflineUnavailableNotice({ pathname }: { pathname: string }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <div className="inline-flex p-3 rounded-full bg-teal-100 dark:bg-teal-900/30 mb-4">
        <HardDrive className="w-6 h-6 text-teal-600 dark:text-teal-400" />
      </div>
      <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        Not available offline yet
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{pathname}</code> needs an online connection.
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Only the five Offline Workspace pages below work with no internet right now.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {OFFLINE_WORKSPACE_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white"
          >
            {l.label}
          </Link>
        ))}
      </div>
      <button
        onClick={() => history.back()}
        className="mt-6 inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Go back
      </button>
    </div>
  );
}
