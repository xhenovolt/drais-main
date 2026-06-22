/**
 * Format currency. Delegates to the canonical helper in src/lib/currency.ts
 * (default UGX, per-currency symbol/decimals). Kept for back-compat with
 * existing imports. `locale` is ignored (formatting is currency-config driven).
 */
import { formatCurrency as formatCurrencyCanonical } from '@/lib/currency';

export const formatCurrency = (
  amount: number | string,
  currency: string = 'UGX',
  _locale?: string,
): string => {
  void _locale;
  return formatCurrencyCanonical(amount, currency);
};

/**
 * Format number with thousand separators
 */
export const formatNumber = (num: number | string, decimals: number = 0): string => {
  const numericValue = typeof num === 'string' ? parseFloat(num) : num;
  
  if (isNaN(numericValue)) {
    return '0';
  }

  return numericValue.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

/**
 * Parse and clean currency input
 */
export const parseCurrency = (value: string): number => {
  // Remove currency symbols, spaces, and commas
  const cleaned = value.replace(/[^\d.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};
