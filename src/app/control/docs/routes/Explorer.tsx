'use client';

/**
 * Route & file reference — the generated half of the developer documentation.
 *
 * Every fact on these pages comes from scripts/devdocs/analyze.mjs reading the
 * real source (served by /api/control-center/docs/*); hand-written depth comes
 * from ./guides.tsx. Where the analyser could not read something with
 * confidence the page says "needs manual review" instead of guessing.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ChevronDown, ChevronRight, ExternalLink, FileCode2, FolderTree, Search, X, AlertTriangle,
  CheckCircle2, CircleDashed, HelpCircle, BookOpen, Loader2, Server, Monitor,
} from 'lucide-react';
import { GUIDES } from './guides';
import { GUIDE_INDEX } from './guide-index';

const REPO = 'https://github.com/xhenovolt/drais-main';
const API = '/api/control-center/docs';

export const routeHref = (url: string) => `/control/docs/routes${url === '/' ? '' : url.split('/').map(encodeURIComponent).join('/')}`;
export const fileHref = (file: string, line?: number) => `/control/docs/files/${file.split('/').map(encodeURIComponent).join('/')}${line ? `#L${line}` : ''}`;
const sourceUrl = (commit: string | null, file: string, line?: number, end?: number) =>
  `${REPO}/blob/${commit || 'dev'}/${file.split('/').map(encodeURIComponent).join('/')}${line ? `#L${line}${end && end !== line ? `-L${end}` : ''}` : ''}`;

async function getJson(url: string) {
  const r = await fetch(url, { credentials: 'include' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || `HTTP ${r.status}`), { hint: d.hint, status: r.status });
  return d;
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function Section({ id, title, status, children }: { id: string; title: string; status?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 mt-8">
      <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-100 mb-3">
        {title}
        {status && <StatusChip status={status} />}
      </h2>
      <div className="text-sm text-slate-300 leading-relaxed">{children}</div>
    </section>
  );
}

const STATUS: Record<string, { label: string; cls: string; icon: React.ElementType; tip: string }> = {
  derived: { label: 'from code', cls: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60', icon: CheckCircle2, tip: 'Read directly from the source.' },
  'none-found': { label: 'none found', cls: 'bg-slate-800 text-slate-400 border-slate-700', icon: CircleDashed, tip: 'The analyser looked and found nothing of this kind.' },
  inherited: { label: 'inherited', cls: 'bg-slate-800 text-slate-300 border-slate-700', icon: CircleDashed, tip: 'Nothing in this file; enforced by middleware and the APIs it calls.' },
  'related-only': { label: 'related tests only', cls: 'bg-amber-950/50 text-amber-300 border-amber-800/60', icon: HelpCircle, tip: 'No test imports this file; tests exist for modules it uses.' },
  'needs-review': { label: 'needs manual review', cls: 'bg-rose-950/50 text-rose-300 border-rose-800/60', icon: AlertTriangle, tip: 'Part of this could not be read with confidence. Read the source.' },
};

function StatusChip({ status }: { status: string }) {
  const s = STATUS[status] || STATUS['needs-review'];
  const Icon = s.icon;
  return (
    <span title={s.tip} className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${s.cls}`}>
      <Icon className="w-3 h-3" />{s.label}
    </span>
  );
}

function FileLink({ file, line, children }: { file: string; line?: number; children?: React.ReactNode }) {
  return <Link href={fileHref(file, line)} className="font-mono text-xs text-indigo-300 hover:underline break-all">{children ?? file}{line ? `:${line}` : ''}</Link>;
}

function SourceLink({ commit, file, line, end }: { commit: string | null; file: string; line?: number; end?: number }) {
  return (
    <a href={sourceUrl(commit, file, line, end)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-300" title="Open on GitHub at the commit this index was generated from">
      source <ExternalLink className="w-3 h-3" />
    </a>
  );
}

function Grid({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty?: string }) {
  if (!rows.length) return <p className="text-slate-500 italic">{empty || 'None.'}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full text-xs">
        <thead><tr className="bg-slate-900">{head.map((h) => <th key={h} className="text-left px-3 py-2 font-bold text-slate-300 whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className={i % 2 ? 'bg-slate-900/40' : ''}>{r.map((c, j) => <td key={j} className="align-top px-3 py-1.5 text-slate-300">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Highlight({ text, q }: { text: string; q: string }) {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return <>{text}</>;
  const re = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  return <>{text.split(re).map((p, i) => (i % 2 ? <mark key={i} className="bg-indigo-500/30 text-indigo-100 rounded px-0.5">{p}</mark> : p))}</>;
}

// ─── Search ──────────────────────────────────────────────────────────────────

const CATS: Array<[string, string]> = [
  ['', 'All'], ['route', 'Pages'], ['api', 'API'], ['component', 'Components'], ['hook', 'Hooks'], ['function', 'Functions'],
  ['file', 'Files'], ['guide', 'Guides'], ['concept', 'Concepts'], ['problem', 'Problems'],
];

function SearchBox() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!q.trim()) { setRes(null); setErr(null); return; }
    const n = ++seq.current;
    const h = setTimeout(async () => {
      setBusy(true);
      try {
        const d = await getJson(`${API}/search?q=${encodeURIComponent(q)}${cat ? `&cat=${cat}` : ''}`);
        if (n === seq.current) { setRes(d); setErr(null); }
      } catch (e: any) { if (n === seq.current) setErr(e.message); }
      finally { if (n === seq.current) setBusy(false); }
    }, 180);
    return () => clearTimeout(h);
  }, [q, cat]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search routes, files, components, hooks, endpoints, guides…"
          aria-label="Search the developer documentation"
          className="w-full rounded-xl bg-slate-900 border border-slate-700 focus:border-indigo-500 outline-none pl-9 pr-9 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
        />
        {busy ? <Loader2 className="w-4 h-4 animate-spin text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
          : q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>}
      </div>
      {q.trim() && (
        <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="flex flex-wrap gap-1 mb-2">
            {CATS.map(([k, label]) => {
              const count = k ? res?.counts?.[k] ?? 0 : Object.values(res?.counts || {}).reduce((a: number, b: any) => a + b, 0);
              return (
                <button key={k || 'all'} onClick={() => setCat(k)} disabled={!!k && !count && cat !== k}
                  className={`text-xs px-2 py-1 rounded-md border ${cat === k ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200' : 'border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-40'}`}>
                  {label} <span className="text-slate-500">{count as number}</span>
                </button>
              );
            })}
          </div>
          {err && <p className="text-rose-300 text-sm">{err}</p>}
          {res && !res.results.length && (
            <p className="text-sm text-slate-400 py-2">
              Nothing matches &ldquo;{q}&rdquo;{cat ? ' in this category' : ''}. Search reads route URLs, file paths, component,
              hook and exported function names, endpoint methods, table names, guide keywords and file header comments —
              try a shorter or different word, or clear the category.
            </p>
          )}
          <ul className="max-h-[60vh] overflow-y-auto divide-y divide-slate-900">
            {res?.results.map((r: any, i: number) => (
              <li key={i}>
                <Link href={r.href} className="block px-2 py-1.5 rounded hover:bg-slate-900">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-2">{r.cat}</span>
                  <span className={`text-sm ${r.cat === 'problem' ? 'text-amber-300' : 'text-slate-100'}`}><Highlight text={r.label} q={q} /></span>
                  <span className="block text-xs text-slate-500 truncate"><Highlight text={r.detail} q={q} /></span>
                </Link>
              </li>
            ))}
          </ul>
          {res && res.total > res.results.length && <p className="text-xs text-slate-500 mt-2">Showing {res.results.length} of {res.total}. Narrow by category or add a word.</p>}
        </div>
      )}
    </div>
  );
}

// ─── Route tree ──────────────────────────────────────────────────────────────

type TreeRow = { url: string; label: string | null; score: number; of: number; guide: boolean };
type TreeNode = { seg: string; url: string; row?: TreeRow; children: Map<string, TreeNode> };

function buildTree(rows: TreeRow[]): TreeNode {
  const root: TreeNode = { seg: '/', url: '/', children: new Map() };
  for (const r of rows) {
    if (r.url === '/') { root.row = r; continue; }
    let node = root;
    let acc = '';
    for (const seg of r.url.split('/').filter(Boolean)) {
      acc += '/' + seg;
      if (!node.children.has(seg)) node.children.set(seg, { seg, url: acc, children: new Map() });
      node = node.children.get(seg)!;
    }
    node.row = r;
  }
  return root;
}

function TreeItem({ node, active, depth, filter, openAll }: { node: TreeNode; active: string; depth: number; filter: string; openAll: boolean }) {
  const isAncestor = active === node.url || active.startsWith(node.url + '/');
  const [open, setOpen] = useState(isAncestor || depth < 1);
  useEffect(() => { if (isAncestor) setOpen(true); }, [isAncestor]);
  const kids = [...node.children.values()].sort((a, b) => a.seg.localeCompare(b.seg));
  const matches = (n: TreeNode): boolean => !filter || n.url.toLowerCase().includes(filter) || (n.row?.label || '').toLowerCase().includes(filter) || [...n.children.values()].some(matches);
  if (!matches(node)) return null;
  const expanded = open || (!!filter && openAll);
  return (
    <li>
      <div className={`flex items-center gap-1 rounded-md pr-1 ${active === node.url ? 'bg-indigo-500/15' : 'hover:bg-slate-800/70'}`} style={{ paddingLeft: depth * 10 }}>
        {kids.length ? (
          <button onClick={() => setOpen(!open)} aria-label={expanded ? 'Collapse' : 'Expand'} className="p-0.5 text-slate-500 hover:text-slate-300">
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : <span className="w-4" />}
        {node.row ? (
          <Link href={routeHref(node.url)} className={`flex-1 min-w-0 truncate py-1 text-xs ${active === node.url ? 'text-indigo-200 font-semibold' : 'text-slate-300'}`} title={node.url}>
            {node.seg}{node.row.label && <span className="text-slate-500"> · {node.row.label}</span>}
          </Link>
        ) : <span className="flex-1 py-1 text-xs text-slate-500 truncate">{node.seg}</span>}
        {node.row?.guide && <BookOpen className="w-3 h-3 text-indigo-400 shrink-0" aria-label="Has a hand-written guide" />}
      </div>
      {expanded && kids.length > 0 && (
        <ul>{kids.map((k) => <TreeItem key={k.url} node={k} active={active} depth={depth + 1} filter={filter} openAll={openAll} />)}</ul>
      )}
    </li>
  );
}

function RouteTree({ active, kind, setKind }: { active: string; kind: 'page' | 'api'; setKind: (k: 'page' | 'api') => void }) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    setData(null);
    getJson(`${API}/tree?kind=${kind}`).then(setData).catch(setErr);
  }, [kind]);
  const tree = useMemo(() => (data ? buildTree(data.routes) : null), [data]);
  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex gap-1 mb-2">
        {(['page', 'api'] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`flex-1 inline-flex items-center justify-center gap-1 text-xs py-1.5 rounded-md border ${kind === k ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200' : 'border-slate-800 text-slate-400'}`}>
            {k === 'page' ? <Monitor className="w-3 h-3" /> : <Server className="w-3 h-3" />}{k === 'page' ? `Pages${data && kind === 'page' ? ` (${data.routes.length})` : ''}` : `API${data && kind === 'api' ? ` (${data.routes.length})` : ''}`}
          </button>
        ))}
      </div>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter the tree…" aria-label="Filter the route tree"
        className="mb-2 w-full rounded-md bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-indigo-600" />
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {err && <NotGenerated err={err} />}
        {!data && !err && <p className="text-xs text-slate-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading tree…</p>}
        {tree && <ul><TreeItem node={tree} active={active} depth={0} filter={filter.toLowerCase()} openAll /></ul>}
      </div>
    </div>
  );
}

function NotGenerated({ err }: { err: any }) {
  return (
    <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-200">
      {err.message}{err.hint && <> <code className="text-amber-100">{err.hint}</code></>}
    </div>
  );
}

// ─── Shell ───────────────────────────────────────────────────────────────────

export function ExplorerShell({ active, children, defaultKind = 'page' }: { active: string; children: React.ReactNode; defaultKind?: 'page' | 'api' }) {
  const [kind, setKind] = useState<'page' | 'api'>(defaultKind);
  useEffect(() => setKind(defaultKind), [defaultKind]);
  return (
    <div className="max-w-[90rem] mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Link href="/control/docs" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-indigo-300"><ArrowLeft className="w-4 h-4" />Knowledge base</Link>
        <span className="text-slate-700">/</span>
        <Link href="/control/docs/routes" className="inline-flex items-center gap-1.5 text-sm text-slate-300 hover:text-indigo-300"><FolderTree className="w-4 h-4" />Route &amp; file reference</Link>
      </div>
      <SearchBox />
      <div className="flex gap-6 mt-5">
        <aside className="hidden lg:block w-72 shrink-0">
          <div className="sticky top-20 h-[calc(100vh-6rem)]">
            <RouteTree active={active} kind={kind} setKind={setKind} />
          </div>
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

// ─── Shared file sections ────────────────────────────────────────────────────

const isDialog = (n: string) => /(Modal|Dialog|Drawer|Sheet|Popup|Wizard)$/.test(n);
const hookGroup = (h: any) => h.source === 'react' ? 'React' : /^next/.test(h.source) ? 'Next.js' : h.source === 'this file' ? 'Defined in this file' : h.source.startsWith('src/') ? 'DRAIS' : 'Package';

function FileSections({ f, commit, isPage }: { f: any; commit: string | null; isPage: boolean }) {
  const hookGroups = useMemo(() => {
    const m = new Map<string, Map<string, { name: string; source: string; lines: number[] }>>();
    for (const h of f.hooks || []) {
      const g = hookGroup(h);
      if (!m.has(g)) m.set(g, new Map());
      const byName = m.get(g)!;
      const e = byName.get(h.name) || { name: h.name, source: h.source, lines: [] };
      e.lines.push(h.line);
      byName.set(h.name, e);
    }
    return [...m.entries()];
  }, [f]);
  const comps = f.rendered || [];
  const own = comps.filter((c: any) => c.source.startsWith('src/') || c.source === 'this file');
  const pkg = comps.filter((c: any) => !c.source.startsWith('src/') && c.source !== 'this file');
  const pkgBySource = pkg.reduce((a: Record<string, string[]>, c: any) => { (a[c.source] ||= []).push(c.name); return a; }, {});
  const unresolved = (f.requests || []).filter((r: any) => r.unresolved);

  return (
    <>
      <Section id="data" title="Data flow — requests this file makes" status={unresolved.length ? 'needs-review' : (f.requests || []).length ? 'derived' : 'none-found'}>
        <Grid
          head={['Method', 'URL', 'How', 'In', 'Handled by']}
          empty="This file makes no HTTP requests of its own. Its data arrives through props, context or the components it renders."
          rows={(f.requests || []).map((r: any) => [
            <span key="m" className="font-mono">{r.method || '—'}{r.stream ? ' (stream)' : ''}</span>,
            r.url ? <span key="u" className="font-mono break-all">{r.url}{r.alternative ? ' ⋯' : ''}</span>
              : r.external ? <span key="u" className="font-mono text-slate-400 break-all">{r.external}</span>
              : <span key="u" className="text-rose-300">built at run time: <code>{r.unresolved}</code></span>,
            <span key="v" className="font-mono">{r.via}</span>,
            <span key="d"><FileLink file={f.file} line={r.line}>{r.decl || 'top level'}</FileLink></span>,
            r.endpointFile ? <span key="e"><FileLink file={r.endpointFile} />{r.methodMissing && <span className="block text-amber-300">route has no {r.method} handler</span>}</span>
              : r.candidates ? <span key="e" className="text-slate-400">one of: {r.candidates.map((c: string) => <Link key={c} href={routeHref(c)} className="block font-mono text-indigo-300">{c}</Link>)}</span>
              : r.endpointMissing ? <span key="e" className="text-amber-300 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />no such API route</span>
              : r.target === 'page' ? <span key="e" className="text-slate-500">a page</span> : <span key="e" className="text-slate-500">—</span>,
          ])}
        />
        {unresolved.length > 0 && <p className="mt-2 text-xs text-rose-300">{unresolved.length} request URL{unresolved.length > 1 ? 's are' : ' is'} built from variables the analyser cannot follow (function parameters, objects). Read the lines linked above.</p>}
        {f.sqlTables?.length > 0 && <p className="mt-3">Database tables named in this file&apos;s SQL: {f.sqlTables.map((t: string) => <code key={t} className="mr-1">{t}</code>)}</p>}
      </Section>

      <Section id="components" title="Components rendered" status={comps.some((c: any) => c.source === 'unknown') ? 'needs-review' : comps.length ? 'derived' : 'none-found'}>
        <Grid
          head={['Component', 'From', 'Times', 'Kind']}
          empty="Renders no capitalised components."
          rows={own.map((c: any) => [
            <span key="n" className="font-mono">{c.name}</span>,
            c.source === 'this file' ? <span key="s" className="text-slate-400">this file</span> : <FileLink key="s" file={c.source} />,
            c.count,
            isDialog(c.name) ? 'dialog' : /Form$/.test(c.name) ? 'form' : /Tabs?$/.test(c.name) ? 'tabs' : /Table$/.test(c.name) ? 'table' : '',
          ])}
        />
        {Object.keys(pkgBySource).length > 0 && (
          <p className="mt-2 text-xs text-slate-400">From packages: {Object.entries(pkgBySource).map(([s, names]) => <span key={s} className="mr-3"><code>{s}</code> ({(names as string[]).length})</span>)}</p>
        )}
        {f.forms > 0 && <p className="mt-2">Native <code>&lt;form&gt;</code> elements: {f.forms}.</p>}
      </Section>

      <Section id="hooks" title="Hooks and state" status={(f.hooks || []).length ? 'derived' : 'none-found'}>
        {hookGroups.length === 0 ? <p className="text-slate-500 italic">No hooks — this is not a stateful React component{isPage ? ' (likely a server component or a thin wrapper)' : ''}.</p> : (
          <div className="space-y-2">
            {hookGroups.map(([g, byName]) => (
              <div key={g}>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{g}</p>
                <p className="mt-0.5">{[...byName.values()].map((h) => (
                  <span key={h.name} className="inline-block mr-3">
                    {h.source.startsWith('src/') ? <FileLink file={h.source}>{h.name}</FileLink> : <code>{h.name}</code>}
                    <span className="text-slate-500 text-xs"> ×{h.lines.length}</span>
                  </span>
                ))}</p>
              </div>
            ))}
          </div>
        )}
        {(f.state || []).length > 0 && (
          <div className="mt-3">
            <Grid head={['State', 'Setter', 'Initial value', 'Owner', 'Line']} rows={f.state.map((s: any) => [
              <code key="n">{s.name || '—'}</code>, <code key="s">{s.setter || '—'}</code>, <code key="i" className="text-slate-400">{s.initial}</code>, s.decl || '', <FileLink key="l" file={f.file} line={s.line}>{''}</FileLink>,
            ])} />
          </div>
        )}
      </Section>

      <Section id="blocks" title="Code blocks" status="derived">
        <Grid
          head={['Name', 'Kind', 'Lines', 'Doc comment (verbatim)', '']}
          rows={(f.declarations || []).map((d: any) => [
            <a key="n" id={`L${d.start}`} className="font-mono text-slate-100 scroll-mt-24">{d.name}{d.exported ? <span className="text-emerald-400 text-[10px] ml-1">export{d.isDefault ? ' default' : ''}</span> : ''}</a>,
            d.kind,
            <span key="l" className="whitespace-nowrap">{d.start}–{d.end}</span>,
            d.doc ? <span key="d" className="whitespace-pre-wrap text-slate-400">{d.doc.slice(0, 600)}{d.doc.length > 600 ? '…' : ''}</span> : <span key="d" className="text-slate-600">— none in code</span>,
            <SourceLink key="s" commit={commit} file={f.file} line={d.start} end={d.end} />,
          ])}
        />
      </Section>

      <Section id="imports" title="Imports" status="derived">
        <Grid head={['Module', 'Names', 'Kind']} rows={(f.imports || []).map((i: any) => [
          i.resolved ? <FileLink key="m" file={i.resolved}>{i.spec}</FileLink>
            : <span key="m" className={`font-mono ${i.broken ? 'text-amber-300' : ''}`}>{i.spec}{i.broken && (i.caseMismatch ? ` — resolves only on case-insensitive disks (${i.caseMismatch})` : ' — does not resolve')}</span>,
          <span key="n" className="font-mono text-slate-400">{(i.names || []).join(', ')}</span>,
          i.typeOnly ? 'types' : i.category,
        ])} />
      </Section>

      <Section id="auth" title="Authentication and permissions" status={(f.permissions || []).length || f.sessionScoped ? 'derived' : isPage ? 'inherited' : 'needs-review'}>
        {f.sessionScoped && <p>Reads the session (<code>getSessionSchoolId</code>/<code>getSession</code>) — the school comes from the signed-in user.</p>}
        {(f.permissions || []).length > 0 ? (
          <Grid head={['Check', 'Code', 'Line']} rows={f.permissions.map((p: any) => [<code key="c">{p.call}</code>, <code key="p">{p.code}</code>, <FileLink key="l" file={f.file} line={p.line}>{''}</FileLink>])} />
        ) : !f.sessionScoped && <p className="text-slate-400">{isPage ? 'No checks in this file. Pages are gated by middleware (session cookie); the real authorisation is in the API routes listed under Data flow.' : 'No session or permission call found in this file. If it is an API route, confirm by reading it — it may be public on purpose, or delegate to a helper.'}</p>}
      </Section>

      <Section id="style" title="Styling and text" status="derived">
        <ul className="list-disc pl-5 space-y-0.5">
          <li>{f.classNames} <code>className</code> attributes (Tailwind utility classes){f.cssImports?.length ? <>; stylesheets: {f.cssImports.map((c: string) => <code key={c} className="mr-1">{c}</code>)}</> : ''}.</li>
          <li>{f.usesI18n ? <>Translated through <code>useI18n</code> — {f.i18nKeys} literal <code>t(&apos;…&apos;)</code> keys. New text needs English and Arabic entries.</> : 'No i18n calls in this file.'}</li>
          {f.directive && <li>Directive: <code>&apos;{f.directive}&apos;</code>{f.directive === 'use client' ? ' — runs in the browser; cannot import server-only modules.' : ''}</li>}
        </ul>
      </Section>

      <Section id="tests" title="Tests" status={f.tests?.length ? 'derived' : f.relatedTests?.length ? 'related-only' : 'none-found'}>
        {f.tests?.length ? <p>Tests that import this file: {f.tests.map((t: string) => <span key={t} className="block"><FileLink file={t} /></span>)}</p>
          : <p className="text-slate-400">No test imports this file directly.</p>}
        {f.relatedTests?.length > 0 && <p className="mt-2">Tests of modules it depends on: {f.relatedTests.map((t: string) => <span key={t} className="block"><FileLink file={t} /></span>)}</p>}
      </Section>
    </>
  );
}

function Header({ f, commit, title, sub }: { f: any; commit: string | null; title: string; sub?: React.ReactNode }) {
  return (
    <>
      <h1 className="text-2xl font-extrabold text-slate-100 break-all">{title}</h1>
      <p className="mt-1 text-sm text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1"><FileCode2 className="w-3.5 h-3.5" /><span className="font-mono">{f.file}</span></span>
        <span>{f.lines} lines</span>
        <span>{f.directive === 'use client' ? 'client component' : f.route?.special === 'route' ? 'server (API route)' : f.file.endsWith('.tsx') ? 'server component' : 'module'}</span>
        <SourceLink commit={commit} file={f.file} />
        {sub}
      </p>
    </>
  );
}

function Purpose({ f }: { f: any }) {
  return (
    <Section id="purpose" title="What the file says about itself" status={f.header ? 'derived' : 'needs-review'}>
      {f.header ? <pre className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300 font-sans">{f.header}</pre>
        : <p className="text-slate-400">The file has no header comment, so its purpose is not stated in code. Infer it from the sections below and the hand-written guide, if any — then consider adding a header comment.</p>}
    </Section>
  );
}

function Guide({ target }: { target: string }) {
  const meta = GUIDE_INDEX.find((g) => g.target === target);
  const Body = GUIDES[target];
  if (!meta || !Body) {
    return (
      <Section id="guide" title="Extension guide" status="needs-review">
        <p className="text-slate-400">
          No hand-written guide for this yet. The sections below are generated and accurate, but they say <em>what</em>, not
          <em> why</em>. For the general method see <Link href="/control/docs/playbook-page" className="text-indigo-300">Add a page</Link>,{' '}
          <Link href="/control/docs/playbook-api" className="text-indigo-300">Add an API route</Link> and{' '}
          <Link href="/control/docs/anti-patterns" className="text-indigo-300">Conventions to avoid</Link>.
        </p>
      </Section>
    );
  }
  return (
    <section id="guide" className="mt-8 rounded-xl border border-indigo-900/60 bg-indigo-950/20 p-5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1">Hand-written guide · checked at {meta.verifiedAt}</p>
      <h2 className="text-lg font-extrabold text-slate-100 mb-3">{meta.title}</h2>
      <article className="prose prose-invert prose-sm max-w-none prose-p:text-slate-300 prose-li:text-slate-300 prose-code:text-indigo-300 prose-code:bg-slate-800 prose-code:px-1 prose-code:rounded prose-a:text-indigo-300 prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800">
        <Body />
      </article>
    </section>
  );
}

function useHashScroll(dep: unknown) {
  useEffect(() => {
    if (!dep || typeof window === 'undefined') return;
    const m = window.location.hash.match(/^#L(\d+)$/);
    if (!m) {
      // Section anchors (#data, #tests …) exist only once the data has rendered.
      const id = window.location.hash.slice(1);
      if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
      return;
    }
    const line = Number(m[1]);
    const anchors = [...document.querySelectorAll<HTMLElement>('a[id^="L"]')];
    const target = anchors.filter((a) => Number(a.id.slice(1)) <= line).pop();
    if (target) {
      target.scrollIntoView({ block: 'center' });
      target.closest('tr')?.classList.add('ring-1', 'ring-indigo-500');
    }
  }, [dep]);
}

// ─── Route view ──────────────────────────────────────────────────────────────

export function RouteView({ url }: { url: string }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  useEffect(() => { setD(null); setErr(null); getJson(`${API}/route?url=${encodeURIComponent(url)}`).then(setD).catch(setErr); }, [url]);
  useHashScroll(d);
  const isApi = d?.node.kind === 'api';

  const crumbs = url.split('/').filter(Boolean).map((seg, i, all) => ({ seg, url: '/' + all.slice(0, i + 1).join('/') }));
  return (
    <ExplorerShell active={url} defaultKind={url.startsWith('/api/') ? 'api' : 'page'}>
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500 mb-2 flex flex-wrap items-center gap-1">
        <Link href={routeHref('/')} className="hover:text-indigo-300">/</Link>
        {crumbs.map((c) => <React.Fragment key={c.url}><ChevronRight className="w-3 h-3" /><Link href={routeHref(c.url)} className="hover:text-indigo-300">{c.seg}</Link></React.Fragment>)}
      </nav>
      {err && (err.status === 404 ? <RouteIndex url={url} /> : <NotGenerated err={err} />)}
      {!d && !err && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Reading {url}…</p>}
      {d && (
        <>
          <Header f={d.file} commit={d.commit} title={url} sub={<>
            {d.node.navLabel && <span>sidebar: “{d.node.navLabel}”</span>}
            {d.node.public && <span className="text-amber-300">public (no session required)</span>}
            {isApi && <span className="font-mono">{(d.file.httpMethods || []).join(' · ')}</span>}
          </>} />
          <OnThisPage isApi={isApi} />
          <Guide target={url} />
          <Purpose f={d.file} />

          <Section id="architecture" title={isApi ? 'Where this handler sits' : 'Page architecture'} status="derived">
            {!isApi && (
              <>
                <p className="mb-2">Every school page is wrapped, outermost first, by:</p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li><FileLink file="middleware.ts" /> — session cookie check (pages redirect to <code>/login</code>).</li>
                  {d.layouts.map((l: any) => (
                    <li key={l.file}><FileLink file={l.file} /> {l.summary && <span className="text-slate-400">— {l.summary}</span>}
                      {l.file === 'src/app/layout.tsx' && <span className="text-slate-400"> (chooses the app shell: <FileLink file="src/components/layout/AuthenticatedShell.tsx" /> → MainLayout)</span>}
                    </li>
                  ))}
                  <li><FileLink file={d.file.file} /> — this page.</li>
                </ol>
                <p className="mt-3">Loading UI: {d.loading.length ? d.loading.map((l: string) => <FileLink key={l} file={l} />) : <span className="text-slate-400">no <code>loading.tsx</code> on this path — the page renders its own loading state, if any.</span>}</p>
                <p className="mt-1">Error boundary: {d.errorBoundaries.length ? d.errorBoundaries.map((l: string) => <FileLink key={l} file={l} />) : <span className="text-slate-400">no <code>error.tsx</code>; render errors are caught by the shell&apos;s <code>ErrorBoundary</code>.</span>}</p>
              </>
            )}
            {isApi && (
              <ul className="list-disc pl-5 space-y-1">
                <li>Methods: {(d.file.httpMethods || []).map((m: string) => <code key={m} className="mr-1">{m}</code>)}</li>
                {Object.keys(d.file.routeConfig || {}).length > 0 && <li>Route config: {Object.entries(d.file.routeConfig).map(([k, v]) => <code key={k} className="mr-2">{k} = {String(v)}</code>)}</li>}
                <li>Called from {d.file.dependants?.length ? '' : 'pages via fetch — see "Called by" below'}</li>
              </ul>
            )}
            {d.children.length > 0 && <p className="mt-3">Routes below this one: {d.children.map((c: string) => <Link key={c} href={routeHref(c)} className="mr-2 font-mono text-xs text-indigo-300 hover:underline">{c}</Link>)}</p>}
            {d.node.duplicates?.length > 0 && <p className="mt-2 text-amber-300">Also defined by {d.node.duplicates.join(', ')} — Next.js will refuse to build with two files for one route.</p>}
          </Section>

          {d.endpoints.length > 0 && (
            <Section id="endpoints" title="API routes this page calls" status="derived">
              <Grid head={['Route', 'Methods', 'Auth', 'Tables']} rows={d.endpoints.map((e: any) => [
                <Link key="r" href={routeHref(e.route?.url || '/')} className="font-mono text-indigo-300 hover:underline">{e.route?.url}</Link>,
                <span key="m" className="font-mono">{(e.httpMethods || []).join(' ')}</span>,
                e.permissions?.length ? e.permissions.map((p: any) => <code key={p.line} className="block">{p.call}({p.code})</code>) : e.sessionScoped ? 'session' : <span key="a" className="text-amber-300">none found</span>,
                <span key="t" className="text-slate-400">{(e.sqlTables || []).join(', ') || '—'}</span>,
              ])} />
            </Section>
          )}

          <FileSections f={d.file} commit={d.commit} isPage={!isApi} />
          {isApi && <CalledBy url={url} />}
          <Footer d={d} />
        </>
      )}
    </ExplorerShell>
  );
}

function OnThisPage({ isApi }: { isApi: boolean }) {
  const items = [['guide', 'Guide'], ['purpose', 'Purpose'], ['architecture', isApi ? 'Handler' : 'Architecture'], ...(isApi ? [] : [['endpoints', 'APIs called']]), ['data', 'Data flow'], ['components', 'Components'], ['hooks', 'Hooks & state'], ['blocks', 'Code blocks'], ['imports', 'Imports'], ['auth', 'Auth'], ['style', 'Styling'], ['tests', 'Tests']];
  return (
    <nav aria-label="On this page" className="mt-3 flex flex-wrap gap-1">
      {items.map(([id, label]) => <a key={id} href={`#${id}`} className="text-[11px] px-2 py-0.5 rounded border border-slate-800 text-slate-400 hover:text-indigo-300 hover:border-indigo-700">{label}</a>)}
    </nav>
  );
}

function CalledBy({ url }: { url: string }) {
  const [res, setRes] = useState<any>(null);
  // The reverse map (which files fetch this URL) is computed from the file index on the server.
  useEffect(() => { getJson(`${API}/route?url=${encodeURIComponent(url)}&callers=1`).then(setRes).catch(() => setRes(null)); }, [url]);
  if (!res?.callers) return null;
  return (
    <Section id="callers" title="Called by" status={res.callers.length ? 'derived' : 'none-found'}>
      {res.callers.length ? res.callers.map((c: any) => <span key={c.file + c.line} className="block"><FileLink file={c.file} line={c.line} /> <span className="text-slate-500 font-mono text-xs">{c.method}</span></span>)
        : <p className="text-slate-400">No page or component in the tree calls this URL with a literal path. It may be called by a device, a cron job, another server, or a URL built at run time.</p>}
    </Section>
  );
}

function Footer({ d }: { d: any }) {
  return (
    <p className="mt-10 pt-4 border-t border-slate-800 text-xs text-slate-600">
      Generated from commit <code>{d.commit || 'unknown'}</code> at {new Date(d.generatedAt).toLocaleString()}. Regenerated on every build; locally run <code>npm run docs:gen</code>.
      Where this page and the code disagree, the code wins — and the generator has a bug worth fixing.
    </p>
  );
}

/** Shown for a URL prefix that is not itself a route (e.g. /academics with no page). */
function RouteIndex({ url }: { url: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-300">
      <p><code>{url}</code> is not a route in this build — it is a folder grouping the routes in the tree on the left.</p>
    </div>
  );
}

// ─── Reference home ──────────────────────────────────────────────────────────

const SECTION_LABEL: Record<string, string> = {
  purpose: 'Purpose (header comment)', architecture: 'Architecture', dataFlow: 'Data flow', components: 'Components',
  hooks: 'Hooks & state', permissions: 'Auth & permissions', tests: 'Tests',
};

const TASKS: Array<{ q: string; href: string; how: string }> = [
  { q: 'Where does the attendance page load its data?', href: '/control/docs/routes/attendance#data', how: 'Route view → Data flow: each request, the line it is on, and the API route that answers it.' },
  { q: 'What does a protected layout actually do?', href: '/control/docs/files/src/app/(protected)/layout.tsx', how: 'File view of the layout, with a guide — it wraps no page; protection is middleware plus each API.' },
  { q: 'Which hook handles this interaction?', href: '/control/docs/routes/attendance/settings#hooks', how: 'Hooks & state lists every hook by source and every useState with its setter and owner; search finds custom hooks by name.' },
  { q: 'How do I add a custom tab?', href: '/control/docs/playbook-tab', how: 'Step-by-step on /attendance/settings, the reference implementation.' },
  { q: 'Where do I put a new API call or business rule?', href: '/control/docs/routes/attendance/settings#guide', how: 'The teaching example’s “Where does new code go?” table.' },
  { q: 'Which test covers this component?', href: '/control/docs/files/src/lib/attendance/day-overrides.ts#tests', how: 'Every file view ends with the tests that import it and the tests of what it imports.' },
];

function ReferenceHome() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  useEffect(() => { getJson(`${API}/tree?kind=page`).then(setD).catch(setErr); }, []);
  return (
    <>
      <h1 className="text-2xl font-extrabold text-slate-100">Route &amp; file reference</h1>
      <p className="mt-1 text-sm text-slate-400 max-w-3xl">
        Every page, API route and source file in DRAIS, documented from the code itself and regenerated on every build.
        Hand-written guides sit on top of chosen routes. Pick a route on the left, or search above.
      </p>
      {err && <div className="mt-4"><NotGenerated err={err} /></div>}
      {d && (
        <>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[['Pages', d.stats.pages], ['API routes', d.stats.apiRoutes], ['Source files', d.stats.files], ['Test files', d.stats.tests]].map(([k, v]) => (
              <div key={k as string} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-2xl font-extrabold text-slate-100">{v as number}</p>
                <p className="text-xs text-slate-500">{k as string}</p>
              </div>
            ))}
          </div>

          <Section id="tasks" title="Common tasks">
            <ul className="space-y-2">
              {TASKS.map((t) => (
                <li key={t.q}><Link href={t.href} className="font-semibold text-indigo-300 hover:underline">{t.q}</Link><span className="block text-xs text-slate-400">{t.how}</span></li>
              ))}
            </ul>
          </Section>

          <Section id="coverage" title="How complete the page documentation is">
            <Grid head={['Section', ...Object.keys(STATUS).map((s) => STATUS[s].label)]} rows={Object.entries(d.coverage).map(([section, counts]: [string, any]) => [
              SECTION_LABEL[section] || section, ...Object.keys(STATUS).map((s) => counts[s] || ''),
            ])} />
            <p className="mt-2 text-xs text-slate-500">
              Counts of {d.stats.pages} pages. <em>needs manual review</em> means the analyser met something it could not read with
              confidence (a URL built from a function parameter, a component passed through props) — the page says where.
              A route is not &ldquo;documented&rdquo; because it has a title: these are the criteria.
            </p>
          </Section>

          <Section id="problems" title="Problems the generator found">
            <ul className="list-disc pl-5 space-y-1">
              <li>{d.stats.missingEndpoints} requests to API routes that do not exist.</li>
              <li>{d.stats.brokenImports} imports that do not resolve (or resolve only on case-insensitive disks).</li>
              <li>{d.stats.unresolvedRequests} request URLs built at run time that need reading by hand.</li>
            </ul>
            <p className="mt-2 text-xs text-slate-500">Search with the <em>Problems</em> category to list them with file and line. Explained in <Link href="/control/docs/anti-patterns" className="text-indigo-300">Conventions to avoid</Link>.</p>
          </Section>

          <Section id="guides" title="Hand-written guides">
            <ul className="space-y-1">
              {GUIDE_INDEX.map((g) => <li key={g.target}><Link href={g.target.startsWith('/') ? routeHref(g.target) : fileHref(g.target)} className="text-indigo-300 hover:underline">{g.title}</Link> <span className="text-xs text-slate-500 font-mono">{g.target}</span></li>)}
            </ul>
            <p className="mt-2 text-xs text-slate-500">Add one in <code>src/app/control/docs/routes/guide-index.ts</code> + <code>guides.tsx</code>; <code>npm run test:devdocs</code> fails if its target disappears.</p>
          </Section>

          <p className="mt-8 text-xs text-slate-600">The root route <code>/</code> is <FileLink file="src/app/page.tsx" />. Index generated from commit <code>{d.commit || 'unknown'}</code> at {new Date(d.generatedAt).toLocaleString()}.</p>
        </>
      )}
    </>
  );
}

export function ReferenceHomeView() {
  return <ExplorerShell active="/"><ReferenceHome /></ExplorerShell>;
}

// ─── File view ───────────────────────────────────────────────────────────────

export function FileView({ path }: { path: string }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<any>(null);
  useEffect(() => { if (!path) return; setD(null); setErr(null); getJson(`${API}/file?path=${encodeURIComponent(path)}`).then(setD).catch(setErr); }, [path]);
  useHashScroll(d);
  const router = useRouter();
  const routeUrl = d?.file.route && (d.file.route.special === 'page' || d.file.route.special === 'route') ? d.file.route.url : null;
  const parts = path.split('/');
  return (
    <ExplorerShell active={routeUrl || ''} defaultKind={path.startsWith('src/app/api/') ? 'api' : 'page'}>
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500 mb-2 flex flex-wrap items-center gap-1 font-mono">
        {parts.map((p, i) => <React.Fragment key={i}>{i > 0 && <span>/</span>}<span className={i === parts.length - 1 ? 'text-slate-300' : ''}>{p}</span></React.Fragment>)}
      </nav>
      {!path && <FilesHome />}
      {err && <NotGenerated err={err} />}
      {path && !d && !err && <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Reading {path}…</p>}
      {d && (
        <>
          <Header f={d.file} commit={d.commit} title={parts[parts.length - 1]} sub={routeUrl && (
            <button onClick={() => router.push(routeHref(routeUrl))} className="text-indigo-300 hover:underline">route view: {routeUrl}</button>
          )} />
          <Guide target={path} />
          <Purpose f={d.file} />
          <Section id="dependants" title={`Used by (${d.dependantCount})`} status={d.dependantCount ? 'derived' : 'none-found'}>
            {d.dependantCount ? (
              <>
                {d.dependantCount > 10 && <p className="mb-2 text-amber-300">Shared by {d.dependantCount} files — a change here reaches all of them. Check each before changing props or behaviour.</p>}
                <Grid head={['File', 'Route', 'Lines']} rows={d.dependants.map((x: any) => [<FileLink key="f" file={x.file} />, x.route ? <Link key="r" href={routeHref(x.route.url)} className="font-mono text-indigo-300">{x.route.url}</Link> : '', x.lines])} />
                {d.dependantCount > d.dependants.length && <p className="text-xs text-slate-500 mt-1">First {d.dependants.length} shown.</p>}
              </>
            ) : <p className="text-slate-400">{d.file.route ? 'Nothing imports it — Next.js loads it by its position in src/app.' : 'Nothing imports this file. It may be dead code, loaded dynamically, or an entry point.'}</p>}
          </Section>
          <FileSections f={d.file} commit={d.commit} isPage={d.file.route?.special === 'page'} />
          <Footer d={d} />
        </>
      )}
    </ExplorerShell>
  );
}

function FilesHome() {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-300">
      Pick a route in the tree or search for a file, component or hook. Every source file under <code>src/</code> has a page here.
    </div>
  );
}
