/**
 * Server-side translation for Server Components and route handlers, which cannot call the client
 * hook `useI18n()`.
 *
 * The language comes from the `lang` cookie that the client store writes whenever the user (or the
 * school default) sets a language — see src/hooks/useThemeStore.ts. It resolves keys with the same
 * core as the client, so a key means the same thing on both sides.
 *
 *   const { t, lang, dir, formatDate } = await getServerI18n();
 *   <h1>{t('terms.title')}</h1>
 */
import { cookies } from 'next/headers';
import { translate, type Dictionary, type Lang, type TVars } from '@/lib/i18n/core';
import { formatDate, formatMoney, formatNumber, type DateStyle } from '@/lib/i18n/format';

export async function serverLang(): Promise<Lang> {
  try {
    const store = await cookies();
    return store.get('lang')?.value === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en'; // no request scope (build time, scripts)
  }
}

export async function loadServerDictionary(lang: Lang): Promise<Dictionary> {
  const mod = lang === 'ar' ? await import('@/locales/ar.json') : await import('@/locales/en.json');
  return mod.default as unknown as Dictionary;
}

export async function getServerI18n(langOverride?: Lang) {
  const lang = langOverride ?? (await serverLang());
  const dict = await loadServerDictionary(lang);
  const t = (key: string, varsOrFallback?: TVars | string, fallback?: string) => {
    const vars = typeof varsOrFallback === 'object' && varsOrFallback !== null ? varsOrFallback : undefined;
    const fb = typeof varsOrFallback === 'string' ? varsOrFallback : fallback;
    return translate(dict, lang, key, vars, fb);
  };
  return {
    lang,
    dir: (lang === 'ar' ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
    t,
    formatDate: (v: Date | string | number | null | undefined, style?: DateStyle | Intl.DateTimeFormatOptions) => formatDate(v, lang, style),
    formatNumber: (v: number | string | null | undefined, o?: Intl.NumberFormatOptions) => formatNumber(v, lang, o),
    formatMoney: (v: number | string | null | undefined, currency?: string) => formatMoney(v, lang, currency),
  };
}
