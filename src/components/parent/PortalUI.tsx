'use client';
/**
 * Parent portal building blocks — shared by every /parent page so the portal reads as one product.
 *
 * Design rules these components encode (the reason they exist):
 *   - Phone first. Body text is 14px and tap targets are at least 40px; nothing important is 10px.
 *   - No squeezed tables. A long school name used to crush the label column of the compare table
 *     to one letter per line. Text that can be long (school names, learner names) always gets a
 *     block of its own width and wraps on WORD boundaries (`break-normal`), never mid-word.
 *   - Status is colour + word + icon, never colour alone.
 *   - Direction-aware spacing (ms/me/ps/pe, text-start) so Arabic mirrors correctly.
 */
import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Languages, LogOut } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

/** Page frame: consistent width and bottom padding on every portal page. */
export function PortalPage({ children, width = 'max-w-5xl' }: { children: React.ReactNode; width?: string }) {
  return <div className={`mx-auto w-full ${width} px-4 pb-20 pt-4 sm:px-6 sm:pt-6`}>{children}</div>;
}

/** Switches between English and Arabic. Parents have no staff navbar, so the switch lives here. */
export function LanguageToggle({ onDark = false }: { onDark?: boolean }) {
  const { lang, setLang, t } = useI18n();
  const next = lang === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      aria-label={t('parent.common.switchLanguage')}
      title={t('parent.common.switchLanguage')}
      className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition ${
        onDark ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700'
      }`}
    >
      <Languages className="h-4 w-4" data-no-mirror />
      <span>{next === 'ar' ? 'العربية' : 'English'}</span>
    </button>
  );
}

/** Coloured band at the top of a page: title, optional subtitle, back link, language switch, sign out. */
export function PortalHeader({
  title, subtitle, backHref, onSignOut, children,
}: { title: string; subtitle?: React.ReactNode; backHref?: string; onSignOut?: () => void; children?: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <header className="mb-5 overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 p-4 text-white shadow-lg shadow-indigo-600/20 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {backHref && (
            <Link href={backHref} aria-label={t('parent.common.back')}
              className="-ms-1 mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 hover:bg-white/25">
              <ArrowLeft className="h-5 w-5 rtl-flip" />
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="break-normal text-xl font-bold leading-tight sm:text-2xl">{title}</h1>
            {subtitle && <p className="mt-1 break-normal text-sm leading-snug text-indigo-100">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageToggle onDark />
          {onSignOut && (
            <button type="button" onClick={onSignOut} aria-label={t('parent.common.signOut')} title={t('parent.common.signOut')}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 hover:bg-white/25">
              <LogOut className="h-5 w-5 rtl-flip" />
            </button>
          )}
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}

const AVATAR_TONES = [
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200',
  'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-200',
];
/** Solid colours used to tell children apart in charts; index matches AVATAR_TONES. */
export const SERIES_COLORS = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500', 'bg-violet-500'];

export function initialsOf(name: string | null | undefined): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Round badge with the learner's initials. `index` picks a stable colour for that child. */
export function Avatar({ name, index = 0, size = 'md' }: { name: string | null | undefined; index?: number; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-11 w-11 text-sm';
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-2xl font-bold ${dims} ${AVATAR_TONES[index % AVATAR_TONES.length]}`}>
      {initialsOf(name)}
    </span>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900 ${className}`}>{children}</div>;
}

export function SectionTitle({ icon: Icon, children }: { icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <h2 className="mb-2 flex items-start gap-2 px-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
      <span className="min-w-0 break-normal">{children}</span>
    </h2>
  );
}

type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'brand';
const TONE_TEXT: Record<Tone, string> = {
  good: 'text-emerald-700 dark:text-emerald-300', warn: 'text-amber-700 dark:text-amber-300', bad: 'text-rose-700 dark:text-rose-300',
  neutral: 'text-slate-700 dark:text-slate-200', brand: 'text-indigo-700 dark:text-indigo-300',
};
const TONE_BG: Record<Tone, string> = {
  good: 'bg-emerald-50 dark:bg-emerald-900/20', warn: 'bg-amber-50 dark:bg-amber-900/20', bad: 'bg-rose-50 dark:bg-rose-900/20',
  neutral: 'bg-slate-50 dark:bg-slate-800/60', brand: 'bg-indigo-50 dark:bg-indigo-900/20',
};
const TONE_BAR: Record<Tone, string> = { good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-rose-500', neutral: 'bg-slate-400', brand: 'bg-indigo-500' };

/** A number with its label: the unit used for every summary figure in the portal. */
export function StatTile({ label, value, tone = 'neutral', icon: Icon }: { label: string; value: React.ReactNode; tone?: Tone; icon?: React.ElementType }) {
  return (
    <div className={`rounded-2xl px-3 py-3 ${TONE_BG[tone]}`}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}<span className="break-normal">{label}</span>
      </p>
      <p className={`mt-1 text-lg font-bold leading-tight ${TONE_TEXT[tone]}`}><bdi>{value}</bdi></p>
    </div>
  );
}

/** Pill for a state such as present / late / absent. */
export function StatusPill({ tone, children, icon: Icon }: { tone: Tone; children: React.ReactNode; icon?: React.ElementType }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_BG[tone]} ${TONE_TEXT[tone]}`}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}{children}
    </span>
  );
}

/** Horizontal bar, 0–100. `colorClass` overrides the tone colour (used to colour by child). */
export function ProgressBar({ percent, tone = 'brand', colorClass, label }: { percent: number | null | undefined; tone?: Tone; colorClass?: string; label?: string }) {
  const p = percent == null || !Number.isFinite(Number(percent)) ? 0 : Math.max(0, Math.min(100, Number(percent)));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${colorClass ?? TONE_BAR[tone]}`} style={{ width: `${p}%` }} />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon?: React.ElementType; title: string; hint?: string }) {
  return (
    <div className="px-6 py-12 text-center">
      {Icon && <Icon className="mx-auto mb-3 h-9 w-9 text-slate-300 dark:text-slate-600" />}
      <p className="break-normal text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-sm break-normal text-sm text-slate-400">{hint}</p>}
    </div>
  );
}

export function LoadingBlock() {
  const { t } = useI18n();
  return (
    <div className="space-y-3 py-2" aria-busy="true" aria-label={t('parent.common.loading')}>
      {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800" />)}
    </div>
  );
}

/** Attendance status → tone. Unknown statuses are neutral, never guessed. */
export function attendanceTone(status: string | null | undefined): Tone {
  const s = String(status ?? '').toLowerCase();
  if (s === 'present') return 'good';
  if (s === 'late' || s === 'partial' || s === 'half_day') return 'warn';
  if (s === 'absent') return 'bad';
  return 'neutral';
}
