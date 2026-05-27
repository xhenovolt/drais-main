/**
 * Search entity registry. Each searchable entity type declares:
 *  - the RBAC permissions that allow seeing results of that type (MATCH-ANY:
 *    holding any one of them is enough — so view-and-manage roles both qualify)
 *  - a base rank weight (higher = surfaces first when scores tie)
 *  - a human label + icon hint for grouping in the palette
 *
 * RBAC is enforced at query time: the search only queries entity_types whose
 * permission the caller actually holds (super-admin sees all). Codes below are
 * the real catalog codes (src/lib/rbac/catalog.ts).
 */

export type SearchEntityType =
  | 'student' | 'staff' | 'class' | 'subject'
  | 'invoice' | 'payment' | 'sms' | 'report';

export interface EntitySpec {
  type:        SearchEntityType;
  label:       string;
  icon:        string;          // lucide icon name (resolved client-side)
  permissions: string[];        // match-any; [] = any authenticated user
  rankWeight:  number;
}

export const SEARCH_ENTITIES: Record<SearchEntityType, EntitySpec> = {
  student: { type: 'student', label: 'Learners', icon: 'User',
    permissions: ['students.manage', 'academics.students.manage', 'attendance.view'], rankWeight: 200 },
  staff:   { type: 'staff', label: 'Staff', icon: 'Briefcase',
    permissions: ['staff.read', 'staff.update', 'staff.create'], rankWeight: 180 },
  class:   { type: 'class', label: 'Classes', icon: 'School',
    permissions: ['academics.students.manage', 'academics.timetable.manage', 'attendance.view'], rankWeight: 150 },
  subject: { type: 'subject', label: 'Subjects', icon: 'BookOpen',
    permissions: ['academics.timetable.manage', 'academics.results.update', 'results.update'], rankWeight: 140 },
  invoice: { type: 'invoice', label: 'Invoices', icon: 'FileText',
    permissions: ['finance.view', 'finance.fees.manage', 'finance.payments.view'], rankWeight: 130 },
  payment: { type: 'payment', label: 'Payments', icon: 'CreditCard',
    permissions: ['finance.view', 'finance.payments.view', 'finance.fees.manage'], rankWeight: 130 },
  sms:     { type: 'sms', label: 'SMS Logs', icon: 'MessageSquare',
    permissions: ['comm.dispatch.view', 'comm.dispatch.send'], rankWeight: 90 },
  report:  { type: 'report', label: 'Reports', icon: 'BarChart3',
    permissions: ['reports.view', 'results.update', 'academics.results.update'], rankWeight: 120 },
};

/** Entity types the user may search, given their permission set (match-any). */
export function permittedEntityTypes(perms: string[], isSuperAdmin: boolean): SearchEntityType[] {
  const all = Object.values(SEARCH_ENTITIES);
  if (isSuperAdmin) return all.map(e => e.type);
  const set = new Set(perms);
  return all
    .filter(e => e.permissions.length === 0 || e.permissions.some(p => set.has(p)))
    .map(e => e.type);
}
