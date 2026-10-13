"use client";
import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { useThemeStore } from '@/hooks/useThemeStore';
import { translate, type Dictionary, type TVars } from '@/lib/i18n/core';
import enDictionary from '@/locales/en.json';
import arDictionary from '@/locales/ar.json';
import { formatDate as fmtDate, formatMoney as fmtMoney, formatNumber as fmtNumber, formatPercent as fmtPercent, localizeDigits, type DateStyle } from '@/lib/i18n/format';

interface I18nContextValue {
  lang: string;
  /**
   * Resolve a dictionary key.
   *
   * Calling forms:
   *   t('common.save')                                 → "Save" / "حفظ"
   *   t('common.pageOf', { current: 1, total: 5 })     → "Page 1 of 5"
   *   t('nav.students.admit', 'Admit Student')         → "Admit Student" if the key
   *                                                       is missing, else the resolved value.
   *   t('errors.fileTooLarge', { size: 5 }, 'File too big ({{size}}MB)')
   *
   * The fallback (last positional string) is used when the dictionary
   * lookup returns undefined. Prevents raw key paths like
   * "nav.students.admit" from ever leaking to the UI.
   */
  t: (
    key: string,
    varsOrFallback?: Record<string, string | number> | string,
    fallback?: string,
  ) => string;
  dir: 'ltr' | 'rtl';
  /** Dates, numbers and money in the active language. Use these, not toLocaleString('en-GB'). */
  formatDate: (value: Date | string | number | null | undefined, style?: DateStyle | Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number | string | null | undefined, options?: Intl.NumberFormatOptions) => string;
  formatMoney: (amount: number | string | null | undefined, currency?: string) => string;
  formatPercent: (value: number | null | undefined, isRatio?: boolean, digits?: number) => string;
  /**
   * A value's digits in the active language, with nothing else changed: digits('07:42') → "٠٧:٤٢",
   * digits(78) → "٧٨". For numbers that are not quantities (an id, a score, "3/10"); use
   * formatNumber for quantities. In Arabic every number on screen must go through t(), a
   * formatter or this — a bare {count} in JSX shows Western digits.
   */
  digits: (value: string | number | null | undefined) => string;
  /**
   * A sentence with elements inside it — a bold name, a link — kept as ONE translatable sentence:
   *   rich('x.movedTo', { from: <strong>{a}</strong>, to: <strong>{b}</strong> })
   * with "All students in {{from}} will be moved to {{to}}." Plain values (and `count` for a
   * plural entry) go in the third argument.
   */
  rich: (key: string, nodes: Record<string, React.ReactNode>, vars?: Record<string, string | number>) => React.ReactNode;
  setLang: (lng: string) => void;
  ready: boolean;
  loading: boolean;
  error: string | null;
}

const I18nContext = createContext<I18nContextValue | null>(null);

// Both dictionaries are bundled and available synchronously.
//
// They used to be fetched on demand, which left a window after mount (and after every language
// switch) in which t() had no dictionary and returned the raw key. Anything computed in that
// window and then stored — a message put in state by a mount effect, a toast fired while data
// loaded — kept the raw key ("deviceDialogs.selector.noneOnlineHelp" was seen on screen, found by
// rendering the device picker in a browser). With the dictionaries always present there is no
// such window: t() is correct from the first render and `ready` is always true.
const DICTIONARIES: Record<string, Dictionary> = {
  en: enDictionary as unknown as Dictionary,
  ar: arDictionary as unknown as Dictionary,
};

// Dev-only: warn once per missing key so untranslated strings are easy to find
// during the route-localization sweep. Silent in production.
const warnedKeys = new Set<string>();
function warnMissingKey(key: string, lang: string) {
  if (process.env.NODE_ENV === 'production') return;
  const id = `${lang}:${key}`;
  if (warnedKeys.has(id)) return;
  warnedKeys.add(id);
  console.warn(`[i18n] missing key "${key}" for lang "${lang}"`);
}

export const I18nProvider: React.FC<{ children: React.ReactNode; loadSchoolDefault?: boolean }> = ({ children, loadSchoolDefault = true }) => {
  const lang = useThemeStore(s=>s.language);
  const setLanguage = useThemeStore(s=>s.setLanguage);
  const languageExplicit = useThemeStore(s=>s.languageExplicit);
  const setLanguageFromSchoolDefault = useThemeStore(s=>s.setLanguageFromSchoolDefault);
  const dict = DICTIONARIES[lang] ?? DICTIONARIES.en;
  // Kept in the context value for existing consumers; the dictionaries are always available.
  const ready = true;
  const loading = false;
  const error: string | null = null;

  /**
   * Phase 6 — once per mount, fetch the school's default_locale and apply
   * it ONLY IF the user has never explicitly chosen a language. Failures
   * are swallowed: not authenticated, network glitch, pre-migration row
   * (column absent) all just leave the existing language in place.
   */
  useEffect(() => {
    if (!loadSchoolDefault || languageExplicit) return; // public/login routes must not touch the DB
    let cancelled = false;
    fetch('/api/school-config')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.success) return;
        const def = d.school?.default_locale;
        if ((def === 'ar' || def === 'en') && def !== lang) {
          setLanguageFromSchoolDefault(def);
        }
      })
      .catch(() => { /* silent — keep current language */ });
    return () => { cancelled = true; };
    // Intentionally NOT depending on `lang` — only on the explicit flag.
    // We hydrate at most once per mount when the user is implicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageExplicit, loadSchoolDefault]);


  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    
    // Update CSS custom properties for RTL support
    document.documentElement.style.setProperty('--text-align-start', lang === 'ar' ? 'right' : 'left');
    document.documentElement.style.setProperty('--text-align-end', lang === 'ar' ? 'left' : 'right');
    document.documentElement.style.setProperty('--margin-start', lang === 'ar' ? 'margin-right' : 'margin-left');
    document.documentElement.style.setProperty('--margin-end', lang === 'ar' ? 'margin-left' : 'margin-right');
    document.documentElement.style.setProperty('--padding-start', lang === 'ar' ? 'padding-right' : 'padding-left');
    document.documentElement.style.setProperty('--padding-end', lang === 'ar' ? 'padding-left' : 'padding-right');
    
    // Add RTL class to body for additional styling control
    document.body.classList.toggle('rtl', lang === 'ar');
    document.body.classList.toggle('ltr', lang !== 'ar');
  }, [lang]);

  const t = useCallback((
    key: string,
    varsOrFallback?: Record<string, string | number> | string,
    fallback?: string,
  ) => {
    // Normalise call shape: vars + optional fallback, or just fallback.
    const vars =
      typeof varsOrFallback === 'object' && varsOrFallback !== null
        ? varsOrFallback
        : undefined;
    const fb =
      typeof varsOrFallback === 'string'
        ? varsOrFallback
        : fallback;

    // Shared core: plain text, plural groups ({ one, other, ... } chosen by vars.count using the
    // language's own plural rules) and {{placeholder}} substitution. A missing key returns the
    // fallback (if any), else the key path, and is reported once in development.
    return translate(dict, lang, key, vars as TVars | undefined, fb, ready ? (k) => warnMissingKey(k, lang) : undefined);
  }, [dict, lang, ready]);

  const formatDate = useCallback<I18nContextValue['formatDate']>((v, style) => fmtDate(v, lang, style), [lang]);
  const formatNumber = useCallback<I18nContextValue['formatNumber']>((v, o) => fmtNumber(v, lang, o), [lang]);
  const formatMoney = useCallback<I18nContextValue['formatMoney']>((v, c) => fmtMoney(v, lang, c), [lang]);
  const formatPercent = useCallback<I18nContextValue['formatPercent']>((v, r, d) => fmtPercent(v, lang, r, d), [lang]);

  const digits = useCallback<I18nContextValue['digits']>((v) => localizeDigits(v, lang), [lang]);

  const rich = useCallback<I18nContextValue['rich']>((key, nodes, vars) => {
    const text = t(key, vars ?? {});   // placeholders that are nodes are left in place by t()
    return text.split(/(\{\{\s*\w+\s*\}\})/g).map((part, i) => {
      const m = /^\{\{\s*(\w+)\s*\}\}$/.exec(part);
      return <React.Fragment key={i}>{m && m[1] in nodes ? nodes[m[1]] : part}</React.Fragment>;
    });
  }, [t]);

  const value: I18nContextValue = { 
    lang, 
    t, 
    dir: lang === 'ar' ? 'rtl' : 'ltr', 
    formatDate, formatNumber, formatMoney, formatPercent, digits, rich,
    setLang: setLanguage, 
    ready,
    loading,
    error
  };
  
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => { 
  const ctx = useContext(I18nContext); 
  if (!ctx) throw new Error('useI18n must be inside I18nProvider'); 
  return ctx; 
};
