'use client';

/**
 * WhatsNew — navbar "what's new" menu showing New / Improved / Fixed flags
 * from the feature manifest (GET /api/version/features). A dot shows the
 * count of items the user hasn't seen yet (tracked in localStorage by the
 * newest item's date). Clicking an item navigates to that route.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

interface Flag { route: string; title: string; label: 'New' | 'Improved' | 'Fixed'; since: string; description: string; }

const LABEL_STYLE: Record<string, string> = {
  New:      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  Improved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Fixed:    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};
const SEEN_KEY = 'drais.whatsnew.lastSeen';

function timeAgo(iso: string): string {
  const d = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d)) return '';
  const days = Math.floor((Date.now() - d) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function WhatsNew() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [version, setVersion] = useState('');
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<string>('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setLastSeen(localStorage.getItem(SEEN_KEY) || ''); } catch { /* ignore */ }
    fetch('/api/version/features').then((r) => r.json()).then((d) => {
      if (Array.isArray(d?.flags)) setFlags(d.flags);
      if (d?.version) setVersion(d.version);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const unseen = flags.filter((f) => !lastSeen || f.since > lastSeen).length;

  const markSeen = () => {
    const newest = flags[0]?.since;
    if (newest) { try { localStorage.setItem(SEEN_KEY, newest); } catch { /* ignore */ } setLastSeen(newest); }
  };

  if (flags.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) markSeen(); }}
        title="What's new"
        className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
      >
        <Sparkles className="w-5 h-5" />
        {unseen > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
            {unseen > 9 ? '9+' : unseen}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[70vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 shadow-xl z-50">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">What's new</span>
            <span className="text-[11px] text-gray-400">v{version}</span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {flags.map((f, i) => (
              <Link
                key={`${f.route}-${f.since}-${i}`}
                href={f.route}
                onClick={() => setOpen(false)}
                className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50"
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${LABEL_STYLE[f.label]}`}>{f.label}</span>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{f.title}</span>
                  <span className="ml-auto text-[10px] text-gray-400 whitespace-nowrap">{timeAgo(f.since)}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{f.description}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
