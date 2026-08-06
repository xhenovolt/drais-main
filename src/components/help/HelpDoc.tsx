'use client';

/**
 * In-app school-scope documentation.
 *
 * These guides are TASK-ORIENTED how-tos for school staff — "how do I do this,
 * right now, in this system". They differ from the public product documentation
 * on the marketing site in one important way: they deep-link straight into the
 * actual screens via <GoTo>, which a public site cannot do.
 *
 * Scope rule: school-facing only. Developer and architectural documentation
 * lives in the Control Center (/control/docs) and must never be surfaced here.
 */

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, ChevronRight, Info, AlertTriangle, Lightbulb,
  CheckCircle2, BookOpen, ExternalLink,
} from 'lucide-react';

// ─── Guide registry ──────────────────────────────────────────────────────────
// Single source of truth for the sidebar, the hub cards and prev/next links.

export interface GuideMeta {
  slug: string;
  title: string;
  blurb: string;
  minutes: number;
  section: string;
}

export const GUIDES: GuideMeta[] = [
  { slug: 'first-week',        section: 'Start here', title: 'Your first week',            blurb: 'The order to set things up in so nothing has to be redone.',            minutes: 8 },
  { slug: 'learners',          section: 'Learners',   title: 'Learners day to day',        blurb: 'Admitting, transferring, promoting, leavers and duplicates.',           minutes: 9 },
  { slug: 'enrol-fingerprints',section: 'Attendance', title: 'Enrolling fingerprints',     blurb: 'Getting fingerprints onto a device and fixing wrong identity links.',   minutes: 8 },
  { slug: 'attendance-daily',  section: 'Attendance', title: 'Attendance day to day',      blurb: 'The register, absences, corrections and the reports staff ask for.',    minutes: 8 },
  { slug: 'marks-and-reports', section: 'Academics',  title: 'Marks and report cards',     blurb: 'Entering marks, generating report cards and printing them.',            minutes: 9 },
  { slug: 'fees',              section: 'Finance',    title: 'Fees and payments',          blurb: 'Billing a term, recording payments, receipts and balances.',            minutes: 8 },
  { slug: 'messages',          section: 'Comms',      title: 'Messaging guardians',        blurb: 'Arrival alerts, absence notices and bulk SMS — without wasting credits.', minutes: 7 },
  { slug: 'users-and-access',  section: 'Admin',      title: 'Staff accounts and access',  blurb: 'Adding staff, choosing roles, and who should see what.',                minutes: 6 },
  { slug: 'recover-data',      section: 'Admin',      title: 'Recovering data',            blurb: 'Trash, backups and the audit log — when something goes missing.',       minutes: 6 },
  { slug: 'fix-problems',      section: 'Help',       title: 'Fixing common problems',     blurb: 'What the usual symptoms actually turn out to be.',                      minutes: 9 },
];

export const SECTIONS = Array.from(new Set(GUIDES.map((g) => g.section)));

export function guideBySlug(slug: string) {
  return GUIDES.find((g) => g.slug === slug);
}

// ─── Content blocks ──────────────────────────────────────────────────────────

type CalloutKind = 'note' | 'warning' | 'tip' | 'success';

const CALLOUT: Record<CalloutKind, { icon: React.ElementType; cls: string; fg: string; label: string }> = {
  note:    { icon: Info,          cls: 'border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40',          fg: 'text-blue-700 dark:text-blue-300',       label: 'Note' },
  warning: { icon: AlertTriangle, cls: 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40',      fg: 'text-amber-700 dark:text-amber-300',     label: 'Important' },
  tip:     { icon: Lightbulb,     cls: 'border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40',  fg: 'text-indigo-700 dark:text-indigo-300',   label: 'Tip' },
  success: { icon: CheckCircle2,  cls: 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40', fg: 'text-emerald-700 dark:text-emerald-300', label: 'Good to know' },
};

export function Callout({
  kind = 'note', title, children,
}: { kind?: CalloutKind; title?: string; children: React.ReactNode }) {
  const c = CALLOUT[kind];
  const Icon = c.icon;
  return (
    <div className={`not-prose my-6 rounded-xl border p-5 ${c.cls}`}>
      <div className={`flex items-center gap-2 font-bold text-sm mb-2 ${c.fg}`}>
        <Icon className="w-4 h-4 shrink-0" />
        {title ?? c.label}
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

/** Deep link into the actual screen this guide is talking about. */
export function GoTo({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="not-prose inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-sm font-semibold text-white transition-colors no-underline"
    >
      {children}
      <ExternalLink className="w-3.5 h-3.5" />
    </Link>
  );
}

/** Where something lives in the menus, when a deep link is not appropriate. */
export function Where({ children }: { children: React.ReactNode }) {
  return (
    <span className="not-prose inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-sm font-semibold text-gray-800 dark:text-gray-200">
      {children}
    </span>
  );
}

export function Steps({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <ol className="not-prose my-6 space-y-5">
      {items.map((child, i) => (
        <li key={i} className="flex gap-4">
          <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0 pt-0.5">{child}</div>
        </li>
      ))}
    </ol>
  );
}

export function Step({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="font-bold text-gray-900 dark:text-white text-sm mb-1">{title}</p>
      {children && (
        <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed space-y-2">{children}</div>
      )}
    </div>
  );
}

export function DefTable({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([term, meaning], i) => (
            <tr key={i} className={i % 2 ? 'bg-gray-50 dark:bg-gray-900/50' : 'bg-white dark:bg-gray-900'}>
              <td className="align-top px-4 py-3 font-bold text-gray-900 dark:text-white whitespace-nowrap">{term}</td>
              <td className="align-top px-4 py-3 text-gray-600 dark:text-gray-400 leading-relaxed">{meaning}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export default function HelpDoc({
  slug, children,
}: { slug: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const meta = guideBySlug(slug);
  const idx = GUIDES.findIndex((g) => g.slug === slug);
  const prev = idx > 0 ? GUIDES[idx - 1] : null;
  const next = idx >= 0 && idx < GUIDES.length - 1 ? GUIDES[idx + 1] : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link
            href="/help"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Help Center
          </Link>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">{meta?.title ?? 'Guide'}</h1>
          {meta && (
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {meta.blurb} <span className="text-gray-400 dark:text-gray-600">· {meta.minutes} min read</span>
            </p>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex gap-10">
          {/* Sidebar */}
          <nav className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-6">
              <div className="flex items-center gap-2 mb-5">
                <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span className="font-bold text-gray-900 dark:text-white">Guides</span>
              </div>
              {SECTIONS.map((section) => (
                <div key={section} className="mb-5">
                  <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5 px-2">
                    {section}
                  </p>
                  <ul className="space-y-0.5">
                    {GUIDES.filter((g) => g.section === section).map((g) => {
                      const href = `/help/guides/${g.slug}`;
                      const active = pathname === href;
                      return (
                        <li key={g.slug}>
                          <Link
                            href={href}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                              active
                                ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                            }`}
                          >
                            <ChevronRight className="w-3 h-3 shrink-0" />
                            {g.title}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          {/* Content */}
          <main className="flex-1 min-w-0">
            <article
              className="prose prose-gray dark:prose-invert max-w-none
                prose-headings:font-extrabold
                prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:text-gray-900 dark:prose-h2:text-white
                prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
                prose-p:text-gray-600 dark:prose-p:text-gray-400 prose-p:leading-relaxed
                prose-li:text-gray-600 dark:prose-li:text-gray-400
                prose-strong:text-gray-900 dark:prose-strong:text-white
                prose-a:text-indigo-600 dark:prose-a:text-indigo-400
                prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm"
            >
              {children}
            </article>

            {/* Prev / next */}
            <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row gap-3 justify-between">
              {prev ? (
                <Link
                  href={`/help/guides/${prev.slug}`}
                  className="group flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-gray-900 transition-colors flex-1"
                >
                  <ArrowLeft className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 dark:text-gray-500">Previous</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{prev.title}</p>
                  </div>
                </Link>
              ) : <div className="flex-1" />}
              {next ? (
                <Link
                  href={`/help/guides/${next.slug}`}
                  className="group flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-gray-900 transition-colors flex-1 sm:justify-end sm:text-right"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-gray-400 dark:text-gray-500">Next</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{next.title}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 shrink-0" />
                </Link>
              ) : <div className="flex-1" />}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
