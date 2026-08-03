'use client';

/**
 * Control Center engineering documentation shell.
 *
 * DEVELOPER + ARCHITECTURAL documentation lives here and ONLY here. It is
 * gated by the Control Center session (see src/app/control/layout.tsx), which
 * is the isolated Xhenvolt security domain — never the school session.
 *
 * School-facing how-to documentation belongs at /help/guides. Public product
 * documentation belongs on the marketing site. Do not surface architecture,
 * schema, invariants or operational constraints on either of those.
 *
 * These pages are an orientation layer over the in-repo sources of truth
 * (docs/adr/*, src/lib/<subsystem>/README.md). Where they disagree, the repo
 * wins — every page links to the file it summarises.
 */

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, ChevronRight, BookOpen, Info, AlertTriangle,
  Lightbulb, ShieldAlert, FileCode2,
} from 'lucide-react';

export interface DocMeta {
  slug: string;
  title: string;
  blurb: string;
  section: string;
}

export const CONTROL_DOCS: DocMeta[] = [
  { slug: 'architecture',  section: 'System',      title: 'Architecture overview', blurb: 'What DRAIS is, how the pieces fit, and the constraints that shaped them.' },
  { slug: 'decisions',     section: 'System',      title: 'Key decisions',         blurb: 'The ADRs that explain why the system is built this way.' },
  { slug: 'subsystems',    section: 'System',      title: 'Subsystem map',         blurb: 'What lives where under src/lib, and which invariant governs each.' },
  { slug: 'security',      section: 'Boundaries',  title: 'Auth & tenancy',        blurb: 'Three separate auth domains, and how tenant isolation is enforced.' },
  { slug: 'data',          section: 'Boundaries',  title: 'Data & migrations',     blurb: 'Dual DB mode, migrations, soft delete, and the timezone rule.' },
  { slug: 'platform-api',  section: 'Interfaces',  title: 'Platform API v1',       blurb: 'The frozen external contract, and what may never change in it.' },
  { slug: 'operations',    section: 'Interfaces',  title: 'Build & operations',    blurb: 'Deploy targets, the one-cron constraint, jobs, and the build memory ceiling.' },
];

export const DOC_SECTIONS = Array.from(new Set(CONTROL_DOCS.map((d) => d.section)));

// ─── Blocks ──────────────────────────────────────────────────────────────────

type Kind = 'note' | 'warning' | 'tip' | 'invariant';

const KIND: Record<Kind, { icon: React.ElementType; cls: string; fg: string; label: string }> = {
  note:      { icon: Info,        cls: 'border-sky-800/60 bg-sky-950/40',       fg: 'text-sky-300',    label: 'Note' },
  warning:   { icon: AlertTriangle, cls: 'border-amber-800/60 bg-amber-950/40', fg: 'text-amber-300',  label: 'Careful' },
  tip:       { icon: Lightbulb,   cls: 'border-indigo-800/60 bg-indigo-950/40', fg: 'text-indigo-300', label: 'Context' },
  invariant: { icon: ShieldAlert, cls: 'border-rose-800/60 bg-rose-950/40',     fg: 'text-rose-300',   label: 'Invariant' },
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

// ─── Shell ───────────────────────────────────────────────────────────────────

export default function ControlDoc({ slug, children }: { slug: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const meta = CONTROL_DOCS.find((d) => d.slug === slug);
  const idx = CONTROL_DOCS.findIndex((d) => d.slug === slug);
  const prev = idx > 0 ? CONTROL_DOCS[idx - 1] : null;
  const next = idx >= 0 && idx < CONTROL_DOCS.length - 1 ? CONTROL_DOCS[idx + 1] : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link
        href="/control/docs"
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-indigo-300 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Engineering docs
      </Link>

      <h1 className="text-3xl font-extrabold text-slate-100">{meta?.title ?? 'Documentation'}</h1>
      {meta && <p className="text-slate-400 mt-1.5">{meta.blurb}</p>}

      <div className="flex gap-10 mt-8">
        <nav className="hidden lg:block w-60 shrink-0">
          <div className="sticky top-20">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-4 h-4 text-indigo-400" />
              <span className="font-bold text-sm text-slate-200">Contents</span>
            </div>
            {DOC_SECTIONS.map((section) => (
              <div key={section} className="mb-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 px-2">{section}</p>
                <ul className="space-y-0.5">
                  {CONTROL_DOCS.filter((d) => d.section === section).map((d) => {
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
              prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:text-slate-100
              prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-2.5 prose-h3:text-slate-200
              prose-p:text-slate-300 prose-p:leading-relaxed
              prose-li:text-slate-300
              prose-strong:text-slate-100
              prose-a:text-indigo-400
              prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:text-indigo-300
              prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-800"
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
        </main>
      </div>
    </div>
  );
}
