/**
 * Every hand-written route document. One file per route in this folder; add the import
 * and the array entry here. Order follows the sidebar (see the registry page).
 * src/lib/devdocs/__tests__/route-docs.test.mjs checks each against the real code.
 */
import type { RouteDoc } from '@/lib/devdocs/route-doc';
import dashboard from './dashboard';

export const ROUTE_DOCS: RouteDoc[] = [
  dashboard,
];
