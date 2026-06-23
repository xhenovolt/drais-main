'use client';

/**
 * useCurrency — the single client-side entry point for money formatting.
 *
 * Binds the school's display currency (from the authenticated user's school,
 * default UGX) to the canonical formatter in `@/lib/currency`. Every finance
 * page/component should format money via the returned `format()` so changing a
 * school's currency in Finance Settings updates the whole UI consistently.
 *
 *   const { format, code } = useCurrency();
 *   format(1500000)            // "UGX 1,500,000"
 *   format(amount, row.currency) // override for per-row currencies (wallets)
 */
import { useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, getCurrencyConfig, DEFAULT_CURRENCY } from '@/lib/currency';

export function useCurrency() {
  const { user } = useAuth();
  const code = (user?.school?.currency || DEFAULT_CURRENCY).toUpperCase();

  const format = useCallback(
    (amount: number | string | null | undefined, override?: string | null) =>
      formatCurrency(amount, override || code),
    [code],
  );

  const config = useMemo(() => getCurrencyConfig(code), [code]);

  return { format, code, config };
}
