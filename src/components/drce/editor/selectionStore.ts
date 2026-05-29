/**
 * DRCE editor — selection store.
 *
 * Decoupled from the document state. The store holds:
 *   sectionIds  — multi-select set of section ids
 *   shapeIds    — multi-select set of shape ids
 *   primaryId   — the focused element (last clicked); drives properties
 *                 panel + ContextualToolbar anchoring.
 *   clipboard   — JSON snapshot of cut/copied elements for paste.
 *
 * Backed by useSyncExternalStore so consumers can subscribe individually
 * — clicking a section won't re-render components that subscribe to
 * shape selection only.
 */
import { useSyncExternalStore } from 'react';
import type { DRCESection, DRCEShape } from '@/lib/drce/schema';

export type SelectedKind = 'section' | 'shape';

interface SelectionState {
  sectionIds: Set<string>;
  shapeIds:   Set<string>;
  primary:    { kind: SelectedKind; id: string } | null;
  clipboard:  { sections: DRCESection[]; shapes: DRCEShape[] } | null;
}

const state: SelectionState = {
  sectionIds: new Set(),
  shapeIds:   new Set(),
  primary:    null,
  clipboard:  null,
};

const listeners = new Set<() => void>();
function emit() { for (const fn of listeners) fn(); }

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ── Read snapshot helpers (stable refs while state hasn't changed) ─────────

let snapshotCache: SelectionState = state;
function snapshot(): SelectionState { return snapshotCache; }
function bumpSnapshot() {
  // New top-level object so React's referential check fires.
  snapshotCache = {
    sectionIds: new Set(state.sectionIds),
    shapeIds:   new Set(state.shapeIds),
    primary:    state.primary,
    clipboard:  state.clipboard,
  };
  emit();
}

// ── Public API ─────────────────────────────────────────────────────────────

export const selection = {
  /** Replace selection with one element (single-click). */
  select(kind: SelectedKind, id: string) {
    state.sectionIds.clear();
    state.shapeIds.clear();
    if (kind === 'section') state.sectionIds.add(id);
    else                    state.shapeIds.add(id);
    state.primary = { kind, id };
    bumpSnapshot();
  },
  /** Toggle membership in the selection (shift-click). */
  toggle(kind: SelectedKind, id: string) {
    const set = kind === 'section' ? state.sectionIds : state.shapeIds;
    if (set.has(id)) {
      set.delete(id);
      if (state.primary?.id === id) {
        // Pick a new primary if any remain, else clear.
        const nextSec = [...state.sectionIds][0];
        const nextSh  = [...state.shapeIds][0];
        state.primary = nextSec ? { kind: 'section', id: nextSec }
                       : nextSh ? { kind: 'shape',   id: nextSh  }
                       : null;
      }
    } else {
      set.add(id);
      state.primary = { kind, id };
    }
    bumpSnapshot();
  },
  /** Add to the selection without toggling (used by marquee-style flows). */
  add(kind: SelectedKind, id: string) {
    const set = kind === 'section' ? state.sectionIds : state.shapeIds;
    set.add(id);
    if (!state.primary) state.primary = { kind, id };
    bumpSnapshot();
  },
  clear() {
    state.sectionIds.clear();
    state.shapeIds.clear();
    state.primary = null;
    bumpSnapshot();
  },
  isSelected(kind: SelectedKind, id: string) {
    return (kind === 'section' ? state.sectionIds : state.shapeIds).has(id);
  },

  // ── clipboard ────────────────────────────────────────────────────────────
  copy(sections: DRCESection[], shapes: DRCEShape[]) {
    // Deep clone via JSON so paste is independent of source identities.
    state.clipboard = JSON.parse(JSON.stringify({ sections, shapes }));
    bumpSnapshot();
  },
  getClipboard() { return state.clipboard; },
  hasClipboard() {
    return !!(state.clipboard && (state.clipboard.sections.length || state.clipboard.shapes.length));
  },
};

// ── React bindings ─────────────────────────────────────────────────────────

export function useSelection(): SelectionState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Subscribe ONLY to a slice — re-renders skip when the slice is unchanged. */
export function useSelectionSlice<T>(selector: (s: SelectionState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(snapshot()),
    () => selector(snapshot()),
  );
}
