/**
 * ═════════════════════════════════════════════════════════════════════════════
 * useRouteValidator Hook
 * 
 * Validates navigation routes on app startup (client-side)
 * Runs route verification in development mode
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { useEffect } from 'react';
import { logRouteValidation } from '@/lib/routeValidator';

export function useRouteValidator() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      logRouteValidation();
    }
  }, []);
}
