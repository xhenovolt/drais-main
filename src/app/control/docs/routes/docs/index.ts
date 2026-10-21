/**
 * Every hand-written route document. One file per route in this folder; add the import
 * and the array entry here. Order follows the sidebar (see the registry page).
 * src/lib/devdocs/__tests__/route-docs.test.mjs checks each against the real code.
 */
import type { RouteDoc } from '@/lib/devdocs/route-doc';
import dashboard from './dashboard';
import dashboardAnalytics from './dashboard-analytics';
import attendance from './attendance';
import attendanceLogs from './attendance-logs';
import attendanceLessons from './attendance-lessons';
import attendanceShifts from './attendance-shifts';
import attendanceHolidays from './attendance-holidays';
import attendanceHealth from './attendance-health';
import attendanceRecovery from './attendance-recovery';
import attendanceFounder from './attendance-founder-independence';
import attendanceTrends from './attendance-trends';
import attendanceProfiles from './attendance-profiles';
import attendanceTrace from './attendance-trace';
import attendanceBiometricUnassigned from './attendance-biometric-unassigned';

export const ROUTE_DOCS: RouteDoc[] = [
  dashboard,
  dashboardAnalytics,
  attendance,
  attendanceLogs,
  attendanceLessons,
  attendanceShifts,
  attendanceHolidays,
  attendanceHealth,
  attendanceRecovery,
  attendanceFounder,
  attendanceTrends,
  attendanceProfiles,
  attendanceTrace,
  attendanceBiometricUnassigned,
];
