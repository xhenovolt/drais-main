// src/components/drce/editor/useDRCEEditor.ts
// useReducer-based editor state with undo/redo, 30-step history.
'use client';

import { useReducer, useCallback, useRef } from 'react';
import type { DRCEDocument, DRCEMutation } from '@/lib/drce/schema';
import { applyMutation } from '@/lib/drce/mutations';

const MAX_HISTORY = 30;

interface EditorState {
  history: DRCEDocument[];
  index:   number;        // current position in history
}

type EditorAction =
  | { type: 'MUTATE';  mutation: DRCEMutation }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET';   document: DRCEDocument };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'MUTATE': {
      const current = state.history[state.index];
      const next    = applyMutation(current, action.mutation);
      // Discard redo states
      const newHistory = [...state.history.slice(0, state.index + 1), next].slice(-MAX_HISTORY);
      return { history: newHistory, index: newHistory.length - 1 };
    }
    case 'UNDO': {
      const newIndex = Math.max(0, state.index - 1);
      return { ...state, index: newIndex };
    }
    case 'REDO': {
      const newIndex = Math.min(state.history.length - 1, state.index + 1);
      return { ...state, index: newIndex };
    }
    case 'RESET': {
      return { history: [action.document], index: 0 };
    }
    default:
      return state;
  }
}

export function useDRCEEditor(initial: DRCEDocument) {
  const [state, dispatch] = useReducer(editorReducer, {
    history: [initial],
    index:   0,
  });

  const document = state.history[state.index];
  const canUndo   = state.index > 0;
  const canRedo   = state.index < state.history.length - 1;
  const isDirty   = state.index > 0;

  const mutate = useCallback((mutation: DRCEMutation) => {
    dispatch({ type: 'MUTATE', mutation });
  }, []);

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);
  const reset = useCallback((doc: DRCEDocument) => dispatch({ type: 'RESET', document: doc }), []);

  return { document, mutate, undo, redo, reset, canUndo, canRedo, isDirty };
}
