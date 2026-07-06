/**
 * DRCE local draft store (Phase 1 — crash recovery).
 *
 * The editor commits versioned saves to the server on demand; between saves,
 * unsaved edits only lived in memory, so a tab close / crash / accidental
 * navigation lost work silently. This persists a per-document draft to
 * localStorage so the editor can offer to restore it next time.
 *
 * It is NOT a substitute for saving — a draft is discarded once the document is
 * saved to the server (or the user discards it). Pure/isomorphic-safe: every
 * call no-ops when localStorage is unavailable (SSR, private mode, quota).
 */
import type { DRCEDocument } from '@/lib/drce/schema';

const PREFIX = 'drce.draft.';
const key = (id: string | number) => `${PREFIX}${id}`;

export interface DRCEDraft {
  savedAt: number;      // epoch ms
  doc: DRCEDocument;
}

function ls(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Persist a draft for `id`. Silent on any failure (e.g. quota exceeded). */
export function saveDraft(id: string | number, doc: DRCEDocument): void {
  const store = ls();
  if (!store) return;
  try {
    store.setItem(key(id), JSON.stringify({ savedAt: Date.now(), doc }));
  } catch {
    /* quota / serialization — drafts are best-effort */
  }
}

/** Load a draft for `id`, or null if none / unreadable. */
export function loadDraft(id: string | number): DRCEDraft | null {
  const store = ls();
  if (!store) return null;
  try {
    const raw = store.getItem(key(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DRCEDraft;
    if (!parsed || typeof parsed.savedAt !== 'number' || !parsed.doc) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Remove the draft for `id` (called after a successful server save / discard). */
export function clearDraft(id: string | number): void {
  const store = ls();
  if (!store) return;
  try { store.removeItem(key(id)); } catch { /* ignore */ }
}

/**
 * Decide whether a stored draft is worth offering for recovery: it must exist
 * and differ from the document just loaded from the server. Comparison is a
 * cheap canonical-ish JSON check on the sections/pages payload (ignores volatile
 * meta like updated_at). Returns the draft when recoverable, else null.
 */
export function recoverableDraft(id: string | number, serverDoc: DRCEDocument): DRCEDraft | null {
  const draft = loadDraft(id);
  if (!draft) return null;
  try {
    const a = JSON.stringify({ s: draft.doc.sections, p: draft.doc.pages, sh: draft.doc.shapes });
    const b = JSON.stringify({ s: serverDoc.sections, p: serverDoc.pages, sh: serverDoc.shapes });
    return a === b ? null : draft;
  } catch {
    return draft; // if we can't compare, err toward offering recovery
  }
}
