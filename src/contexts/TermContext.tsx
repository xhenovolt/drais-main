"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface Term {
  id: number;
  name: string;
  academic_year_id: number;
  academic_year_name: string;
  start_date: string;
  end_date: string;
}

interface TermContextType {
  currentTerm: Term | null;
  allTerms: Term[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

const TermContext = createContext<TermContextType | undefined>(undefined);

export const useTerm = (): TermContextType => {
  const ctx = useContext(TermContext);
  if (!ctx) throw new Error('useTerm must be used inside TermProvider');
  return ctx;
};

export const TermProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTerm, setCurrentTerm] = useState<Term | null>(null);
  const [allTerms, setAllTerms] = useState<Term[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTerms = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/terms/current', { credentials: 'include' });
      if (!res.ok) {
        // Unauthenticated — silently skip (user not logged in yet)
        if (res.status === 401) return;
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data?.success) {
        setCurrentTerm(data.data?.current ?? null);
        setAllTerms(data.data?.all ?? []);
      }
    } catch (err) {
      console.warn('[TermContext] Failed to fetch terms:', err);
      setError('Failed to load term data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTerms();
  }, [fetchTerms]);

  return (
    <TermContext.Provider value={{ currentTerm, allTerms, isLoading, error, refresh: fetchTerms }}>
      {children}
    </TermContext.Provider>
  );
};
