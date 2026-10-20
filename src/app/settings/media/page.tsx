'use client';
/**
 * Settings → Media — where this school's images come from on this computer.
 *
 * Image source (cloud / local-first / local-only), the image library with per-image status,
 * "make available offline" (copy cloud images to this machine), a school-managed photo folder
 * matched by admission number / staff number / DRAIS id (never by name), and a ZIP export with a
 * manifest. All decisions are made server-side in src/lib/media; this page only drives them.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, HardDrive, Cloud, Download, FolderOpen, RefreshCw, Loader2, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { MediaImg } from '@/components/media/MediaImg';
import { refreshMediaMode } from '@/lib/media/client';
import { showToast } from '@/lib/toast';

type Policy = 'cloud' | 'local-first' | 'local-only';
type Status = 'local' | 'folder' | 'remote_only' | 'missing' | 'none';
interface Row {
  entityType: 'person' | 'school_logo'; entityId: number; role: 'student' | 'staff' | 'school'; recordId: number;
  displayName: string; admissionNo: string | null; staffNo: string | null; ref: string | null; refKind: string;
  status: Status; bytes: number | null; duplicateOf: number[];
}
interface Inventory {
  rows: Row[]; policy: Policy; localSupported: boolean; storage: string | null;
  config: { policy: Policy | null; photoFolder: string | null; folderKey: 'admission_no' | 'staff_no' | 'person_id' };
}
interface ScanResult {
  folder: string; key: string; fileCount: number;
  matched: { personId: number; file: string; displayName: string; role: string }[];
  unresolved: { file?: string; personIds?: number[]; reason: string }[];
}

const P = 'mediaSettings';
const STATUSES: Status[] = ['local', 'folder', 'remote_only', 'missing', 'none'];

export default function MediaSettingsPage() {
  const { t, digits, formatNumber } = useI18n();
  const [inv, setInv] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | 'all' | 'duplicates'>('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [localizing, setLocalizing] = useState<{ done: number; total: number; failures: { entityId: number; reason: string }[] } | null>(null);
  const [folderInput, setFolderInput] = useState('');
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [manual, setManual] = useState<Record<string, string>>({});
  const desktop = typeof window !== 'undefined' && (window as unknown as { draisDesktop?: { pickFolder: () => Promise<string | null> } }).draisDesktop;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/media/inventory', { credentials: 'include' });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || '');
      setInv(d);
      setFolderInput(d.config?.photoFolder ?? '');
    } catch {
      setError(t(`${P}.loadFailed`, 'The image library could not be loaded.'));
    } finally { setLoading(false); }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: inv?.rows.length ?? 0, duplicates: 0 };
    for (const s of STATUSES) c[s] = 0;
    for (const r of inv?.rows ?? []) { c[r.status]++; if (r.duplicateOf.length) c.duplicates++; }
    return c;
  }, [inv]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (inv?.rows ?? []).filter(r =>
      (filter === 'all' || (filter === 'duplicates' ? r.duplicateOf.length > 0 : r.status === filter)) &&
      (!q || [r.displayName, r.admissionNo, r.staffNo, String(r.entityId)].some(v => (v ?? '').toLowerCase().includes(q))),
    );
  }, [inv, filter, search]);

  async function savePolicy(policy: Policy) {
    setSaving(true);
    try {
      const r = await fetch('/api/media/config', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ policy }) });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error();
      await refreshMediaMode();
      await load();
      showToast('success', t(`${P}.saved`, 'Saved.'));
    } catch { showToast('error', t(`${P}.saveFailed`, 'The setting could not be saved.')); }
    finally { setSaving(false); }
  }

  async function localizeAll() {
    const pending = (inv?.rows ?? []).filter(r => r.status === 'remote_only' || (r.status === 'missing' && (r.refKind === 'cloudinary' || r.refKind === 'remote' || r.refKind === 'legacy'))).length;
    setLocalizing({ done: 0, total: pending, failures: [] });
    const failures: { entityId: number; reason: string }[] = [];
    let done = 0;
    try {
      // Batches keep each request short; a failed image is reported, never retried forever.
      for (let guard = 0; guard < 500; guard++) {
        const r = await fetch('/api/media/localize', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 25 }) });
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error();
        done += d.saved;
        failures.push(...d.failures);
        setLocalizing({ done, total: pending, failures: [...failures] });
        // Stop when nothing is left, or a whole batch saved nothing (offline / all failing) — never spin.
        if (d.processed === 0 || d.saved === 0 || d.remaining <= 0) break;
      }
      showToast('success', t(`${P}.localizeDone`, { n: done }));
    } catch {
      showToast('error', t(`${P}.localizeFailed`, 'Copying stopped. Check the internet connection and try again.'));
    } finally { await load(); }
  }

  async function saveFolder(path: string, key?: Inventory['config']['folderKey']) {
    setSaving(true);
    try {
      const r = await fetch('/api/media/config', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoFolder: path || null, ...(key ? { folderKey: key } : {}) }) });
      const d = await r.json();
      if (!r.ok || !d.success) {
        showToast('error', t(`${P}.folderReason.${d?.reason ?? 'unknown'}`, t(`${P}.folderInvalid`, 'That folder cannot be used.')));
        return false;
      }
      setScan(null);
      await load();
      return true;
    } catch { showToast('error', t(`${P}.saveFailed`, 'The setting could not be saved.')); return false; }
    finally { setSaving(false); }
  }

  async function runScan() {
    setScan(null); setSelected(new Set()); setManual({});
    const r = await fetch('/api/media/folder/scan', { method: 'POST', credentials: 'include' });
    const d = await r.json();
    if (!r.ok || !d.success) { showToast('error', t(`${P}.folderReason.${d?.reason ?? 'unknown'}`, t(`${P}.folderInvalid`, 'That folder cannot be used.'))); return; }
    setScan(d);
    setSelected(new Set(d.matched.map((m: { personId: number }) => m.personId)));
  }

  async function applyLinks() {
    if (!scan) return;
    const pairs = [
      ...scan.matched.filter(m => selected.has(m.personId)).map(m => ({ personId: m.personId, file: m.file })),
      ...Object.entries(manual).filter(([, pid]) => pid).map(([file, pid]) => ({ personId: Number(pid), file })),
    ];
    if (!pairs.length) return;
    const r = await fetch('/api/media/folder/apply', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairs }) });
    const d = await r.json();
    if (!r.ok || !d.success) { showToast('error', t(`${P}.linkFailed`, 'The photos could not be linked.')); return; }
    showToast('success', t(`${P}.linked`, { n: d.applied, skipped: d.skipped.length }));
    setScan(null);
    await refreshMediaMode();
    await load();
  }

  const people = useMemo(() => (inv?.rows ?? []).filter(r => r.entityType === 'person'), [inv]);
  const policyChoices: { id: Policy; icon: React.ReactNode }[] = [
    { id: 'cloud', icon: <Cloud className="w-4 h-4" /> },
    { id: 'local-first', icon: <HardDrive className="w-4 h-4" /> },
    { id: 'local-only', icon: <HardDrive className="w-4 h-4" /> },
  ];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ImageIcon className="w-6 h-6 text-indigo-500" /> {t(`${P}.title`, 'Photos & media')}
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">{t(`${P}.subtitle`, 'Where learner and staff photos and the school logo come from on this computer, and which images are missing.')}</p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {t(`${P}.refresh`, 'Refresh')}
        </button>
      </header>

      {error && <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm">{error}</div>}
      {loading && !inv && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> {t(`${P}.loading`, 'Loading…')}</div>}

      {inv && (
        <>
          {/* Image source */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">{t(`${P}.sourceTitle`, 'Image source')}</h2>
            {!inv.localSupported && (
              <p className="text-sm text-slate-500">{t(`${P}.hostedNote`, 'This is the online DRAIS. Images are stored in DRAIS cloud storage. Local photos are available in the DRAIS desktop app.')}</p>
            )}
            <div className="grid sm:grid-cols-3 gap-2">
              {policyChoices.map(c => {
                const active = inv.policy === c.id;
                return (
                  <button key={c.id} disabled={!inv.localSupported || saving} onClick={() => void savePolicy(c.id)}
                    className={`text-start p-3 rounded-lg border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${active ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}>
                    <div className="flex items-center gap-2 font-semibold text-sm text-slate-800 dark:text-slate-100">{c.icon} {t(`${P}.policy.${c.id}`, c.id)}
                      {active && <CheckCircle2 className="w-4 h-4 text-indigo-500 ms-auto" />}</div>
                    <p className="text-xs text-slate-500 mt-1">{t(`${P}.policyHelp.${c.id}`, '')}</p>
                  </button>
                );
              })}
            </div>
            {inv.localSupported && !inv.config.policy && (
              <p className="text-xs text-slate-500">{t(`${P}.defaultNote`, 'Not chosen yet — DRAIS uses local photos first because this computer works from a local database.')}</p>
            )}
            {inv.storage && <p className="text-xs text-slate-500">{t(`${P}.storageAt`, 'Local copies are kept in:')} <code dir="ltr" className="px-1 bg-slate-100 dark:bg-slate-800 rounded">{inv.storage}</code></p>}
          </section>

          {/* Library */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-800 dark:text-slate-100">{t(`${P}.libraryTitle`, 'Image library')}</h2>
              <div className="flex flex-wrap gap-2">
                {inv.localSupported && (
                  <button onClick={() => void localizeAll()} disabled={!!localizing && localizing.done < localizing.total}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                    <HardDrive className="w-4 h-4" /> {t(`${P}.localize`, 'Make available offline')}
                  </button>
                )}
                <a href="/api/media/export" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Download className="w-4 h-4" /> {t(`${P}.export`, 'Download all (ZIP)')}
                </a>
              </div>
            </div>
            <p className="text-xs text-slate-500">{t(`${P}.exportHelp`, 'The ZIP contains every available image plus manifest.csv / manifest.json linking each file to its learner, staff member or the school.')}</p>

            {localizing && (
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all" style={{ width: `${localizing.total ? Math.min(100, (localizing.done / localizing.total) * 100) : 100}%` }} />
                </div>
                <p className="text-xs text-slate-500">{t(`${P}.progress`, { done: localizing.done, total: localizing.total })}</p>
                {localizing.failures.length > 0 && (
                  <details className="text-xs text-rose-600"><summary>{t(`${P}.failures`, { n: localizing.failures.length })}</summary>
                    <ul className="mt-1 max-h-32 overflow-y-auto">{localizing.failures.map((f, i) => <li key={i}>#{digits(f.entityId)} — {t(`${P}.reason.${f.reason}`, f.reason)}</li>)}</ul>
                  </details>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {(['all', ...STATUSES, 'duplicates'] as const).map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${filter === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                  {t(`${P}.status.${s}`, s)} <span className="opacity-70">{formatNumber(counts[s] ?? 0)}</span>
                </button>
              ))}
              <div className="relative ms-auto">
                <Search className="absolute start-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t(`${P}.searchPh`, 'Name, admission or staff number…')}
                  className="ps-7 pe-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 w-56" />
              </div>
            </div>

            <div className="max-h-[480px] overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
              {visible.slice(0, 300).map(r => (
                <div key={`${r.entityType}-${r.entityId}-${r.role}`} className="flex items-center gap-3 px-3 py-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex-shrink-0 flex items-center justify-center text-xs text-slate-400">
                    {r.ref ? <MediaImg src={r.ref} alt="" loading="lazy" className="w-full h-full object-cover" /> : '—'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{r.displayName || t(`${P}.role.${r.role}`, r.role)}</div>
                    <div className="text-xs text-slate-500">{t(`${P}.role.${r.role}`, r.role)}{r.admissionNo ? ` · ${r.admissionNo}` : ''}{r.staffNo ? ` · ${r.staffNo}` : ''}
                      {r.duplicateOf.length > 0 && <span className="text-amber-600"> · {t(`${P}.duplicate`, 'same image as another record')}</span>}</div>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${r.status === 'missing' ? 'bg-rose-100 text-rose-700' : r.status === 'remote_only' ? 'bg-amber-100 text-amber-700' : r.status === 'none' ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>
                    {t(`${P}.status.${r.status}`, r.status)}
                  </span>
                </div>
              ))}
              {visible.length === 0 && <p className="p-6 text-center text-sm text-slate-400">{t(`${P}.empty`, 'Nothing matches.')}</p>}
              {visible.length > 300 && <p className="p-2 text-center text-xs text-slate-400">{t(`${P}.moreRows`, { n: visible.length - 300 })}</p>}
            </div>
          </section>

          {/* School photo folder */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><FolderOpen className="w-4 h-4" /> {t(`${P}.folderTitle`, 'Photos kept in a folder on this computer')}</h2>
            <p className="text-sm text-slate-500">{t(`${P}.folderHelp`, 'Point DRAIS at the folder where your school already keeps photos. Nothing is uploaded. Each file is matched by its name to an admission number, staff number or DRAIS id — never by a person’s name — and you confirm every match.')}</p>
            {!inv.localSupported ? (
              <p className="text-sm text-slate-500">{t(`${P}.folderDesktopOnly`, 'Available in the DRAIS desktop app, where DRAIS runs on your school’s computer.')}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 items-center">
                  <input dir="ltr" value={folderInput} onChange={e => setFolderInput(e.target.value)} placeholder="C:\School\Photos"
                    className="flex-1 min-w-[260px] px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono" />
                  {desktop && (
                    <button onClick={async () => { const p = await desktop.pickFolder(); if (p) { setFolderInput(p); await saveFolder(p); } }}
                      className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600">{t(`${P}.browse`, 'Browse…')}</button>
                  )}
                  <button onClick={() => void saveFolder(folderInput)} disabled={saving} className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 disabled:opacity-50">{t(`${P}.saveFolder`, 'Save folder')}</button>
                </div>
                <div className="flex flex-wrap gap-2 items-center text-sm">
                  <label className="text-slate-600 dark:text-slate-300">{t(`${P}.matchBy`, 'File names are:')}</label>
                  <select value={inv.config.folderKey} onChange={e => void saveFolder(folderInput, e.target.value as Inventory['config']['folderKey'])}
                    className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm">
                    {(['admission_no', 'staff_no', 'person_id'] as const).map(k => <option key={k} value={k}>{t(`${P}.key.${k}`, k)}</option>)}
                  </select>
                  <button onClick={() => void runScan()} disabled={!inv.config.photoFolder} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-50">{t(`${P}.scan`, 'Find matches')}</button>
                </div>

                {scan && (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300">{t(`${P}.scanSummary`, { files: scan.fileCount, matched: scan.matched.length, unresolved: scan.unresolved.length })}</p>
                    {scan.matched.length > 0 && (
                      <div className="border border-slate-100 dark:border-slate-800 rounded-lg max-h-64 overflow-y-auto">
                        {scan.matched.map(m => (
                          <label key={m.personId} className="flex items-center gap-2 px-3 py-1.5 text-sm border-b border-slate-100 dark:border-slate-800 last:border-0">
                            <input type="checkbox" checked={selected.has(m.personId)} onChange={e => setSelected(prev => { const n = new Set(prev); if (e.target.checked) n.add(m.personId); else n.delete(m.personId); return n; })} />
                            <span dir="ltr" className="font-mono text-xs text-slate-500">{m.file}</span>
                            <span className="mx-1 text-slate-400"><span className="rtl:hidden">→</span><span className="ltr:hidden">←</span></span>
                            <span>{m.displayName}</span>
                            <span className="text-xs text-slate-400">({t(`${P}.role.${m.role}`, m.role)})</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {scan.unresolved.length > 0 && (
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-amber-700 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {t(`${P}.unresolvedTitle`, 'Needs your decision')}</h3>
                        <div className="border border-amber-200 dark:border-amber-900/40 rounded-lg max-h-64 overflow-y-auto">
                          {scan.unresolved.map((u, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm border-b border-amber-100 dark:border-amber-900/30 last:border-0">
                              <span dir="ltr" className="font-mono text-xs">{u.file ?? '—'}</span>
                              <span className="text-xs text-amber-700">{t(`${P}.unresolved.${u.reason}`, u.reason)}</span>
                              {u.file && !u.file.includes(',') && (
                                <select value={manual[u.file] ?? ''} onChange={e => setManual(prev => ({ ...prev, [u.file!]: e.target.value }))}
                                  className="ms-auto px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 max-w-[260px]">
                                  <option value="">{t(`${P}.assignTo`, 'Assign to…')}</option>
                                  {(u.personIds?.length ? people.filter(p => u.personIds!.includes(p.entityId)) : people).map(p => (
                                    <option key={`${p.role}-${p.entityId}`} value={p.entityId}>{p.displayName}{p.admissionNo ? ` · ${p.admissionNo}` : ''}{p.staffNo ? ` · ${p.staffNo}` : ''}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <button onClick={() => void applyLinks()} disabled={selected.size === 0 && !Object.values(manual).some(Boolean)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white disabled:opacity-50">
                      {t(`${P}.applyLinks`, { n: selected.size + Object.values(manual).filter(Boolean).length })}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
