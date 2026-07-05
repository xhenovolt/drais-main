/**
 * DRAIS product-brand config — single source of truth for product logo/icon
 * paths and names. Do NOT scatter logo paths across components; import from
 * here (or use <BrandBadge> / <BrandLockup>).
 *
 * NB: this is the DRAIS *product* brand only. School-uploaded logos
 * (schools.logo_url, /uploads/logo.png) are a separate concern and must never
 * be replaced by these.
 *
 * Assets are generated from public/newlogos/ by scripts/brand/generate-icons.mjs.
 */
export const draisBrand = {
  appName: 'DRAIS',
  productName: 'DRAIS',
  companyName: 'Xhenvolt',
  appDescription: 'School Operational Intelligence Infrastructure',
  tagline: 'Beyond Attendance.',
  themeColor: '#0A2463',

  /** Square icon mark (transparent, works on light & dark). */
  icon: '/brand/drais/icon-512.png',
  /** Vertical wordmark lockup (icon + DRAIS, transparent). */
  logo: '/brand/drais/logo.png',
  /** Splash/login hero wordmark. */
  splash: '/drais.png',
  /** Browser favicon. */
  favicon: '/favicon.ico',
  /** Desktop (Electron) icon. */
  desktopIcon: '/brand/drais/icon.ico',
} as const;

export type DraisBrand = typeof draisBrand;
