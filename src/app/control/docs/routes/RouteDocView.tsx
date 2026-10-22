'use client';

/**
 * Renders a hand-written route document (src/lib/devdocs/route-doc.ts): the template
 * sections A–P, and the implementation walkthrough — every import, declaration and
 * member of every file the route depends on, the real code beside its explanation.
 * A unit with no explanation is shown as such, never silently skipped.
 */
import React from 'react';
import Link from 'next/link';
import { lineRanges, unitSpans, codeLineNumbers, lineCoverage, compressLines, SHORT_UNIT_LINES, type LineRange } from '@/lib/devdocs/route-doc';

const TAG: Record<string, string> = {
  defect: 'bg-rose-950/60 text-rose-300 border-rose-800/60',
  recommended: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
  illustrative: 'bg-sky-950/60 text-sky-300 border-sky-800/60',
  unverified: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
};
const TAG_LABEL: Record<string, string> = { defect: 'known defect', recommended: 'recommended', illustrative: 'illustrative — not DRAIS code', unverified: 'unverified' };

/** `code`, **bold**, [tag] markers. */
function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\[(defect|recommended|illustrative|unverified)\])/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('`')) out.push(<code key={k++} className="rounded bg-slate-800 px-1 py-0.5 text-[0.85em] text-indigo-300">{t.slice(1, -1)}</code>);
    else if (t.startsWith('**')) out.push(<strong key={k++} className="text-slate-100">{t.slice(2, -2)}</strong>);
    else out.push(<span key={k++} className={`mx-0.5 inline-block rounded border px-1.5 text-[10px] font-semibold uppercase tracking-wide align-middle ${TAG[m[2]]}`}>{TAG_LABEL[m[2]]}</span>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Paragraphs separated by blank lines; lines starting "- " form lists. */
export function Md({ text }: { text: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-300">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*- /.test(l) || !l.trim())) {
          return <ul key={i} className="list-disc space-y-1 pl-5">{lines.filter((l) => l.trim()).map((l, j) => <li key={j}>{inline(l.replace(/^\s*- /, ''))}</li>)}</ul>;
        }
        const head = lines.filter((l) => !/^\s*- /.test(l));
        const items = lines.filter((l) => /^\s*- /.test(l));
        return (
          <div key={i}>
            <p>{inline(head.join(' '))}</p>
            {items.length > 0 && <ul className="mt-1 list-disc space-y-1 pl-5">{items.map((l, j) => <li key={j}>{inline(l.replace(/^\s*- /, ''))}</li>)}</ul>}
          </div>
        );
      })}
    </div>
  );
}

const STATUS_CLS: Record<string, string> = {
  'NOT STARTED': 'border-slate-700 bg-slate-800 text-slate-400',
  'IN PROGRESS': 'border-amber-800/60 bg-amber-950/50 text-amber-300',
  DOCUMENTED: 'border-sky-800/60 bg-sky-950/50 text-sky-300',
  'NEEDS REVIEW': 'border-rose-800/60 bg-rose-950/50 text-rose-300',
  VERIFIED: 'border-emerald-800/60 bg-emerald-950/50 text-emerald-300',
};
export function DocStatus({ status, reasons }: { status: string; reasons?: string[] }) {
  return (
    <span title={(reasons || []).join('\n')} className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_CLS[status] || STATUS_CLS['NOT STARTED']}`}>
      {status}
    </span>
  );
}

function Section({ id, letter, title, children }: { id: string; letter: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-8 scroll-mt-24">
      <h2 className="mb-3 flex items-baseline gap-2 text-lg font-extrabold text-slate-100">
        <span className="font-mono text-sm text-indigo-400">{letter}</span>{title}
      </h2>
      {children}
    </section>
  );
}

const fileHref = (file: string, line?: number) => `/control/docs/files/${file.split('/').map(encodeURIComponent).join('/')}${line ? `#L${line}` : ''}`;

// ─── Walkthrough ─────────────────────────────────────────────────────────────

function Code({ lines, from, to }: { lines: string[]; from: number; to: number }) {
  return (
    <pre className="max-h-[32rem] overflow-auto rounded-lg border border-slate-800 bg-slate-950 py-2 text-[12px] leading-5">
      {lines.slice(from - 1, to).map((l, i) => (
        <div key={i} className="flex">
          <span className="w-12 shrink-0 select-none pr-3 text-right text-slate-600">{from + i}</span>
          <code className="whitespace-pre text-slate-300">{l}</code>
        </div>
      ))}
    </pre>
  );
}

/** A unit whose code is explained line by line: consecutive slices, each beside its own note. */
function LineSlices({ lines, from, to, ranges, notes, codeLines, strict, uncovered }: {
  lines: string[]; from: number; to: number; ranges: LineRange[]; notes: Record<string, string>; codeLines: Set<number>; strict: boolean;
  /** Line-level files: the code lines the coverage check reports as unexplained (only these are flagged). */
  uncovered?: Set<number>;
}) {
  const slices: Array<{ from: number; to: number; key?: string }> = [];
  let at = from;
  for (const r of ranges) {
    if (r.from > at) slices.push({ from: at, to: r.from - 1 });
    slices.push({ from: r.from, to: Math.min(r.to, to), key: r.key });
    at = Math.min(r.to, to) + 1;
  }
  if (at <= to) slices.push({ from: at, to });
  return (
    <div className="mt-2 space-y-1">
      {slices.map((s) => {
        const nums = Array.from({ length: s.to - s.from + 1 }, (_, i) => s.from + i);
        const hasCode = nums.some((n) => codeLines.has(n));
        // Blank / comment-only gap: nothing to explain and nothing worth a box.
        if (!s.key && !hasCode) return null;
        // A gap the unit note already explains (the unit's own opening / closing line): code only, no warning.
        if (!s.key && uncovered && !nums.some((n) => uncovered.has(n))) return <Code key={s.from} lines={lines} from={s.from} to={s.to} />;
        return (
          <div key={s.from} id={s.key ? `L${s.from}` : undefined} className="scroll-mt-24 grid gap-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Code lines={lines} from={s.from} to={s.to} />
            <div className="min-w-0 text-sm">
              {s.key ? <><p className="mb-0.5 font-mono text-[10px] text-slate-500">lines {s.from}{s.to !== s.from ? `–${s.to}` : ''}</p><Md text={notes[s.key]} /></>
                : <p className={`rounded border p-2 text-xs ${strict ? 'border-rose-800/60 bg-rose-950/40 text-rose-300' : 'border-slate-800 text-slate-500'}`}>No line note for lines {s.from}–{s.to}.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Unit({ id, title, kind, note, lines, from, to, extra, lineNotes }: {
  id: string; title: string; kind: string; note?: string; lines: string[] | null; from: number; to: number; extra?: string;
  lineNotes?: { ranges: LineRange[]; notes: Record<string, string>; codeLines: Set<number>; strict: boolean; uncovered?: Set<number> };
}) {
  if (lines && lineNotes && (lineNotes.ranges.length || lineNotes.strict)) {
    return (
      <div id={id} className="scroll-mt-24 border-t border-slate-800/70 py-4">
        <p className="mb-1 font-mono text-xs text-slate-400">
          <span className="text-slate-100">{title}</span> <span className="text-slate-500">· {kind} · lines {from}–{to}{extra ? ` · ${extra}` : ''}</span>
        </p>
        {note?.trim() ? <div className="max-w-3xl"><Md text={note} /></div> : <p className="rounded border border-rose-800/60 bg-rose-950/40 p-2 text-xs text-rose-300">Not yet explained. This unit counts against the route&apos;s coverage.</p>}
        <LineSlices lines={lines} from={from} to={to} {...lineNotes} />
      </div>
    );
  }
  return (
    <div id={id} className="scroll-mt-24 grid gap-3 border-t border-slate-800/70 py-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="mb-1 font-mono text-xs text-slate-400">
          <span className="text-slate-100">{title}</span> <span className="text-slate-500">· {kind} · lines {from}–{to}{extra ? ` · ${extra}` : ''}</span>
        </p>
        {lines ? <Code lines={lines} from={from} to={to} /> : <p className="text-xs text-slate-500">Source not available in this build.</p>}
      </div>
      <div className="min-w-0">
        {note?.trim() ? <Md text={note} /> : <p className="rounded border border-rose-800/60 bg-rose-950/40 p-2 text-xs text-rose-300">Not yet explained. This unit counts against the route&apos;s coverage.</p>}
      </div>
    </div>
  );
}

export function FileWalkthrough({ path, info, source, notes, role, lineLevel }: { path: string; info: any; source: string | null; notes: Record<string, string>; role?: string; lineLevel?: boolean }) {
  const lines = source ? source.split(/\r?\n/) : null;
  if (!info) return <p className="text-sm text-rose-300">This file no longer exists in the build — the documentation needs review.</p>;
  const imports = (info.imports || []).filter((i: any) => !i.typeOnly);
  const firstImport = Math.min(...imports.map((i: any) => i.line), Infinity);
  const lastImport = Math.max(...imports.map((i: any) => i.line), 0);
  // Line notes: each goes to the innermost unit containing its first line; the rest render at the end.
  const ranges = lineRanges(notes);
  const spans = unitSpans(info);
  const bySpan = new Map<string, LineRange[]>();
  const loose: LineRange[] = [];
  for (const r of ranges) {
    const inner = spans.filter((s) => s.from <= r.from && r.from <= s.to).sort((a, b) => (a.to - a.from) - (b.to - b.from))[0];
    if (inner) bySpan.set(inner.id, [...(bySpan.get(inner.id) || []), r]); else loose.push(r);
  }
  const codeLines = new Set(source ? codeLineNumbers(source) : []);
  const spanById = new Map(spans.map((s) => [s.id, s]));
  const allImportsNoted = imports.every((i: any) => notes[`import:${i.spec}`]?.trim());
  const ln = (spanId: string) => {
    const own = bySpan.get(spanId) || [];
    if (!own.length) {
      if (!lineLevel) return undefined;
      // Already explained as a whole (see lineCoverage): short unit with a note, or fully noted imports.
      const s = spanById.get(spanId);
      if (spanId === 'imports' ? allImportsNoted : !!s && s.to - s.from + 1 <= SHORT_UNIT_LINES && !!notes[spanId]?.trim()) return undefined;
    }
    return { ranges: own, notes, codeLines, strict: !!lineLevel, uncovered: uncoveredSet };
  };
  const lc = lineLevel && source ? lineCoverage(info, source, notes) : null;
  const uncoveredSet = lc ? new Set(lc.uncovered) : undefined;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <Link href={fileHref(path)} className="font-mono text-sm text-indigo-300 hover:underline">{path}</Link>
        <span className="text-xs text-slate-500">{info.lines} lines · {info.directive || (path.includes('/api/') ? 'server (API)' : 'module')}</span>
      </div>
      {role && <p className="mb-3 text-sm text-slate-400">{role}</p>}
      {lc && (
        <p className={`mb-3 text-xs ${lc.uncovered.length ? 'text-amber-300' : 'text-emerald-300'}`}>
          Line-level: {lc.covered} of {lc.code} code lines explained
          {lc.uncovered.length > 0 && <> · missing {compressLines(lc.uncovered).slice(0, 8).map((r) => <a key={r} href={`#L${r.split('–')[0]}`} className="ml-1 underline">{r}</a>)}{lc.uncovered.length > 8 ? ' …' : ''}</>}
        </p>
      )}

      {imports.length > 0 && (
        <div className="border-t border-slate-800/70 py-4">
          <p className="mb-2 font-mono text-xs text-slate-400"><span className="text-slate-100">Imports</span> · lines {firstImport}–{lastImport}</p>
          {lines && (ln('imports') ? <LineSlices lines={lines} from={firstImport} to={lastImport} {...ln('imports')!} /> : <Code lines={lines} from={firstImport} to={lastImport} />)}
          <dl className="mt-3 space-y-2">
            {imports.map((i: any) => (
              <div key={i.spec} id={`${path}:import:${i.spec}`} className="grid gap-1 text-sm sm:grid-cols-[14rem_minmax(0,1fr)]">
                <dt className="break-all font-mono text-xs text-slate-200">{i.spec}<span className="block text-[10px] text-slate-500">{i.category}{i.resolved ? ' · ' : ''}{i.resolved && <Link href={fileHref(i.resolved)} className="text-indigo-400 hover:underline">open</Link>}</span></dt>
                <dd>{notes[`import:${i.spec}`]?.trim() ? <Md text={notes[`import:${i.spec}`]} /> : <span className="text-xs text-rose-300">Not yet explained.</span>}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {(info.declarations || []).map((d: any) => (
        <div key={d.name} className="mt-2">
          <Unit id={`${path}:${d.name}`} title={d.name} kind={d.kind + (d.exported ? ' (exported)' : '')} note={notes[d.name]} lines={lines}
            from={d.start} to={d.members?.length ? Math.max(d.start, d.members[0].start - 1) : d.end} lineNotes={ln(d.name)} />
          {(d.members || []).map((m: any) => (
            <div key={m.name} className="ml-0 border-l-2 border-indigo-900/50 pl-3 sm:ml-4">
              <Unit id={`${path}:${d.name}.${m.name}`} title={`${d.name} › ${m.name}`} kind={m.kind + (m.hook ? ` (${m.hook})` : '')}
                note={notes[`${d.name}.${m.name}`]} lines={lines} from={m.start} to={m.end} extra={m.deps ? `deps ${m.deps}` : undefined} lineNotes={ln(`${d.name}.${m.name}`)} />
            </div>
          ))}
        </div>
      ))}

      {lines && loose.length > 0 && (
        <div className="border-t border-slate-800/70 py-4">
          <p className="mb-2 font-mono text-xs text-slate-400"><span className="text-slate-100">Lines between units</span></p>
          {loose.map((r) => (
            <div key={r.key} id={`L${r.from}`} className="scroll-mt-24 mb-2 grid gap-2 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <Code lines={lines} from={r.from} to={r.to} />
              <div className="min-w-0 text-sm"><Md text={notes[r.key]} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Route document ──────────────────────────────────────────────────────────

export const DOC_SECTIONS: Array<[string, string, string]> = [
  ['doc-a', 'A', 'Route identity'], ['doc-b', 'B', 'File map'], ['doc-c', 'C', 'Layout inheritance'], ['doc-d', 'D', 'Component tree'],
  ['doc-walk', 'E–H', 'Implementation walkthrough'], ['doc-i', 'I', 'Rendered UI'], ['doc-j', 'J', 'Interactions'], ['doc-k', 'K', 'Data contracts'],
  ['doc-l', 'L', 'Loading, empty and error states'], ['doc-m', 'M', 'Security and business rules'], ['doc-n', 'N', 'Styling and responsive behaviour'],
  ['doc-o', 'O', 'Testing and debugging'], ['doc-p', 'P', 'Safe extension guide'],
];

export function RouteDocument({ routeDoc, walkthrough }: { routeDoc: { doc: any; status: string; reasons: string[] }; walkthrough: any[] }) {
  const { doc } = routeDoc;
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-900/60 bg-indigo-950/20 p-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">Route documentation</span>
        <DocStatus status={routeDoc.status} reasons={routeDoc.reasons} />
        {routeDoc.reasons.length > 0 && <span className="text-xs text-slate-400">{routeDoc.reasons.slice(0, 3).join(' · ')}</span>}
        <nav className="ml-auto flex flex-wrap gap-1" aria-label="Sections">
          {DOC_SECTIONS.map(([id, letter, title]) => (
            <a key={id} href={`#${id}`} title={title} className="rounded border border-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-400 hover:border-indigo-700 hover:text-indigo-300">{letter}</a>
          ))}
        </nav>
      </div>

      <Section id="doc-a" letter="A" title="Route identity">
        <dl className="grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
          {([['Purpose', doc.identity.purpose], ['Users', doc.identity.users], ['Permissions', doc.identity.permissions], ['Depends on', doc.identity.upstream], ['Leads to', doc.identity.downstream]] as const).map(([k, v]) => (
            <React.Fragment key={k}><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">{k}</dt><dd><Md text={v} /></dd></React.Fragment>
          ))}
        </dl>
      </Section>

      <Section id="doc-b" letter="B" title="File map">
        <ul className="space-y-2">
          {doc.files.map((f: any) => (
            <li key={f.path} className="text-sm">
              <a href={`#${f.path}`} className="font-mono text-xs text-indigo-300 hover:underline">{f.path}</a>
              <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-500">{f.shared ? 'shared' : 'route-specific'}</span>
              <div className="mt-0.5"><Md text={f.role} /></div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="doc-c" letter="C" title="Layout inheritance"><Md text={doc.layout} /></Section>
      <Section id="doc-d" letter="D" title="Component tree">
        <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-[12px] leading-5 text-slate-300">{doc.tree}</pre>
      </Section>

      <Section id="doc-walk" letter="E–H" title="Implementation walkthrough — imports, hooks and state, functions, code blocks">
        <p className="mb-4 text-sm text-slate-400">Every import, top-level declaration and statement inside each component or hook, in source order, with the code on the left and what it does on the right.</p>
        {walkthrough.map((w) => (
          <div key={w.path} id={w.path} className="mb-10 scroll-mt-24 rounded-xl border border-slate-800 bg-slate-900/30 p-4">
            <FileWalkthrough path={w.path} info={w.info} source={w.source} notes={w.notes} role={w.role} lineLevel={w.lineLevel} />
          </div>
        ))}
      </Section>

      <Section id="doc-i" letter="I" title="Rendered UI">
        <div className="space-y-4">{doc.ui.map((u: any) => <div key={u.title}><h3 className="mb-1 text-sm font-bold text-slate-200">{u.title}</h3><Md text={u.text} /></div>)}</div>
      </Section>
      <Section id="doc-j" letter="J" title="Interactions — from the click to the database and back">
        <div className="space-y-4">
          {doc.interactions.map((x: any) => (
            <div key={x.action}>
              <h3 className="mb-1 text-sm font-bold text-slate-200">{x.action}</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">{x.steps.map((s: string, i: number) => <li key={i}>{inline(s)}</li>)}</ol>
            </div>
          ))}
        </div>
      </Section>
      <Section id="doc-k" letter="K" title="Data contracts"><Md text={doc.data} /></Section>
      <Section id="doc-l" letter="L" title="Loading, empty and error states"><Md text={doc.states} /></Section>
      <Section id="doc-m" letter="M" title="Security and business rules"><Md text={doc.security} /></Section>
      <Section id="doc-n" letter="N" title="Styling and responsive behaviour"><Md text={doc.styling} /></Section>
      <Section id="doc-o" letter="O" title="Testing and debugging"><Md text={doc.testing} /></Section>
      <Section id="doc-p" letter="P" title="Safe extension guide">
        <div className="space-y-3">{doc.extend.map((e: any) => <div key={e.change}><h3 className="mb-1 text-sm font-bold text-slate-200">{e.change}</h3><Md text={e.how} /></div>)}</div>
      </Section>
    </div>
  );
}
