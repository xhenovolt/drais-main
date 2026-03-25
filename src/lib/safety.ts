/**
 * SAFETY UTILITIES
 * 
 * Prevent runtime crashes from unsafe data handling
 * All data-access operations must go through these utilities
 */

/**
 * Safely convert any value to string
 * Returns empty string if value is null/undefined/not-string
 */
export function safeString(value: any): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

/**
 * Safely ensure value is an array
 * Returns empty array if value is null/undefined/not-array
 */
export function safeArray<T>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

/**
 * Safely ensure value is an object
 * Returns empty object if value is null/undefined/not-object
 */
export function safeObject(value: any): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

/**
 * Safely get nested property with fallback
 * Returns defaultValue if path doesn't exist or is null/undefined
 */
export function safeGet(
  obj: any,
  path: string,
  defaultValue: any = null
): any {
  try {
    const value = path.split('.').reduce((acc, part) => acc?.[part], obj);
    return value !== undefined && value !== null ? value : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Safe case-insensitive search
 * Both value and searchTerm are safely converted to lowercase strings
 */
export function safeSearchMatch(
  value: any,
  searchTerm: string
): boolean {
  const normalizedValue = safeString(value).toLowerCase();
  const normalizedTerm = safeString(searchTerm).toLowerCase();
  return normalizedValue.includes(normalizedTerm);
}

/**
 * Safe filter by multiple fields
 * Used for search operations across multiple student properties
 */
export function safeMultiFieldFilter<T extends Record<string, any>>(
  items: T[],
  searchTerm: string,
  fields: (keyof T)[]
): T[] {
  if (!Array.isArray(items) || !searchTerm.trim()) return items;

  const normalizedTerm = safeString(searchTerm).toLowerCase();
  return items.filter((item) =>
    fields.some((field) => safeSearchMatch(item[field], normalizedTerm))
  );
}

/**
 * Standardize API response to consistent format
 * Always returns { success: boolean, data: T[] }
 */
export function standardizeResponse<T>(response: any): { success: boolean; data: T[] } {
  // Handle array response directly
  if (Array.isArray(response)) {
    return { success: true, data: response };
  }

  // Handle object with data property
  if (response?.data && Array.isArray(response.data)) {
    return { success: Boolean(response.success !== false), data: response.data };
  }

  // Handle success flag
  if (response?.success === true && Array.isArray(response.data)) {
    return { success: true, data: response.data };
  }

  // Default: empty array
  return { success: false, data: [] };
}

/**
 * Safe number conversion
 * Returns defaultValue if conversion fails
 */
export function safeNumber(value: any, defaultValue: number = 0): number {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Safe boolean conversion
 * Only true values: true, 1, '1', 'true', 'yes'
 */
export function safeBoolean(value: any, defaultValue: boolean = false): boolean {
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 1].includes(value) || defaultValue;
}

/**
 * Logger with scoping for debugging
 */
export function scopedLogger(scope: string) {
  return {
    log: (...args: any[]) => console.log(`[${scope}]`, ...args),
    error: (...args: any[]) => console.error(`[${scope}] ❌`, ...args),
    warn: (...args: any[]) => console.warn(`[${scope}] ⚠️`, ...args),
    debug: (...args: any[]) => {
      if (typeof window !== 'undefined' && (window as any).__DEBUG) {
        console.log(`[${scope}] 🔍`, ...args);
      }
    },
  };
}

/**
 * Assert value is an array, log error if not
 */
export function assertArray<T>(
  value: any,
  fieldName: string,
  logger: ReturnType<typeof scopedLogger>
): value is T[] {
  if (!Array.isArray(value)) {
    logger.error(`${fieldName} is not array:`, value);
    return false;
  }
  return true;
}

/**
 * Assert value is not null/undefined, log error if not
 */
export function assertDefined<T>(
  value: any,
  fieldName: string,
  logger: ReturnType<typeof scopedLogger>
): value is T {
  if (value === null || value === undefined) {
    logger.error(`${fieldName} is null/undefined`);
    return false;
  }
  return true;
}
