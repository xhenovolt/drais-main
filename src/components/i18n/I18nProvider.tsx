"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useThemeStore } from '@/hooks/useThemeStore';

interface Dictionary { [key: string]: string | Dictionary; }
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
  setLang: (lng: string) => void;
  ready: boolean;
  loading: boolean;
  error: string | null;
}

const I18nContext = createContext<I18nContextValue | null>(null);

async function loadDictionary(lang: string): Promise<Dictionary> {
  try {
    switch(lang){
      case 'ar': return (await import('@/locales/ar.json')).default as any;
      case 'en': default: return (await import('@/locales/en.json')).default as any;
    }
  } catch (error) {
    console.error(`Failed to load dictionary for language: ${lang}`, error);
    // Fallback to English if loading fails
    if (lang !== 'en') {
      return (await import('@/locales/en.json')).default as any;
    }
    throw error;
  }
}

function resolveKey(dict: Dictionary, path: string | null): string | undefined {
  if (!path) return undefined;
  return path.split('.').reduce<any>((acc, part) => (acc && (acc as any)[part]) ?? undefined, dict);
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const lang = useThemeStore(s=>s.language);
  const setLanguage = useThemeStore(s=>s.setLanguage);
  const languageExplicit = useThemeStore(s=>s.languageExplicit);
  const setLanguageFromSchoolDefault = useThemeStore(s=>s.setLanguageFromSchoolDefault);
  const [dict, setDict] = useState<Dictionary>({});
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Phase 6 — once per mount, fetch the school's default_locale and apply
   * it ONLY IF the user has never explicitly chosen a language. Failures
   * are swallowed: not authenticated, network glitch, pre-migration row
   * (column absent) all just leave the existing language in place.
   */
  useEffect(() => {
    if (languageExplicit) return; // user choice wins
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
  }, [languageExplicit]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setReady(false);
    
    loadDictionary(lang)
      .then(d => {
        if (active) {
          setDict(d);
          setReady(true);
          setError(null);
        }
      })
      .catch(err => {
        if (active) {
          setError(err.message || 'Failed to load translations');
          console.error('I18n loading error:', err);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    
    return () => { active = false; };
  }, [lang]);

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

    const resolved = resolveKey(dict, key);
    // Miss → use English fallback (if any) BEFORE giving up to the raw
    // key path. Prevents leaks like "nav.students.admit" appearing in
    // the UI when a dictionary entry has not been authored yet.
    let value: string =
      typeof resolved === 'string' ? resolved : (fb ?? key);

    if (vars) {
      Object.entries(vars).forEach(([k, v]) => {
        value = value.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
      });
    }
    return value;
  }, [dict]);

  const value: I18nContextValue = { 
    lang, 
    t, 
    dir: lang === 'ar' ? 'rtl' : 'ltr', 
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
