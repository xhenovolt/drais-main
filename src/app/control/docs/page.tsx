'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen, ChevronRight, ShieldAlert, FileCode2 } from 'lucide-react';
import { CONTROL_DOCS, DOC_SECTIONS } from './ControlDoc';

export default function ControlDocsIndex() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2.5 mb-2">
        <BookOpen className="w-6 h-6 text-indigo-400" />
        <h1 className="text-3xl font-extrabold text-slate-100">Engineering Documentation</h1>
      </div>
      <p className="text-slate-400 max-w-3xl">
        Architecture, decisions, boundaries and operations — the documentation an engineer needs to work on
        DRAIS without breaking something they could not see.
      </p>

      <div className="not-prose mt-6 rounded-xl border border-rose-800/60 bg-rose-950/40 p-5 max-w-3xl">
        <div className="flex items-center gap-2 font-bold text-sm text-rose-300 mb-2">
          <ShieldAlert className="w-4 h-4" />
          Xhenvolt internal — do not surface to schools
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">
          This section is gated by the Control Center session. Developer and architectural documentation lives
          here and nowhere else. School-facing how-tos belong at <code className="text-indigo-300">/help/guides</code>;
          public product documentation belongs on the marketing site. Do not copy schema, invariants,
          credentials or operational constraints into either.
        </p>
      </div>

      <div className="not-prose mt-4 flex items-start gap-2.5 rounded-xl border border-slate-800 bg-slate-900/60 p-5 max-w-3xl">
        <FileCode2 className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <p className="text-sm text-slate-400 leading-relaxed">
          These pages are an <strong className="text-slate-200">orientation layer</strong> over the sources of
          truth in the repository — <code className="text-indigo-300">docs/adr/*</code> and the subsystem
          READMEs under <code className="text-indigo-300">src/lib/&lt;subsystem&gt;/README.md</code>. Where a page
          and the repo disagree, <strong className="text-slate-200">the repo wins</strong>. Every page names the
          file it summarises.
        </p>
      </div>

      {DOC_SECTIONS.map((section) => (
        <section key={section} className="mt-10">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">{section}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {CONTROL_DOCS.filter((d) => d.section === section).map((d) => (
              <Link
                key={d.slug}
                href={`/control/docs/${d.slug}`}
                className="group flex items-start gap-3 p-5 rounded-2xl border border-slate-800 hover:border-indigo-700 bg-slate-900/60 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-100 text-sm group-hover:text-indigo-300 transition-colors">
                    {d.title}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{d.blurb}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-all" />
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="mt-12">
        <h2 className="text-lg font-bold text-slate-100 mb-3">Reading order for someone new</h2>
        <ol className="text-sm text-slate-300 space-y-2 list-decimal pl-5">
          <li><Link href="/control/docs/architecture" className="text-indigo-400">Architecture overview</Link> — what the system is and why it is shaped this way.</li>
          <li><Link href="/control/docs/decisions" className="text-indigo-400">Key decisions</Link> — the ADRs. Intent cannot be read from code.</li>
          <li><Link href="/control/docs/security" className="text-indigo-400">Auth &amp; tenancy</Link> — before touching anything that reads school data.</li>
          <li><Link href="/control/docs/subsystems" className="text-indigo-400">Subsystem map</Link> — then the README of whichever folder you are working in.</li>
          <li><code className="text-indigo-300">CONTRIBUTING.md</code> — setup, tests, migrations, git workflow.</li>
        </ol>
      </section>
    </div>
  );
}
