'use client';

/**
 * DRAIS Knowledge System — document shell and content primitives.
 *
 * Navigation, prev/next and cross-links are driven by ./registry.ts. Adding a
 * page means a registry entry plus a route; nothing here needs editing.
 *
 * SCOPE: Xhenvolt-internal developer documentation, gated by the Control
 * Center session (src/app/control/layout.tsx). School-facing how-tos live at
 * /help/guides; public product docs live on the marketing site.
 */

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, ChevronRight, BookOpen, Info, AlertTriangle,
  Lightbulb, ShieldAlert, FileCode2, Compass,
} from 'lucide-react';
import { DOCS, DOC_SECTIONS, docBySlug, docsInSection, neighbours } from './registry';

export * from './registry';

// ─── Content primitives ──────────────────────────────────────────────────────

type Kind = 'note' | 'warning' | 'tip' | 'invariant';

const KIND: Record<Kind, { icon: React.ElementType; cls: string; fg: string; label: string }> = {
  note:      { icon: Info,          cls: 'border-sky-800/60 bg-sky-950/40',       fg: 'text-sky-300',    label: 'Note' },
  warning:   { icon: AlertTriangle, cls: 'border-amber-800/60 bg-amber-950/40',   fg: 'text-amber-300',  label: 'Careful' },
  tip:       { icon: Lightbulb,     cls: 'border-indigo-800/60 bg-indigo-950/40', fg: 'text-indigo-300', label: 'Context' },
  invariant: { icon: ShieldAlert,   cls: 'border-rose-800/60 bg-rose-950/40',     fg: 'text-rose-300',   label: 'Invariant' },
};

export function Box({ kind = 'note', title, children }: { kind?: Kind; title?: string; children: React.ReactNode }) {
  const k = KIND[kind];
  const Icon = k.icon;
  return (
    <div className={`not-prose my-6 rounded-xl border p-5 ${k.cls}`}>
      <div className={`flex items-center gap-2 font-bold text-sm mb-2 ${k.fg}`}>
        <Icon className="w-4 h-4 shrink-0" />
        {title ?? k.label}
      </div>
      <div className="text-sm text-slate-300 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

/** Pointer to the authoritative file in the repository. */
export function Source({ path, children }: { path: string; children?: React.ReactNode }) {
  return (
    <div className="not-prose my-4 flex items-start gap-2.5 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
      <FileCode2 className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <code className="text-xs font-mono text-indigo-300 break-all">{path}</code>
        {children && <p className="text-xs text-slate-400 mt-1 leading-relaxed">{children}</p>}
      </div>
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-900">
            {head.map((h, i) => (
              <th key={i} className="text-left px-4 py-2.5 font-bold text-slate-200 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 ? 'bg-slate-900/40' : 'bg-slate-900/10'}>
              {r.map((c, j) => (
                <td key={j} className="align-top px-4 py-3 text-slate-300 leading-relaxed">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** ASCII flow diagram. Scrolls rather than wrapping — wrapped diagrams are unreadable. */
export function Diagram({ children, caption }: { children: string; caption?: string }) {
  return (
    <figure className="not-prose my-6">
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-5">
        <pre className="text-[12.5px] leading-relaxed text-slate-300 font-mono whitespace-pre">{children}</pre>
      </div>
      {caption && <figcaption className="text-xs text-slate-500 mt-2">{caption}</figcaption>}
    </figure>
  );
}

/** Cross-link block. Use liberally — moving between topics is the point. */
export function SeeAlso({ slugs, children }: { slugs: string[]; children?: React.ReactNode }) {
  const docs = slugs.map(docBySlug).filter(Boolean) as ReturnType<typeof docBySlug>[];
  return (
    <div className="not-prose my-6 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">See also</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {docs.map((d) => d && (
          <Link
            key={d.slug}
            href={`/control/docs/${d.slug}`}
            className="group flex items-start gap-2 text-sm text-slate-300 hover:text-indigo-300"
          >
            <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-600 group-hover:text-indigo-400" />
            <span><span className="font-semibold">{d.title}</span> — <span className="text-slate-400">{d.blurb}</span></span>
          </Link>
        ))}
      </div>
      {children && <div className="text-sm text-slate-400 mt-3 leading-relaxed">{children}</div>}
    </div>
  );
}

/** The five questions every architecture guide must answer. */
export function FiveQuestions({
  what, why, how, where, extend,
}: { what: React.ReactNode; why: React.ReactNode; how: React.ReactNode; where: React.ReactNode; extend: React.ReactNode }) {
  const rows: Array<[string, React.ReactNode]> = [
    ['What', what], ['Why', why], ['How', how], ['Where', where], ['Extending', extend],
  ];
  return (
    <div className="not-prose my-6 rounded-xl border border-indigo-900/60 bg-indigo-950/20 divide-y divide-indigo-900/40">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col sm:flex-row gap-2 sm:gap-5 p-4">
          <p className="w-24 shrink-0 text-xs font-bold uppercase tracking-wider text-indigo-400 pt-0.5">{k}</p>
          <div className="text-sm text-slate-300 leading-relaxed flex-1 min-w-0">{v}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Shell ───────────────────────────────────────────────────────────────────

export default function ControlDoc({ slug, children }: { slug: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const meta = docBySlug(slug);
  const { prev, next } = neighbours(slug);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link
        href="/control/docs"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-indigo-300 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Knowledge base
      </Link>

      <h1 className="text-3xl font-extrabold text-slate-100">{meta?.title ?? 'Documentation'}</h1>
      {meta && (
        <>
          <p className="text-slate-400 mt-1.5 max-w-3xl">{meta.blurb}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {meta.topics.map((t) => (
              <span key={t} className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded bg-slate-800 text-slate-400">
                {t}
              </span>
            ))}
            <span className="text-xs text-slate-600 ml-1">{meta.minutes} min read</span>
          </div>
        </>
      )}

      <div className="flex gap-10 mt-8">
        <nav className="hidden lg:block w-60 shrink-0">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
            <Link href="/control/docs" className="flex items-center gap-2 mb-4 text-slate-200 hover:text-indigo-300">
              <BookOpen className="w-4 h-4 text-indigo-400" />
              <span className="font-bold text-sm">Knowledge base</span>
            </Link>
            {DOC_SECTIONS.map((section) => (
              <div key={section} className="mb-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 px-2">{section}</p>
                <ul className="space-y-0.5">
                  {docsInSection(section).map((d) => {
                    const href = `/control/docs/${d.slug}`;
                    const active = pathname === href;
                    return (
                      <li key={d.slug}>
                        <Link
                          href={href}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                            active
                              ? 'bg-indigo-500/15 text-indigo-300 font-semibold'
                              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                          }`}
                        >
                          <ChevronRight className="w-3 h-3 shrink-0" />
                          {d.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <main className="flex-1 min-w-0">
          <article
            className="prose prose-invert max-w-none
              prose-headings:font-extrabold
              prose-h2:text-2xl prose-h2:mt-9 prose-h2:mb-4 prose-h2:text-slate-100
              prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-2.5 prose-h3:text-slate-200
              prose-h4:text-base prose-h4:mt-5 prose-h4:mb-2 prose-h4:text-slate-300
              prose-p:text-slate-300 prose-p:leading-relaxed
              prose-li:text-slate-300
              prose-strong:text-slate-100
              prose-a:text-indigo-400
              prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:text-indigo-300
              prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800"
          >
            {children}
          </article>

          <div className="mt-12 pt-6 border-t border-slate-800 flex flex-col sm:flex-row gap-3 justify-between">
            {prev ? (
              <Link href={`/control/docs/${prev.slug}`} className="group flex items-center gap-3 p-4 rounded-xl border border-slate-800 hover:border-indigo-700 bg-slate-900/60 transition-colors flex-1">
                <ArrowLeft className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">Previous</p>
                  <p className="text-sm font-bold text-slate-200 truncate">{prev.title}</p>
                </div>
              </Link>
            ) : <div className="flex-1" />}
            {next ? (
              <Link href={`/control/docs/${next.slug}`} className="group flex items-center gap-3 p-4 rounded-xl border border-slate-800 hover:border-indigo-700 bg-slate-900/60 transition-colors flex-1 sm:justify-end sm:text-right">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">Next</p>
                  <p className="text-sm font-bold text-slate-200 truncate">{next.title}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 shrink-0" />
              </Link>
            ) : <div className="flex-1" />}
          </div>

          <p className="mt-8 text-xs text-slate-600 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5" />
            {DOCS.length} documents. Where this and the repository disagree, the repository wins.
          </p>
        </main>
      </div>
    </div>
  );
}
