// Finance Module Role-Based Access Control

export type FinanceRole = 'admin' | 'finance_officer' | 'accountant' | 'head_teacher' | 'viewer';

export interface FinancePermission {
  canDefineFees: boolean;
  canApplyWaivers: boolean;
  canProcessPayments: boolean;
  canEditRecords: boolean;
  canViewReports: boolean;
  canExportData: boolean;
  canManageWallets: boolean;
  canVoidTransactions: boolean;
}

export const financePermissions: Record<FinanceRole, FinancePermission> = {
  admin: {
    canDefineFees: true,
    canApplyWaivers: true,
    canProcessPayments: true,
    canEditRecords: true,
    canViewReports: true,
    canExportData: true,
    canManageWallets: true,
    canVoidTransactions: true
  },
  finance_officer: {
    canDefineFees: true,
    canApplyWaivers: true,
    canProcessPayments: true,
    canEditRecords: true,
    canViewReports: true,
    canExportData: true,
    canManageWallets: true,
    canVoidTransactions: true
  },
  accountant: {
    canDefineFees: false,
    canApplyWaivers: false,
    canProcessPayments: true,
    canEditRecords: false,
    canViewReports: true,
    canExportData: true,
    canManageWallets: false,
    canVoidTransactions: false
  },
  head_teacher: {
    canDefineFees: false,
    canApplyWaivers: false,
    canProcessPayments: false,
    canEditRecords: false,
    canViewReports: true,
    canExportData: false,
    canManageWallets: false,
    canVoidTransactions: false
  },
  viewer: {
    canDefineFees: false,
    canApplyWaivers: false,
    canProcessPayments: false,
    canEditRecords: false,
    canViewReports: true,
    canExportData: false,
    canManageWallets: false,
    canVoidTransactions: false
  }
};

// Check if user has permission for specific action
export function hasFinancePermission(
  userRole: FinanceRole,
  permission: keyof FinancePermission
): boolean {
  const permissions = financePermissions[userRole];
  return permissions ? permissions[permission] : false;
}

// Get allowed actions for a role
export function getAllowedFinanceActions(userRole: FinanceRole): string[] {
  const permissions = financePermissions[userRole];
  if (!permissions) return [];
  
  return Object.entries(permissions)
    .filter(([, value]) => value)
    .map(([key]) => key.replace('can', ''));
}

// Role hierarchy for escalation
export const roleHierarchy: FinanceRole[] = [
  'viewer',
  'head_teacher',
  'accountant',
  'finance_officer',
  'admin'
];

// Check if role can override another role's decisions
export function canOverride(role1: FinanceRole, role2: FinanceRole): boolean {
  const index1 = roleHierarchy.indexOf(role1);
  const index2 = roleHierarchy.indexOf(role2);
  return index1 > index2;
}
