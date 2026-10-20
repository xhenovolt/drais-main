'use client';
/**
 * Client side of the media resolver — the ONE function pages use to turn a DB image reference
 * into an <img src>. Pages must not decide cloud-vs-local themselves.
 *
 *   const src = useMediaSrc();           // in components (re-renders when the mode is known)
 *   <img src={src(student.photo_url)} /> // returns '' for empty refs — keep your placeholder logic
 *
 * Cloud mode (hosted, or online on a desktop): returns the reference unchanged — the browser loads
 * Cloudinary directly, exactly as before, with no extra server hop.
 * Local mode (local MySQL / SQLite / chosen in Settings → Media): routes through /api/media/file,
 * which serves this machine's copy, or the original URL only if the school's policy allows it.
 * media:// references always go through the API (they only exist on this machine).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { classifyRef } from './refs';

type State = { local: boolean; loaded: boolean };
let state: State = { local: false, loaded: false };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function set(next: State) { state = next; listeners.forEach(l => l()); }

/** Fetch /api/media/mode once per page load. Safe to call repeatedly. */
export function loadMediaMode(): Promise<void> {
  if (loading) return loading;
  loading = fetch('/api/media/mode', { credentials: 'include' })
    .then(r => (r.ok ? r.json() : null))
    .then(d => set({ local: Boolean(d?.local), loaded: true }))
    .catch(() => set({ local: false, loaded: true }));
  return loading;
}

/** Forget the cached mode (after Settings → Media changes it). */
export function refreshMediaMode(): Promise<void> {
  loading = null;
  return loadMediaMode();
}

export function mediaSrc(ref: string | null | undefined): string {
  const v = (ref ?? '').trim();
  if (!v) return '';
  const kind = classifyRef(v);
  if (kind === 'data' || kind === 'unknown') return v;
  if (kind === 'managed' || state.local) return `/api/media/file?ref=${encodeURIComponent(v)}`;
  return v;
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => state;

/** Hook form: the returned function is stable per mode, and the component re-renders when the mode loads. */
export function useMediaSrc(): (ref: string | null | undefined) => string {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { void loadMediaMode(); }, []);
  return mediaSrc;
}
