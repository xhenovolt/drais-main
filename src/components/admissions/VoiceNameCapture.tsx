'use client';
/**
 * VoiceNameCapture.tsx
 * Web Speech API microphone button that suggests the closest matching name
 * from nameBank.json and lets the user accept or dismiss.
 *
 * Usage:
 *   <VoiceNameCapture label="First Name" onCapture={(name) => setFirstName(name)} />
 */
import React, { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Check, X, HelpCircle } from 'lucide-react';
import { findClosestName, NameMatch } from '@/lib/voiceNameMatcher';

interface VoiceNameCaptureProps {
  /** Label shown on the mic button tooltip */
  label?: string;
  /** Called when the user accepts a suggested name */
  onCapture: (name: string) => void;
}

type State = 'idle' | 'listening' | 'processing' | 'suggestions' | 'error';

// Web Speech API — not in standard TS lib; use `any` wrappers safely
type AnyRecognition = any;

export default function VoiceNameCapture({ label = 'Name', onCapture }: VoiceNameCaptureProps) {
  const [uiState, setUiState] = useState<State>('idle');
  const [suggestions, setSuggestions] = useState<NameMatch[]>([]);
  const [rawTranscript, setRawTranscript] = useState('');
  const recognitionRef = useRef<AnyRecognition>(null);

  const isSupported =
    typeof window !== 'undefined' &&
    (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) return;

    const SR: AnyRecognition =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec: AnyRecognition = new SR();
    recognitionRef.current = rec;

    rec.lang = 'en-UG'; // Uganda English — falls back to en-GB gracefully
    rec.interimResults = false;
    rec.maxAlternatives = 3;

    rec.onstart = () => setUiState('listening');

    rec.onresult = (event: AnyRecognition) => {
      setUiState('processing');
      // Collect all alternatives and the top transcript
      const alts: string[] = [];
      for (let i = 0; i < event.results[0].length; i++) {
        alts.push(event.results[0][i].transcript.trim());
      }
      const primary = alts[0] || '';
      setRawTranscript(primary);

      // Run findClosestName across all alternatives, deduplicate by name
      const seen = new Set<string>();
      const allMatches: NameMatch[] = [];
      for (const alt of alts) {
        for (const m of findClosestName(alt, 4)) {
          if (!seen.has(m.name)) {
            seen.add(m.name);
            allMatches.push(m);
          }
        }
      }
      allMatches.sort((a, b) => b.confidence - a.confidence);
      setSuggestions(allMatches.slice(0, 3));
      setUiState('suggestions');
    };

    rec.onerror = () => setUiState('error');
    rec.onend = () => {
      if (uiState === 'listening') setUiState('idle');
    };

    rec.start();
  }, [isSupported, uiState]);

  const handleMicClick = () => {
    if (uiState === 'listening') {
      stopListening();
      setUiState('idle');
    } else {
      setSuggestions([]);
      setRawTranscript('');
      startListening();
    }
  };

  const handleAccept = (name: string) => {
    onCapture(name);
    setUiState('idle');
    setSuggestions([]);
  };

  const handleDismiss = () => {
    setUiState('idle');
    setSuggestions([]);
  };

  // Show a disabled button with tooltip instead of returning null
  if (!isSupported) {
    return (
      <button
        type="button"
        disabled
        title="Voice input is not supported in this browser. Try Chrome or Edge."
        aria-label="Voice input not supported"
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed"
      >
        <Mic className="w-4 h-4" />
      </button>
    );
  }

  // ── Colour classes for the mic button ──────────────────────────────────────
  const micBtnClass = {
    idle: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-600 dark:bg-indigo-900/40 dark:hover:bg-indigo-800/60 dark:text-indigo-300',
    listening: 'bg-red-100 hover:bg-red-200 text-red-600 dark:bg-red-900/40 dark:hover:bg-red-800/60 dark:text-red-400 animate-pulse',
    processing: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 cursor-wait',
    suggestions: 'bg-emerald-100 hover:bg-emerald-200 text-emerald-600 dark:bg-emerald-900/40 dark:hover:bg-emerald-800/60 dark:text-emerald-300',
    error: 'bg-slate-100 hover:bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
  }[uiState];

  return (
    <div className="relative inline-flex flex-col items-start gap-2">
      {/* Mic trigger button */}
      <button
        type="button"
        onClick={handleMicClick}
        disabled={uiState === 'processing'}
        aria-label={`Voice capture for ${label}`}
        title={
          uiState === 'listening'
            ? 'Tap to stop recording'
            : `Tap to speak ${label}`
        }
        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${micBtnClass}`}
      >
        {uiState === 'listening' ? (
          <MicOff className="w-4 h-4" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </button>

      {/* Listening indicator */}
      {uiState === 'listening' && (
        <span className="text-xs text-red-500 dark:text-red-400 font-medium animate-pulse select-none">
          Listening…
        </span>
      )}

      {/* Processing indicator */}
      {uiState === 'processing' && (
        <span className="text-xs text-amber-500 dark:text-amber-400 select-none">
          Matching…
        </span>
      )}

      {/* Error feedback */}
      {uiState === 'error' && (
        <span className="text-xs text-red-500 dark:text-red-400 select-none">
          Could not hear — try again
        </span>
      )}

      {/* Suggestion chips */}
      {uiState === 'suggestions' && suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 min-w-[220px] space-y-2">
          {/* Raw transcript hint */}
          {rawTranscript && (
            <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
              <HelpCircle className="w-3 h-3 flex-shrink-0" />
              Heard: &ldquo;{rawTranscript}&rdquo;
            </p>
          )}

          {/* Did you mean? heading if top 2 are close */}
          {suggestions.length > 1 &&
            suggestions[0].confidence - suggestions[1].confidence < 15 && (
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Did you mean…
              </p>
            )}

          {suggestions.map(s => (
            <button
              key={s.name}
              type="button"
              onClick={() => handleAccept(s.name)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg
                         bg-slate-50 dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/30
                         text-sm text-slate-800 dark:text-slate-100 transition-colors group"
            >
              <span className="font-medium">{s.name}</span>
              <div className="flex items-center gap-2 ml-auto">
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    s.confidence >= 80
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : s.confidence >= 55
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : 'bg-slate-200 text-slate-500 dark:bg-slate-600 dark:text-slate-400'
                  }`}
                >
                  {s.confidence}%
                </span>
                <Check className="w-3.5 h-3.5 text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}

          {/* Dismiss */}
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300
                       flex items-center justify-center gap-1 mt-1 transition-colors"
          >
            <X className="w-3 h-3" /> Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
