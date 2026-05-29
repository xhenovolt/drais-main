// src/components/drce/editor/useDRCEEditor.ts
// useReducer-based editor state with undo/redo, 30-step history.
//
// Phase 0 fix H2 — coalesce successive SET_SECTION_STYLE mutations on the
// same section within COALESCE_MS into a single history entry. Without this,
// a 1-second free-drag (~60 RAF commits) would consume the entire undo
// window and erase prior edits. The coalesced entry still reflects the
// final position, so undo rewinds the whole drag in one step.
//
// Phase 0 fix H3 — track `savedIndex` so `isDirty` is the comparison
// `index !== savedIndex` (not `index > 0`). Save → savedIndex := index;
// any subsequent move forward OR backward via undo/redo flips isDirty back.
'use client';

import { useReducer, useCallback } from 'react';
import type { DRCEDocument, DRCEMutation } from '@/lib/drce/schema';
import { applyMutation } from '@/lib/drce/mutations';

const MAX_HISTORY = 30;
const COALESCE_MS = 250;

interface EditorState {
  history:     DRCEDocument[];
  index:       number;
  savedIndex:  number;
  /** Coalesce window: if the next mutation matches by type+target and arrives
   *  within COALESCE_MS, we OVERWRITE the head of history instead of appending. */
  lastTouch:   { type: string; targetId: string | null; at: number } | null;
}

type EditorAction =
  | { type: 'MUTATE';  mutation: DRCEMutation; now: number }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SAVE_MARK' }
  | { type: 'RESET';   document: DRCEDocument };

function coalesceKey(m: DRCEMutation): { type: string; targetId: string | null } | null {
  // Only coalesce the high-frequency drag/resize style mutations. Other edits
  // (add/delete/reorder/typing in a text field) each deserve their own undo step.
  if (m.type !== 'SET_SECTION_STYLE') return null;
  return { type: m.type, targetId: m.sectionId };
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'MUTATE': {
      const current = state.history[state.index];
      const next    = applyMutation(current, action.mutation);
      const key     = coalesceKey(action.mutation);

      // Coalesce: same target style mutation within window → overwrite head.
      if (
        key && state.lastTouch &&
        state.lastTouch.type === key.type &&
        state.lastTouch.targetId === key.targetId &&
        action.now - state.lastTouch.at < COALESCE_MS &&
        state.index === state.history.length - 1
      ) {
        const newHistory = state.history.slice();
        newHistory[state.index] = next;
        return {
          ...state,
          history:   newHistory,
          lastTouch: { ...key, at: action.now },
        };
      }

      // Otherwise: drop redo tail, push new state, cap to MAX_HISTORY.
      const trimmedTail = state.history.slice(0, state.index + 1);
      const appended    = [...trimmedTail, next];
      const overflow    = Math.max(0, appended.length - MAX_HISTORY);
      const finalHist   = overflow ? appended.slice(overflow) : appended;
      const newIndex    = finalHist.length - 1;
      // Trimming shifts the savedIndex too — keep -1 if the saved doc dropped out.
      const newSaved    = state.savedIndex - overflow;
      return {
        history:    finalHist,
        index:      newIndex,
        savedIndex: newSaved < 0 ? -1 : newSaved,
        lastTouch:  key ? { ...key, at: action.now } : null,
      };
    }
    case 'UNDO': {
      const newIndex = Math.max(0, state.index - 1);
      return { ...state, index: newIndex, lastTouch: null };
    }
    case 'REDO': {
      const newIndex = Math.min(state.history.length - 1, state.index + 1);
      return { ...state, index: newIndex, lastTouch: null };
    }
    case 'SAVE_MARK': {
      return { ...state, savedIndex: state.index, lastTouch: null };
    }
    case 'RESET': {
      return { history: [action.document], index: 0, savedIndex: 0, lastTouch: null };
    }
    default:
      return state;
  }
}

export function useDRCEEditor(initial: DRCEDocument) {
  const [state, dispatch] = useReducer(editorReducer, {
    history:    [initial],
    index:      0,
    savedIndex: 0,
    lastTouch:  null,
  });

  const document = state.history[state.index];
  const canUndo   = state.index > 0;
  const canRedo   = state.index < state.history.length - 1;
  const isDirty   = state.index !== state.savedIndex;

  const mutate = useCallback((mutation: DRCEMutation) => {
    dispatch({ type: 'MUTATE', mutation, now: Date.now() });
  }, []);

  const undo       = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo       = useCallback(() => dispatch({ type: 'REDO' }), []);
  const reset      = useCallback((doc: DRCEDocument) => dispatch({ type: 'RESET', document: doc }), []);
  const markSaved  = useCallback(() => dispatch({ type: 'SAVE_MARK' }), []);

  return { document, mutate, undo, redo, reset, markSaved, canUndo, canRedo, isDirty };
}
