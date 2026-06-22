/**
 * Canonical currency formatting for DRAIS. ONE source of truth used by finance
 * pages, receipts, invoices, dashboards, exports, and the parent portal.
 *
 * Default is UGX (Ugandan Shilling). Schools may choose another currency
 * (stored in schools.currency). Display only — amounts are never converted.
 */
export interface CurrencyConfig {
  code: string;
  symbol: string;
  decimals: number;
  position: 'prefix' | 'suffix';
}

export const DEFAULT_CURRENCY = 'UGX';

export const CURRENCIES: Record<string, CurrencyConfig> = {
  UGX: { code: 'UGX', symbol: 'UGX', decimals: 0, position: 'prefix' },
  USD: { code: 'USD', symbol: '$',   decimals: 2, position: 'prefix' },
  KES: { code: 'KES', symbol: 'KSh', decimals: 0, position: 'prefix' },
  TZS: { code: 'TZS', symbol: 'TSh', decimals: 0, position: 'prefix' },
  RWF: { code: 'RWF', symbol: 'RWF', decimals: 0, position: 'prefix' },
  SSP: { code: 'SSP', symbol: 'SSP', decimals: 2, position: 'prefix' },
  EUR: { code: 'EUR', symbol: '€',   decimals: 2, position: 'prefix' },
  GBP: { code: 'GBP', symbol: '£',   decimals: 2, position: 'prefix' },
};

/** Supported currencies for pickers. */
export const SUPPORTED_CURRENCIES = Object.values(CURRENCIES);

/** Resolve a config for a code; unknown codes degrade to using the code as its own symbol. */
export function getCurrencyConfig(code?: string | null): CurrencyConfig {
  const c = (code || DEFAULT_CURRENCY).toUpperCase();
  return CURRENCIES[c] || { code: c, symbol: c, decimals: 0, position: 'prefix' };
}

/**
 * Format an amount in the given currency code (default UGX).
 * e.g. formatCurrency(1500000) -> "UGX 1,500,000"; formatCurrency(12.5,'USD') -> "$ 12.50"
 */
export function formatCurrency(amount: number | string | null | undefined, code: string = DEFAULT_CURRENCY): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0);
  const cfg = getCurrencyConfig(code);
  const num = (Number.isFinite(n) ? (n as number) : 0).toLocaleString('en-US', {
    minimumFractionDigits: cfg.decimals,
    maximumFractionDigits: cfg.decimals,
  });
  return cfg.position === 'suffix' ? `${num} ${cfg.symbol}` : `${cfg.symbol} ${num}`;
}

/** Strip symbols/separators back to a number. */
export function parseCurrency(value: string): number {
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}
