'use client';
/**
 * ProgressContext — Global Progress System
 * Kills silent operations. Every long-running loop MUST emit updates here.
 *
 * Usage (in any component/page):
 *   const { startProgress, updateProgress, incrementSuccess, incrementError,
 *           finishProgress, setProgressError } = useProgress();
 */
import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  ReactNode,
} from 'react';

// ─── State Shape ──────────────────────────────────────────────────────────────
export interface ProgressState {
  isActive: boolean;
  progress: number;       // 0–100
  currentTask: string;
  successCount: number;
  errorCount: number;
  isFinished: boolean;
  hasError: boolean;
  errorMessage: string;
}

const initial: ProgressState = {
  isActive: false,
  progress: 0,
  currentTask: '',
  successCount: 0,
  errorCount: 0,
  isFinished: false,
  hasError: false,
  errorMessage: '',
};

// ─── Actions ─────────────────────────────────────────────────────────────────
type Action =
  | { type: 'START'; task?: string }
  | { type: 'UPDATE'; progress: number; task: string }
  | { type: 'INC_SUCCESS' }
  | { type: 'INC_ERROR' }
  | { type: 'FINISH' }
  | { type: 'SET_ERROR'; message: string }
  | { type: 'RESET' };

function reducer(state: ProgressState, action: Action): ProgressState {
  switch (action.type) {
    case 'START':
      return {
        ...initial,
        isActive: true,
        currentTask: action.task ?? 'Starting…',
        isFinished: false,
      };
    case 'UPDATE':
      return {
        ...state,
        progress: Math.min(100, Math.max(0, action.progress)),
        currentTask: action.task,
      };
    case 'INC_SUCCESS':
      return { ...state, successCount: state.successCount + 1 };
    case 'INC_ERROR':
      return { ...state, errorCount: state.errorCount + 1 };
    case 'FINISH':
      return {
        ...state,
        progress: 100,
        isFinished: true,
        currentTask: state.errorCount > 0
          ? `Done — ${state.successCount} succeeded, ${state.errorCount} failed`
          : `Complete — ${state.successCount} processed`,
      };
    case 'SET_ERROR':
      return {
        ...state,
        hasError: true,
        errorMessage: action.message,
        isFinished: true,
        currentTask: `Error: ${action.message}`,
      };
    case 'RESET':
      return initial;
    default:
      return state;
  }
}

// ─── Context API ─────────────────────────────────────────────────────────────
interface ProgressContextValue {
  state: ProgressState;
  startProgress: (initialTask?: string) => void;
  updateProgress: (percent: number, message: string) => void;
  incrementSuccess: () => void;
  incrementError: () => void;
  finishProgress: () => void;
  setProgressError: (message: string) => void;
  resetProgress: () => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────
export function ProgressProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  const startProgress = useCallback((initialTask = 'Initializing…') => {
    dispatch({ type: 'START', task: initialTask });
  }, []);

  const updateProgress = useCallback((percent: number, message: string) => {
    dispatch({ type: 'UPDATE', progress: percent, task: message });
  }, []);

  const incrementSuccess = useCallback(() => {
    dispatch({ type: 'INC_SUCCESS' });
  }, []);

  const incrementError = useCallback(() => {
    dispatch({ type: 'INC_ERROR' });
  }, []);

  const finishProgress = useCallback(() => {
    dispatch({ type: 'FINISH' });
  }, []);

  const setProgressError = useCallback((message: string) => {
    dispatch({ type: 'SET_ERROR', message });
  }, []);

  const resetProgress = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return (
    <ProgressContext.Provider
      value={{
        state,
        startProgress,
        updateProgress,
        incrementSuccess,
        incrementError,
        finishProgress,
        setProgressError,
        resetProgress,
      }}
    >
      {children}
    </ProgressContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress must be used inside <ProgressProvider>');
  return ctx;
}
