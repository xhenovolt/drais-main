/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ROUTE VALIDATOR
 * 
 * ⚡ CRITICAL MODULE: Validates that all navigation routes actually exist
 * 
 * PURPOSE:
 * - Detect broken navigation links before they hurt UX
 * - Warn developers when routes are removed/renamed
 * - Prevent "invisible" routes from appearing in navigation
 * - Validate routes on app startup
 * 
 * HOW IT WORKS:
 * - Compares routes in navigationConfig against known app routes
 * - Logs warnings for routes that don't exist
 * - Can be run in development mode (client + server)
 * 
 * USAGE:
 * ```
 * // In a server component or API route
 * import { validateRoutes } from '@/lib/routeValidator';
 * validateRoutes();
 * ```
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { MenuItem, getNavigationItems } from './navigationConfig';

/**
 * Known routes in the application (derived from /app directory structure)
 * Add routes here as they're added to the codebase
 */
export const KNOWN_ROUTES = new Set<string>([
  // Auth & Public
  '/login',
  '/signup',
  '/auth/login',
  '/school-selection',
  '/fingerprint-auth',
  
  // Dashboard
  '/dashboard',
  '/dashboard/analytics',
  
  // Students
  '/students',
  '/students/list',
  '/students/admit',
  '/students/enroll',
  '/students/import',
  '/students/history',
  '/students/requirements',
  '/students/[id]',
  '/students/attendance',
  '/students/documents',
  '/students/contacts',
  
  // Staff
  '/staff',
  '/staff/list',
  '/staff/add',
  '/staff/attendance',
  '/staff/attendence',
  '/staff/roles',
  '/departments',
  '/work-plans',
  
  // Attendance (CRITICAL)
  '/attendance',
  '/attendance/reconcile',
  '/attendance/dahua',
  '/attendance/devices',
  '/attendance/reports',
  '/attendance/sessions',
  '/attendance/biometric',
  
  // Academics
  '/academics',
  '/academics/years',
  '/academics/classes',
  '/academics/results',
  '/academics/tahfiz',
  '/academics/streams',
  '/academics/timetable',
  '/academics/reports',
  '/academics/exams',
  '/academics/subjects',
  
  // Tahfiz
  '/tahfiz',
  '/tahfiz/results',
  '/tahfiz/records',
  '/tahfiz/books',
  '/tahfiz/plans',
  '/tahfiz/groups',
  '/tahfiz/reports',
  '/tahfiz/reports/[id]',
  '/tahfiz/portions',
  '/tahfiz/attendance',
  '/tahfiz/learners',
  '/tahfiz/students',
  
  // Finance
  '/finance',
  '/finance/payments',
  '/finance/ledger',
  '/finance/ledger/fees',
  '/finance/wallets',
  '/finance/fees',
  '/finance/learners-fees',
  '/finance/expenditures',
  
  // Payroll
  '/payroll',
  '/payroll/payments',
  '/payroll/definitions',
  '/payroll/salary_payments',
  '/payroll/salaries',
  
  // Reports
  '/reports',
  '/reports/kitchen',
  '/reports/learners',
  
  // Terms
  '/terms/list',
  '/terms/[id]',
  
  // Inventory
  '/inventory',
  '/inventory/transactions',
  '/inventory/stores',
  '/inventory/items',
  
  // Settings
  '/settings',
  '/settings/school',
  '/settings/study-modes',
  
  // Other
  '/events',
  '/documents',
  '/reminders',
  '/deadlines',
  '/promotions',
  '/results',
  '/help',
  '/notifications',
  '/docs',
  '/docs/authentication',
  '/docs/overview',
  '/workplans',
]);

/**
 * Collect all routes from navigation config (recursively)
 */
function collectRoutesFromNav(items: MenuItem[]): string[] {
  const routes: string[] = [];

  const traverse = (menuItems: MenuItem[]) => {
    for (const item of menuItems) {
      if (item.href) {
        routes.push(item.href);
      }
      if (item.children) {
        traverse(item.children);
      }
    }
  };

  traverse(items);
  return routes;
}

/**
 * Validate routes in navigation config
 * Returns validation report with warnings
 */
export function validateRoutes(): {
  valid: boolean;
  warnings: string[];
  missingRoutes: string[];
} {
  const warnings: string[] = [];
  const missingRoutes: string[] = [];

  // Get all routes from navigation config (pass dummy translator)
  const navItems = getNavigationItems((key: string, fallback?: string) => fallback || key);
  const navRoutes = collectRoutesFromNav(navItems);

  // Check each nav route against known routes
  for (const route of navRoutes) {
    // Skip routes with dynamic segments for exact matching
    const normalizedRoute = route.replace(/\[id\]/g, '[id]').replace(/\.\.\./g, '...');

    // Check if route exists (allowing for dynamic segments)
    const routeExists = Array.from(KNOWN_ROUTES).some(knownRoute => {
      // Exact match
      if (knownRoute === normalizedRoute) return true;
      // Match with dynamic segments
      if (normalizedRoute.includes('[') && knownRoute.includes('[')) {
        const navPattern = normalizedRoute.replace(/\[[^\]]+\]/g, '[*]');
        const knownPattern = knownRoute.replace(/\[[^\]]+\]/g, '[*]');
        return navPattern === knownPattern;
      }
      return false;
    });

    if (!routeExists) {
      missingRoutes.push(route);
      warnings.push(`⚠️  Route "${route}" in navigation.config is not in KNOWN_ROUTES`);
    }
  }

  if (typeof window !== 'undefined') {
    if (warnings.length > 0) {
      console.warn('🚨 Navigation Route Validation Warnings:');
      warnings.forEach(w => console.warn(w));
    } else {
      console.log('✅ All navigation routes are valid');
    }
  }

  return {
    valid: missingRoutes.length === 0,
    warnings,
    missingRoutes,
  };
}

/**
 * Check if a specific route exists
 */
export function routeExists(route: string): boolean {
  return Array.from(KNOWN_ROUTES).some(knownRoute => {
    if (knownRoute === route) return true;
    // Match with dynamic segments
    if (route.includes('[') && knownRoute.includes('[')) {
      const routePattern = route.replace(/\[[^\]]+\]/g, '[*]');
      const knownPattern = knownRoute.replace(/\[[^\]]+\]/g, '[*]');
      return routePattern === knownPattern;
    }
    return false;
  });
}

/**
 * Log route validation during development
 */
export function logRouteValidation() {
  if (typeof window !== 'undefined') {
    const report = validateRoutes();
    if (!report.valid) {
      console.error('🔴 Missing Routes Detected:', report.missingRoutes);
      console.error('Please update KNOWN_ROUTES in routeValidator.ts');
    }
  }
}
