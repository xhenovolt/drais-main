'use client';

/**
 * Control Center — DRAIS Cloud Storage (Cloudinary).
 * Browse every DRAIS file (drais/, drais-backups/, Unfiled, Trash), search, preview, upload (direct to
 * Cloudinary, any size the plan allows), create / rename / delete folders (to Trash, or forever with a
 * typed confirmation), rename / move / tag / download files, bulk actions, Trash with restore and empty.
 * The server enforces DRAIS scope and every permission (lib/control/cloudinary-admin.ts); buttons are
 * hidden here only as a courtesy.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  Cloud, Folder, FolderPlus, Upload, Search, RefreshCw, Loader2, ChevronRight, Home, Trash2, RotateCcw, Download,
  Pencil, Tag, MoveRight, X, File as FileIcon, FileText, FileArchive, Film, Image as ImageIcon, Copy, Check,
  AlertTriangle, LayoutGrid, List, Inbox, FolderInput, Eye, ShieldAlert,
} from 'lucide-react';
import { useControlAccess } from '@/components/control/ControlAccess';

type RT = 'image' | 'video' | 'raw';
interface StoredFile {
  asset_id: string; public_id: string; display_name: string | null; folder: string; resource_type: RT; type: string;
  format: string | null; bytes: number; width: number | null; height: number | null; created_at: string;
  secure_url: string; thumbnail_url: string | null; tags: string[]; trashed_from: string | null; trashed_at: string | null;
}
const UNFILED = '__unfiled__';
const TRASH = 'drais-trash';
const ROOTS = [
  { path: 'drais', label: 'DRAIS files', icon: Folder },
  { path: 'drais-backups', label: 'Backups', icon: FileArchive },
  { path: UNFILED, label: 'Unfiled', icon: Inbox },
  { path: TRASH, label: 'Trash', icon: Trash2 },
];

const getJson = async (u: string) => {
  const r = await fetch(u, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);
  return j;
};
const send = async (u: string, method: string, body: unknown) => {
  const r = await fetch(u, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `Request failed (${r.status})`);
  return j;
};
const size = (b: number) => (b >= 1 << 30 ? `${(b / (1 << 30)).toFixed(2)} GB` : b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
const isTrash = (f: string) => f === TRASH || f.startsWith(`${TRASH}/`);
const nameOf = (f: StoredFile) => f.display_name || f.public_id.split('/').pop() || f.public_id;
const ref = (f: StoredFile) => ({ public_id: f.public_id, resource_type: f.resource_type, type: f.type });
const iconFor = (f: StoredFile) => (f.resource_type === 'image' ? ImageIcon : f.resource_type === 'video' ? Film
  : /zip|gz|tar|7z|rar|part\d/i.test(f.format || f.public_id) ? FileArchive : /pdf|doc|txt|csv|xls/i.test(f.format || f.public_id) ? FileText : FileIcon);

export default function StoragePage() {
  const { can } = useControlAccess();
  const [folder, setFolder] = useState('drais');
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [type, setType] = useState<'all' | RT>('all');
  const [sort, setSort] = useState('created_at:desc');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<Map<string, StoredFile>>(new Map());
  const [pages, setPages] = useState<StoredFile[][]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [dialog, setDialog] = useState<null | { kind: string; file?: StoredFile; folder?: string }>(null);
  const [preview, setPreview] = useState<StoredFile | null>(null);
  const [uploads, setUploads] = useState<Array<{ name: string; pct: number; error?: string; done?: boolean }>>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { const t = setTimeout(() => setQ(qInput.trim()), 350); return () => clearTimeout(t); }, [qInput]);
  const [sortKey, dir] = sort.split(':');
  const listUrl = `/api/control-center/storage?${new URLSearchParams({ folder: q ? '' : folder, q, type, sort: sortKey, dir })}`;
  const { data, error, isLoading, mutate } = useSWR<any>(listUrl, getJson, { revalidateOnFocus: false });
  const { data: usageData, mutate: mutateUsage } = useSWR<any>('/api/control-center/storage/folders?usage=1', getJson, { revalidateOnFocus: false });
  useEffect(() => { setPages([]); setCursor(null); setSelected(new Map()); }, [listUrl]);

  const files: StoredFile[] = useMemo(() => [...(data?.files ?? []), ...pages.flat()], [data, pages]);
  const folders: Array<{ name: string; path: string }> = data?.folders ?? [];
  const nextCursor = pages.length ? cursor : data?.next_cursor ?? null;
  const inTrash = isTrash(folder) && !q;

  const flash = (ok: boolean, text: string) => { setToast({ ok, text }); setTimeout(() => setToast(null), 5000); };
  const refresh = useCallback(() => { setPages([]); setCursor(null); mutate(); mutateUsage(); }, [mutate, mutateUsage]);
  const run = async (label: string, fn: () => Promise<any>, okText: string | ((r: any) => string)) => {
    setBusy(label);
    try { const r = await fn(); flash(true, typeof okText === 'function' ? okText(r) : okText); setSelected(new Map()); refresh(); return r; }
    catch (e: any) { flash(false, e?.message || 'Failed'); }
    finally { setBusy(null); }
  };
  const loadMore = async () => {
    const c = nextCursor; if (!c) return;
    setBusy('more');
    try { const r = await getJson(`${listUrl}&cursor=${encodeURIComponent(c)}`); setPages((p) => [...p, r.files || []]); setCursor(r.next_cursor || null); }
    catch (e: any) { flash(false, e.message); } finally { setBusy(null); }
  };
  const go = (path: string) => { setQInput(''); setQ(''); setFolder(path); };

  // ── Upload: sign on the server, send each file straight to Cloudinary ──
  const uploadFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (!arr.length) return;
    const target = folder === UNFILED || isTrash(folder) ? 'drais' : folder;
    setUploads(arr.map((f) => ({ name: f.name, pct: 0 })));
    let done = 0;
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i];
      try {
        const sig = await send('/api/control-center/storage/sign', 'POST', { folder: target });
        await new Promise<void>((resolve, reject) => {
          const fd = new FormData();
          for (const [k, v] of Object.entries(sig.fields)) fd.append(k, String(v));
          fd.append('file', f);
          const xhr = new XMLHttpRequest();
          xhr.open('POST', sig.url);
          xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploads((u) => u.map((x, j) => (j === i ? { ...x, pct: Math.round((e.loaded / e.total) * 100) } : x))); };
          xhr.onload = () => {
            const j = (() => { try { return JSON.parse(xhr.responseText); } catch { return {}; } })();
            if (xhr.status >= 200 && xhr.status < 300) {
              send('/api/control-center/storage/sign?done=1', 'POST', { public_id: j.public_id, bytes: j.bytes, resource_type: j.resource_type, folder: target, filename: f.name }).catch(() => {});
              resolve();
            } else reject(new Error(j?.error?.message || `Upload failed (${xhr.status})`));
          };
          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.send(fd);
        });
        done++;
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, pct: 100, done: true } : x)));
      } catch (e: any) {
        setUploads((u) => u.map((x, j) => (j === i ? { ...x, error: e.message } : x)));
      }
    }
    flash(done === arr.length, `${done} of ${arr.length} file(s) uploaded to ${target}`);
    setTimeout(refresh, 1500); // Cloudinary's search index takes a moment
  };
  const [dragOver, setDragOver] = useState(false);

  const toggle = (f: StoredFile) => setSelected((s) => { const n = new Map(s); n.has(f.public_id) ? n.delete(f.public_id) : n.set(f.public_id, f); return n; });
  const sel = [...selected.values()];
  const crumbs = folder === UNFILED ? [{ path: UNFILED, label: 'Unfiled' }]
    : folder.split('/').map((p, i, a) => ({ path: a.slice(0, i + 1).join('/'), label: i === 0 ? (ROOTS.find((r) => r.path === p)?.label ?? p) : p }));
  const usage = usageData?.usage;

  return (
    <div className="space-y-4"
      onDragOver={(e) => { if (can('storage.upload') && !inTrash) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (can('storage.upload') && !inTrash && e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files); }}>
      {/* Header + usage */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Cloud className="w-5 h-5 text-indigo-400" /> DRAIS Cloud Storage</h1>
          <p className="text-xs text-slate-400 mt-0.5">Every DRAIS file in Cloudinary{usageData?.cloud_name ? <> · cloud <span className="font-mono">{usageData.cloud_name}</span></> : null}. Other products sharing this account are not shown.</p>
        </div>
        {usage && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Stat label="DRAIS files" value={usage.drais_files?.toLocaleString() ?? '—'} />
            <Stat label="Account storage" value={size(usage.storage_bytes)} />
            <Stat label="Bandwidth (month)" value={size(usage.bandwidth_bytes)} />
            <Stat label={`Credits (${usage.plan})`} value={usage.credits_limit ? `${usage.credits_used} / ${usage.credits_limit} (${usage.credits_percent}%)` : '—'} warn={Number(usage.credits_percent) >= 80} />
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[200px_1fr] gap-4">
        {/* Roots */}
        <nav className="flex lg:flex-col gap-1 overflow-x-auto">
          {ROOTS.map((r) => {
            const active = !q && (folder === r.path || (r.path !== UNFILED && folder.startsWith(`${r.path}/`)));
            return (
              <button key={r.path} onClick={() => go(r.path)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap ${active ? 'bg-indigo-600/20 text-indigo-200' : 'text-slate-300 hover:bg-slate-800'}`}>
                <r.icon className="w-4 h-4" /> {r.label}
              </button>
            );
          })}
        </nav>

        <div className="space-y-3 min-w-0">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Search all DRAIS files (name, tag…)"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-100" />
            </div>
            <select value={type} onChange={(e) => setType(e.target.value as any)} className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-300">
              <option value="all">All types</option><option value="image">Images</option><option value="video">Videos</option><option value="raw">Documents & other</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-300">
              <option value="created_at:desc">Newest first</option><option value="created_at:asc">Oldest first</option>
              <option value="bytes:desc">Largest first</option><option value="bytes:asc">Smallest first</option><option value="public_id:asc">Name A–Z</option>
            </select>
            <button onClick={() => setView(view === 'grid' ? 'list' : 'grid')} title={view === 'grid' ? 'List view' : 'Grid view'} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
              {view === 'grid' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
            </button>
            <button onClick={refresh} title="Refresh" className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"><RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /></button>
            {can('storage.upload') && !inTrash && folder !== UNFILED && !q && (
              <button onClick={() => setDialog({ kind: 'newFolder' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200"><FolderPlus className="w-4 h-4" /> New folder</button>
            )}
            {can('storage.upload') && !inTrash && (
              <>
                <button onClick={() => fileInput.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm text-white font-semibold"><Upload className="w-4 h-4" /> Upload</button>
                <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ''; }} />
              </>
            )}
            {inTrash && can('storage.purge') && (
              <button onClick={() => setDialog({ kind: 'emptyTrash' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-sm text-white font-semibold"><ShieldAlert className="w-4 h-4" /> Empty Trash</button>
            )}
          </div>

          {/* Breadcrumb */}
          {!q ? (
            <div className="flex flex-wrap items-center gap-1 text-sm text-slate-400">
              <Home className="w-3.5 h-3.5" />
              {crumbs.map((c, i) => (
                <React.Fragment key={c.path}>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                  <button onClick={() => go(c.path)} className={i === crumbs.length - 1 ? 'text-slate-100 font-semibold' : 'hover:text-slate-200'}>{c.label}</button>
                </React.Fragment>
              ))}
              {data && <span className="ml-2 text-xs text-slate-500">· {data.total?.toLocaleString()} file{data.total === 1 ? '' : 's'} here</span>}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Search results for <span className="text-slate-100 font-semibold">“{q}”</span> across all DRAIS files{data ? ` · ${data.total}` : ''}.
              <button onClick={() => setQInput('')} className="ml-2 text-indigo-300 underline">Clear</button></p>
          )}

          {dragOver && <div className="rounded-xl border-2 border-dashed border-indigo-400 bg-indigo-500/10 py-8 text-center text-sm text-indigo-200">Drop files to upload into <b>{folder === UNFILED ? 'drais' : folder}</b></div>}

          {/* Upload progress */}
          {uploads.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400"><span>Uploads</span><button onClick={() => setUploads([])} className="hover:text-slate-200"><X className="w-3.5 h-3.5" /></button></div>
              {uploads.map((u, i) => (
                <div key={i} className="text-xs">
                  <div className="flex justify-between text-slate-300"><span className="truncate">{u.name}</span><span className={u.error ? 'text-rose-300' : u.done ? 'text-emerald-300' : ''}>{u.error ? 'failed' : u.done ? 'done' : `${u.pct}%`}</span></div>
                  {u.error ? <p className="text-rose-300">{u.error}</p> : <div className="h-1 rounded bg-slate-800 mt-0.5"><div className="h-1 rounded bg-indigo-500" style={{ width: `${u.pct}%` }} /></div>}
                </div>
              ))}
            </div>
          )}

          {/* Bulk actions */}
          {sel.length > 0 && (
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-700 bg-slate-900/95 px-3 py-2 text-sm">
              <span className="text-slate-200 font-semibold">{sel.length} selected</span>
              <button onClick={() => setSelected(new Map())} className="text-xs text-slate-400 underline">clear</button>
              <span className="flex-1" />
              {can('storage.download') && <button onClick={() => sel.forEach((f, i) => setTimeout(() => window.open(dlUrl(f), '_blank'), i * 400))} className={btn}><Download className="w-3.5 h-3.5" /> Download</button>}
              {!inTrash && can('storage.edit') && <button onClick={() => setDialog({ kind: 'moveMany' })} className={btn}><MoveRight className="w-3.5 h-3.5" /> Move</button>}
              {!inTrash && can('storage.delete') && <button disabled={!!busy} onClick={() => run('trash', () => send('/api/control-center/storage', 'PATCH', { action: 'trash', items: sel.map(ref) }), (r) => `${Object.values(r.result).filter((v) => v === 'trashed').length} moved to Trash`)} className={btnRed}><Trash2 className="w-3.5 h-3.5" /> Move to Trash</button>}
              {inTrash && can('storage.delete') && <button disabled={!!busy} onClick={() => run('restore', () => send('/api/control-center/storage', 'PATCH', { action: 'restore', items: sel.map(ref) }), (r) => `${Object.values(r.result).filter((v) => v === 'restored').length} restored`)} className={btn}><RotateCcw className="w-3.5 h-3.5" /> Restore</button>}
              {can('storage.purge') && <button onClick={() => setDialog({ kind: 'purgeMany' })} className={btnRed}><ShieldAlert className="w-3.5 h-3.5" /> Delete forever</button>}
            </div>
          )}

          {toast && <div className={`rounded-lg px-3 py-2 text-sm ${toast.ok ? 'bg-emerald-500/15 text-emerald-200' : 'bg-rose-500/15 text-rose-200'}`}>{toast.text}</div>}

          {error && (
            <div className="rounded-xl border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-200 flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5" />
              <div><p className="font-semibold">Storage could not be loaded.</p><p className="text-xs opacity-80">{String(error.message || error)}</p></div></div>
          )}

          {/* Folders */}
          {!q && folders.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              {folders.map((f) => (
                <div key={f.path} className="group flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 hover:border-indigo-500">
                  <button onClick={() => go(f.path)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                    <Folder className="w-5 h-5 text-amber-400 flex-shrink-0" /><span className="truncate text-sm text-slate-200">{f.name}</span>
                  </button>
                  {!isTrash(f.path) && can('storage.edit') && <button title="Rename folder" onClick={() => setDialog({ kind: 'renameFolder', folder: f.path })} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-100"><Pencil className="w-3.5 h-3.5" /></button>}
                  {(can('storage.delete') || can('storage.purge')) && <button title="Delete folder" onClick={() => setDialog({ kind: 'deleteFolder', folder: f.path })} className="opacity-0 group-hover:opacity-100 p-1 text-rose-400 hover:text-rose-200"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              ))}
            </div>
          )}

          {/* Files */}
          {isLoading && !data && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400 inline" /></div>}
          {!error && data && files.length === 0 && folders.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-700 py-12 text-center text-sm text-slate-400">
              {q ? 'No DRAIS files match this search.' : inTrash ? 'The Trash is empty.' : 'This folder is empty.'}
              {!q && !inTrash && can('storage.upload') && <p className="text-xs text-slate-500 mt-1">Drag files here or use Upload.</p>}
            </div>
          )}
          {files.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={files.every((f) => selected.has(f.public_id))}
                  onChange={(e) => setSelected(e.target.checked ? new Map(files.map((f) => [f.public_id, f])) : new Map())} /> Select all shown
              </label>
            </div>
          )}
          {view === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
              {files.map((f) => <Card key={f.public_id} f={f} sel={selected.has(f.public_id)} onSel={() => toggle(f)} onOpen={() => setPreview(f)} />)}
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[11px] uppercase text-slate-500 border-b border-slate-800"><tr>
                  <th className="px-2 py-2 w-8" /><th className="px-2 py-2 text-left">Name</th><th className="px-2 py-2 text-left">Folder</th>
                  <th className="px-2 py-2 text-left">Type</th><th className="px-2 py-2 text-right">Size</th><th className="px-2 py-2 text-left">Added</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {files.map((f) => {
                    const Ic = iconFor(f);
                    return (
                      <tr key={f.public_id} className={`hover:bg-slate-800/50 ${selected.has(f.public_id) ? 'bg-indigo-500/10' : ''}`}>
                        <td className="px-2 py-1.5"><input type="checkbox" checked={selected.has(f.public_id)} onChange={() => toggle(f)} /></td>
                        <td className="px-2 py-1.5"><button onClick={() => setPreview(f)} className="flex items-center gap-2 text-left text-slate-100 hover:text-indigo-300"><Ic className="w-4 h-4 text-slate-400 flex-shrink-0" /><span className="truncate max-w-[280px]">{nameOf(f)}</span></button></td>
                        <td className="px-2 py-1.5 text-xs text-slate-400 font-mono truncate max-w-[220px]">{f.folder || '(unfiled)'}</td>
                        <td className="px-2 py-1.5 text-xs text-slate-400">{f.format || f.resource_type}</td>
                        <td className="px-2 py-1.5 text-xs text-slate-300 text-right tabular-nums">{size(f.bytes)}</td>
                        <td className="px-2 py-1.5 text-xs text-slate-400">{new Date(f.created_at).toLocaleDateString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {nextCursor && (
            <div className="text-center"><button onClick={loadMore} disabled={busy === 'more'} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200">
              {busy === 'more' ? <Loader2 className="w-4 h-4 animate-spin inline" /> : `Load more (${files.length} of ${data?.total})`}</button></div>
          )}
        </div>
      </div>

      {preview && (
        <PreviewDrawer f={preview} onClose={() => setPreview(null)} busy={busy}
          onAction={(kind) => setDialog({ kind, file: preview })}
          onTrash={() => run('trash', () => send('/api/control-center/storage', 'PATCH', { action: 'trash', items: [ref(preview)] }), 'Moved to Trash').then(() => setPreview(null))}
          onRestore={() => run('restore', () => send('/api/control-center/storage', 'PATCH', { action: 'restore', items: [ref(preview)] }), 'Restored').then(() => setPreview(null))} />
      )}

      {dialog && (
        <Dialogs dialog={dialog} folder={folder} selected={sel} busy={busy} onClose={() => setDialog(null)}
          run={async (label, fn, ok) => { const r = await run(label, fn, ok); if (r !== undefined) { setDialog(null); setPreview(null); } }} />
      )}
    </div>
  );
}

const btn = 'flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 disabled:opacity-50';
const btnRed = 'flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-700/80 hover:bg-rose-600 text-xs text-white disabled:opacity-50';
const dlUrl = (f: StoredFile) => `/api/control-center/storage/download?${new URLSearchParams({ public_id: f.public_id, resource_type: f.resource_type, type: f.type })}`;

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return <div className={`rounded-lg border px-3 py-1.5 ${warn ? 'border-amber-700 bg-amber-500/10' : 'border-slate-800 bg-slate-900'}`}><div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div><div className="text-slate-100 font-semibold tabular-nums">{value}</div></div>;
}

function Card({ f, sel, onSel, onOpen }: { f: StoredFile; sel: boolean; onSel: () => void; onOpen: () => void }) {
  const Ic = iconFor(f);
  return (
    <div className={`group relative rounded-xl border bg-slate-900 overflow-hidden ${sel ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-800 hover:border-slate-600'}`}>
      <input type="checkbox" checked={sel} onChange={onSel} className="absolute top-2 left-2 z-10 w-4 h-4" aria-label={`Select ${nameOf(f)}`} />
      <button onClick={onOpen} className="block w-full text-left">
        <div className="aspect-[4/3] bg-slate-950 flex items-center justify-center overflow-hidden">
          {f.thumbnail_url ? <img src={f.thumbnail_url} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Ic className="w-10 h-10 text-slate-600" />}
        </div>
        <div className="px-2 py-1.5">
          <p className="text-xs text-slate-100 truncate" title={f.public_id}>{nameOf(f)}</p>
          <p className="text-[10px] text-slate-500">{(f.format || f.resource_type).toUpperCase()} · {size(f.bytes)}</p>
          {f.trashed_from !== null && f.trashed_from !== undefined && isTrash(f.folder) && <p className="text-[10px] text-amber-300 truncate">from {f.trashed_from || '(root)'}</p>}
        </div>
      </button>
    </div>
  );
}

function PreviewDrawer({ f, onClose, onAction, onTrash, onRestore, busy }: {
  f: StoredFile; onClose: () => void; onAction: (k: string) => void; onTrash: () => void; onRestore: () => void; busy: string | null;
}) {
  const { can } = useControlAccess();
  const [copied, setCopied] = useState(false);
  const trashed = isTrash(f.folder);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onMouseDown={onClose}>
      <div className="w-full max-w-lg h-full overflow-y-auto bg-slate-900 border-l border-slate-800 p-5 space-y-4" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100 break-all">{nameOf(f)}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="rounded-xl bg-slate-950 flex items-center justify-center min-h-[200px] overflow-hidden">
          {f.resource_type === 'image' && f.type === 'upload' ? <img src={f.secure_url} alt="" className="max-h-[420px] object-contain" />
            : f.resource_type === 'video' && f.type === 'upload' ? <video src={f.secure_url} controls className="max-h-[420px]" />
            : <div className="text-center text-slate-500 text-sm py-10"><Eye className="w-8 h-8 mx-auto mb-2" />No preview — download to open</div>}
        </div>
        <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
          <dt className="text-slate-500">Public id</dt><dd className="text-slate-200 font-mono break-all">{f.public_id}</dd>
          <dt className="text-slate-500">Folder</dt><dd className="text-slate-200 font-mono break-all">{f.folder || '(unfiled)'}</dd>
          {trashed && <><dt className="text-slate-500">Trashed from</dt><dd className="text-amber-300 font-mono break-all">{f.trashed_from || '(root)'}{f.trashed_at ? ` · ${new Date(f.trashed_at).toLocaleString()}` : ''}</dd></>}
          <dt className="text-slate-500">Type</dt><dd className="text-slate-200">{f.resource_type} · {f.format || '—'} · {f.type}</dd>
          <dt className="text-slate-500">Size</dt><dd className="text-slate-200">{size(f.bytes)}{f.width ? ` · ${f.width}×${f.height}` : ''}</dd>
          <dt className="text-slate-500">Added</dt><dd className="text-slate-200">{new Date(f.created_at).toLocaleString()}</dd>
          <dt className="text-slate-500">Tags</dt><dd className="text-slate-200">{f.tags.length ? f.tags.join(', ') : '—'}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          {can('storage.download') && <a href={dlUrl(f)} target="_blank" rel="noreferrer" className={btn}><Download className="w-3.5 h-3.5" /> Download</a>}
          <button onClick={() => { navigator.clipboard?.writeText(f.secure_url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }} className={btn}>
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy URL</button>
          {!trashed && can('storage.edit') && <>
            <button onClick={() => onAction('label')} className={btn}><Pencil className="w-3.5 h-3.5" /> Rename</button>
            <button onClick={() => onAction('rename')} className={btn}><FolderInput className="w-3.5 h-3.5" /> Change public id</button>
            <button onClick={() => onAction('move')} className={btn}><MoveRight className="w-3.5 h-3.5" /> Move</button>
            <button onClick={() => onAction('tags')} className={btn}><Tag className="w-3.5 h-3.5" /> Tags</button>
          </>}
          {!trashed && can('storage.delete') && <button disabled={!!busy} onClick={onTrash} className={btnRed}><Trash2 className="w-3.5 h-3.5" /> Move to Trash</button>}
          {trashed && can('storage.delete') && <button disabled={!!busy} onClick={onRestore} className={btn}><RotateCcw className="w-3.5 h-3.5" /> Restore</button>}
          {can('storage.purge') && <button onClick={() => onAction('purgeOne')} className={btnRed}><ShieldAlert className="w-3.5 h-3.5" /> Delete forever</button>}
        </div>
        <p className="text-[11px] text-slate-500">“Rename” changes the name shown here and in Cloudinary; the file keeps its address, so DRAIS pages using it keep working. “Change public id” changes the address itself — anything in DRAIS that stored the old URL will break.</p>
      </div>
    </div>
  );
}

function Dialogs({ dialog, folder, selected, busy, onClose, run }: {
  dialog: { kind: string; file?: StoredFile; folder?: string }; folder: string; selected: StoredFile[]; busy: string | null; onClose: () => void;
  run: (label: string, fn: () => Promise<any>, ok: string | ((r: any) => string)) => Promise<void>;
}) {
  const f = dialog.file;
  const [v, setV] = useState(() => {
    if (dialog.kind === 'label' && f) return nameOf(f);
    if (dialog.kind === 'rename' && f) return f.public_id;
    if (dialog.kind === 'move' || dialog.kind === 'moveMany') return folder === UNFILED || isTrash(folder) ? 'drais' : folder;
    if (dialog.kind === 'tags' && f) return f.tags.join(', ');
    if (dialog.kind === 'renameFolder' && dialog.folder) return dialog.folder;
    if (dialog.kind === 'newFolder') return '';
    return '';
  });
  const [mode, setMode] = useState<'trash' | 'forever'>('trash');
  const [confirm, setConfirm] = useState('');
  const [days, setDays] = useState('');
  const { can } = useControlAccess();
  const { data: stats } = useSWR<any>(dialog.kind === 'deleteFolder' && dialog.folder ? `/api/control-center/storage/folders?stats=${encodeURIComponent(dialog.folder)}` : null, getJson);
  const S = '/api/control-center/storage';
  const shell = (title: string, body: React.ReactNode, action: React.ReactNode, danger = false) => (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className={`w-full max-w-md rounded-2xl border ${danger ? 'border-rose-700' : 'border-slate-700'} bg-slate-900 p-5 space-y-4`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-100">{title}</h3><button onClick={onClose} className="text-slate-400 hover:text-slate-100"><X className="w-4 h-4" /></button></div>
        <div className="space-y-3 text-sm text-slate-300">{body}</div>
        <div className="flex justify-end gap-2"><button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-slate-800 text-sm text-slate-200">Cancel</button>{action}</div>
      </div>
    </div>
  );
  const input = (ph: string, mono = false) => <input autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder={ph} className={`w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 ${mono ? 'font-mono' : ''}`} />;
  const go = (label: string, fn: () => Promise<any>, ok: string | ((r: any) => string), cls = 'bg-indigo-600 hover:bg-indigo-500', text = 'Save', disabled = false) =>
    <button disabled={!!busy || disabled} onClick={() => run(label, fn, ok)} className={`px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 ${cls}`}>{busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : text}</button>;

  switch (dialog.kind) {
    case 'newFolder':
      return shell(`New folder in ${folder}`, <>{input('folder name (letters, numbers, - and _)')}<p className="text-xs text-slate-500">Creates <span className="font-mono">{folder}/{v.trim() || '…'}</span></p></>,
        go('folder', () => send(`${S}/folders`, 'POST', { path: `${folder}/${v.trim()}` }), 'Folder created', undefined, 'Create', !v.trim()));
    case 'renameFolder':
      return shell('Rename / move folder', <>{input('new full path', true)}<p className="text-xs text-slate-500">Files keep their addresses — DRAIS pages using them keep working.</p></>,
        go('folder', () => send(`${S}/folders`, 'PATCH', { from: dialog.folder, to: v.trim() }), 'Folder renamed', undefined, 'Rename', !v.trim() || v.trim() === dialog.folder));
    case 'label':
      return shell('Rename file', input('name'), go('label', () => send(S, 'PATCH', { action: 'label', ...ref(f!), name: v }), 'Renamed', undefined, 'Rename', !v.trim()));
    case 'rename':
      return shell('Change public id', <>
        {input('new public id (must start with drais)', true)}
        <p className="text-xs text-amber-300 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> The file's URL changes. Any learner photo, logo or document in DRAIS that stored the old URL will stop showing. Prefer “Rename”.</p>
      </>, go('rename', () => send(S, 'PATCH', { action: 'rename', ...ref(f!), to: v.trim() }), 'Public id changed', 'bg-amber-600 hover:bg-amber-500', 'Change', !v.trim() || v.trim() === f!.public_id), true);
    case 'move':
    case 'moveMany': {
      const items = dialog.kind === 'move' ? [f!] : selected;
      return shell(`Move ${items.length} file${items.length === 1 ? '' : 's'}`, <>{input('target folder, e.g. drais/logos', true)}<p className="text-xs text-slate-500">Files keep their addresses; only the folder changes.</p></>,
        go('move', async () => { for (const it of items) await send(S, 'PATCH', { action: 'move', ...ref(it), folder: v.trim() }); return items.length; }, (n) => `${n} file(s) moved`, undefined, 'Move', !v.trim()));
    }
    case 'tags':
      return shell('Tags', <>{input('comma-separated tags')}</>, go('tags', () => send(S, 'PATCH', { action: 'tags', ...ref(f!), tags: v.split(',') }), 'Tags saved'));
    case 'purgeOne':
    case 'purgeMany': {
      const items = dialog.kind === 'purgeOne' ? [f!] : selected;
      return shell('Delete forever', <>
        <p className="flex gap-2 text-rose-200"><ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" /> {items.length} file{items.length === 1 ? '' : 's'} will be permanently deleted from Cloudinary. This cannot be undone and nothing in DRAIS can bring {items.length === 1 ? 'it' : 'them'} back.</p>
        {!items.every((i) => isTrash(i.folder)) && <p className="text-xs text-amber-300">Some of these are not in the Trash. Consider “Move to Trash” instead — it can be undone.</p>}
        <p className="text-xs text-slate-400">Type <b className="font-mono text-slate-200">DELETE</b> to confirm.</p>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-rose-700 text-sm font-mono text-slate-100" />
      </>, go('purge', () => fetch(S, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: items.map(ref) }) }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; }),
        (r) => `${Object.values(r.result).filter((x) => x === 'deleted').length} deleted forever`, 'bg-rose-700 hover:bg-rose-600', 'Delete forever', confirm !== 'DELETE'), true);
    }
    case 'deleteFolder': {
      const p = dialog.folder!;
      const n = stats?.stats?.files; const subs = stats?.stats?.subfolders;
      return shell(`Delete folder “${p.split('/').pop()}”`, <>
        <div className="rounded-lg bg-slate-950 p-3 text-xs space-y-1">
          <p className="font-mono text-slate-200 break-all">{p}</p>
          {stats ? <p className={n ? 'text-amber-300' : 'text-slate-400'}>{n ? `Contains ${n.toLocaleString()} file${n === 1 ? '' : 's'}` : 'No files'}{subs ? ` and ${subs} sub-folder${subs === 1 ? '' : 's'}` : ''}.</p> : <p className="text-slate-500"><Loader2 className="w-3 h-3 animate-spin inline" /> Counting contents…</p>}
        </div>
        {n > 0 && <p className="text-xs text-amber-300 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" /> Learner photos, logos or documents in this folder may be in use by DRAIS pages. Moving them to the Trash keeps their links working until the Trash is emptied.</p>}
        {can('storage.delete') && <label className="flex items-start gap-2 cursor-pointer"><input type="radio" checked={mode === 'trash'} onChange={() => setMode('trash')} className="mt-1" /><span><b>Move contents to Trash</b> and remove the folder — can be undone from the Trash.</span></label>}
        {can('storage.purge') && <label className="flex items-start gap-2 cursor-pointer"><input type="radio" checked={mode === 'forever'} onChange={() => setMode('forever')} className="mt-1" /><span className="text-rose-200"><b>Delete everything forever</b> — cannot be undone.</span></label>}
        {mode === 'forever' && <><p className="text-xs text-slate-400">Type the folder path <b className="font-mono text-slate-200">{p}</b> to confirm.</p>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-rose-700 text-sm font-mono text-slate-100" /></>}
      </>, go('folderDelete', () => send(`${S}/folders`, 'DELETE', { path: p, mode, confirm }),
        (r) => mode === 'forever' ? `Folder deleted · ${r.deleted_forever} file(s) deleted forever` : `Folder removed · ${r.moved_to_trash} file(s) moved to Trash`,
        mode === 'forever' ? 'bg-rose-700 hover:bg-rose-600' : 'bg-amber-600 hover:bg-amber-500', mode === 'forever' ? 'Delete forever' : 'Move to Trash',
        !stats || (mode === 'forever' && confirm !== p)), true);
    }
    case 'emptyTrash':
      return shell('Empty the Trash', <>
        <p className="flex gap-2 text-rose-200"><ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" /> Files in the Trash will be permanently deleted. This cannot be undone.</p>
        <label className="block text-xs text-slate-400">Only files trashed more than N days ago (leave blank for all)
          <input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 30" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100" /></label>
        <p className="text-xs text-slate-400">Type <b className="font-mono text-slate-200">EMPTY</b> to confirm.</p>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-rose-700 text-sm font-mono text-slate-100" />
      </>, go('empty', () => send(`${S}/folders`, 'POST', { empty_trash: true, older_than_days: days ? Number(days) : undefined }), (r) => `${r.deleted} file(s) deleted forever`, 'bg-rose-700 hover:bg-rose-600', 'Empty Trash', confirm !== 'EMPTY'), true);
    default:
      return null;
  }
}
