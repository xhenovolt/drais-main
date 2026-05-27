"use client";
/**
 * DRAIS Global Command Search (⌘K / Ctrl+K).
 *
 * One instance mounts in the Navbar. Opens via the keyboard shortcut or the
 * custom window event 'drais:open-search' (dispatched by the trigger button,
 * desktop + mobile). Keyboard-first: ↑/↓ to move, Enter to open, Esc to close.
 * Debounced calls to /api/search/v2 (RBAC + tenant scoped server-side).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  Search, Loader, User, Briefcase, School, BookOpen,
  FileText, CreditCard, MessageSquare, BarChart3, CornerDownLeft, Clock,
} from 'lucide-react';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  User, Briefcase, School, BookOpen, FileText, CreditCard, MessageSquare, BarChart3,
};

interface Item { id: number; title: string; subtitle: string | null; url_path: string | null; metadata: any }
interface Group { type: string; label: string; icon: string; items: Item[] }

const RECENT_KEY = 'drais:recent-searches';

function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function pushRecent(q: string) {
  if (!q.trim()) return;
  try {
    const cur = loadRecent().filter(x => x !== q);
    localStorage.setItem(RECENT_KEY, JSON.stringify([q, ...cur].slice(0, 6)));
  } catch { /* ignore */ }
}

export const CommandPalette: React.FC = () => {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  // Flatten groups → a single ordered list for keyboard navigation.
  const flat: Item[] = groups.flatMap(g => g.items);

  const close = useCallback(() => { setOpen(false); setQ(''); setGroups([]); setActiveIdx(0); }, []);

  // Open via shortcut + custom event
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('drais:open-search', onOpen as EventListener);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('drais:open-search', onOpen as EventListener);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setRecent(loadRecent());
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (!q.trim()) { setGroups([]); setActiveIdx(0); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/v2?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setGroups(Array.isArray(data?.groups) ? data.groups : []);
        setActiveIdx(0);
      } catch { setGroups([]); }
      finally { setLoading(false); }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = useCallback((item: Item) => {
    pushRecent(q);
    if (item.url_path) router.push(item.url_path);
    close();
  }, [q, router, close]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && flat[activeIdx]) { e.preventDefault(); go(flat[activeIdx]); }
  };

  if (!mounted || !open) return null;

  let runningIdx = -1;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 backdrop-blur-sm pt-[10vh] px-4"
      onMouseDown={close}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-800">
          <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search learners, staff, classes, subjects…"
            className="flex-1 bg-transparent outline-none text-[15px] text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
          {loading && <Loader className="w-4 h-4 text-gray-400 animate-spin" />}
          <kbd className="hidden sm:block text-[10px] font-medium text-gray-400 border border-gray-200 dark:border-slate-700 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {/* Recent (empty query) */}
          {!q.trim() && recent.length > 0 && (
            <div className="px-2">
              <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Recent</div>
              {recent.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setQ(r)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-slate-800"
                >
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-200">{r}</span>
                </button>
              ))}
            </div>
          )}

          {!q.trim() && recent.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-gray-400">
              Search across learners, staff, classes and subjects.
            </div>
          )}

          {q.trim() && !loading && flat.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-gray-400">No results for “{q}”.</div>
          )}

          {groups.map(group => {
            const Icon = ICONS[group.icon] ?? Search;
            return (
              <div key={group.type} className="px-2">
                <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{group.label}</div>
                {group.items.map(item => {
                  runningIdx++;
                  const isActive = runningIdx === activeIdx;
                  return (
                    <button
                      key={`${group.type}-${item.id}`}
                      onClick={() => go(item)}
                      onMouseEnter={() => setActiveIdx(flat.indexOf(item))}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                        isActive ? 'bg-[var(--color-primary)]/10' : 'hover:bg-gray-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.title}</div>
                        {item.subtitle && <div className="text-xs text-gray-500 truncate">{item.subtitle}</div>}
                      </div>
                      {isActive && <CornerDownLeft className="w-3.5 h-3.5 text-gray-400" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CommandPalette;
