'use client';
/**
 * Android app only: keeps the phone's status bar and navigation bar the same colour as the
 * page, like native apps do. The native side (MainActivity) exposes window.DraisNative;
 * everywhere else (browser, Electron, Vercel) that object is absent and this renders nothing
 * and does nothing.
 *
 * We report the colour the page is ACTUALLY painting at the top and bottom edge of the
 * viewport, so it is right for light/dark mode, the school's brand colours, and pages whose
 * header differs from the body.
 */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

interface DraisNativeBridge { setBars: (top: string, bottom: string) => void }

const FALLBACK_LIGHT = '#ffffff';
const FALLBACK_DARK = '#0f172a';

/** Parse "rgb(...)" / "rgba(...)" → [r,g,b,a]; null when it isn't one. */
function parseRgb(css: string): [number, number, number, number] | null {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (p.length < 3 || p.slice(0, 3).some((n) => Number.isNaN(n))) return null;
  return [p[0], p[1], p[2], p.length > 3 && !Number.isNaN(p[3]) ? p[3] : 1];
}

const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');

/** The first non-transparent background colour at (x,y), walking up from the element there. */
function paintedColorAt(x: number, y: number, fallback: string): string {
  let el: Element | null = document.elementFromPoint(x, y);
  while (el) {
    const c = parseRgb(getComputedStyle(el).backgroundColor);
    if (c && c[3] >= 0.95) return toHex(c[0], c[1], c[2]);
    el = el.parentElement;
  }
  const body = parseRgb(getComputedStyle(document.body).backgroundColor);
  if (body && body[3] >= 0.95) return toHex(body[0], body[1], body[2]);
  return fallback;
}

export default function MobileStatusBarSync() {
  const pathname = usePathname();

  useEffect(() => {
    const bridge = (window as unknown as { DraisNative?: DraisNativeBridge }).DraisNative;
    if (!bridge || typeof bridge.setBars !== 'function') return;

    let last = '';
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        try {
          const dark = document.documentElement.classList.contains('dark');
          const fb = dark ? FALLBACK_DARK : FALLBACK_LIGHT;
          const x = Math.round(window.innerWidth / 2);
          const top = paintedColorAt(x, 2, fb);
          const bottom = paintedColorAt(x, Math.max(0, window.innerHeight - 2), fb);
          const key = `${top}|${bottom}`;
          if (key === last) return;
          last = key;
          bridge.setBars(top, bottom);
        } catch { /* cosmetic only */ }
      });
    };

    sync();
    // Layout settles after route changes / data loads; re-sample a few times.
    const timers = [120, 500, 1500].map((ms) => window.setTimeout(sync, ms));

    const themeObserver = new MutationObserver(sync);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme-mode'] });
    const bodyObserver = new MutationObserver(sync);
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });

    let scrollTimer = 0;
    const onScroll = () => { window.clearTimeout(scrollTimer); scrollTimer = window.setTimeout(sync, 150); };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', sync);
    document.addEventListener('visibilitychange', sync);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.clearTimeout(scrollTimer);
      themeObserver.disconnect();
      bodyObserver.disconnect();
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [pathname]);

  return null;
}
