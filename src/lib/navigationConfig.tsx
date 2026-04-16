/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DRAIS ENTERPRISE NAVIGATION — Single Source of Truth
 *
 * ALL sidebar/drawer routes are defined here. No hardcoding anywhere else.
 * Structure:
 *   Dashboard → Students → Staff & Roles → Academics →
 *   Attendance → Finance → Tahfiz → Reports → Settings
 *
 * 9 sections total. Attendance is a standalone top-level section.
 * Finance is separated from Attendance for clarity.
 *
 * Roles: items without `roles` are visible to everyone authenticated.
 *        items with roles: ['admin','super_admin'] are admin-only.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import React from 'react';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  Calendar,
  ClipboardList,
  UserCheck,
  DollarSign,
  FileText,
  Settings,
  Building,
  UserPlus,
  Award,
  Clock,
  PieChart,
  Bell,
  Archive,
  Briefcase,
  Map,
  School,
  BookMarked,
  Target,
  CheckSquare,
  CreditCard,
  Receipt,
  Wallet,
  TrendingUp,
  TrendingDown,
  Scale,
  BarChart3,
  FileBarChart,
  UserCog,
  Shield,
  Cog,
  HelpCircle,
  Phone,
  Mail,
  Package,
  Truck,
  Clipboard,
  AlarmClock,
  MessageSquare,
  FolderTree,
  Coins,
  BadgeDollarSign,
  Percent,
  FilePlus2,
  FileStack,
  FileCog,
  ShieldCheck,
  ChartBar,
  Palette,
  Activity,
  Fingerprint,
  Book,
  FileSearch,
  ArrowUpDown,
  Radio,
  AlertTriangle,
} from 'lucide-react';

// Alias so callers don't have to worry about icon substitution
const TahfizIcon = BookOpen;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  /** Route href — omit for parent groups */
  href?: string;
  /** Nested children */
  children?: MenuItem[];
  /**
   * Role slugs required to see this item.
   * - `undefined` / empty → visible to everyone
   * - `['admin']`         → only users with "admin" role (or isSuperAdmin)
   * - `['admin', 'staff_admin']` → either of those roles
   */
  roles?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter helper — call from sidebar to strip items the user cannot see
// ─────────────────────────────────────────────────────────────────────────────

export function filterMenuByRole(
  items: MenuItem[],
  hasRole: (slug: string) => boolean,
  isSuperAdmin: boolean,
): MenuItem[] {
  return items.reduce<MenuItem[]>((acc, item) => {
    // Check top-level visibility
    if (item.roles && item.roles.length > 0 && !isSuperAdmin) {
      if (!item.roles.some(role => hasRole(role))) return acc;
    }
    // Recursively filter children
    if (item.children) {
      const filteredChildren = filterMenuByRole(item.children, hasRole, isSuperAdmin);
      acc.push({ ...item, children: filteredChildren });
    } else {
      acc.push(item);
    }
    return acc;
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation items factory
// t = i18n translation function from useI18n()
// ─────────────────────────────────────────────────────────────────────────────
// Navigation items factory — ENTERPRISE EDITION
// Clean 8-section hierarchy. No duplicate routes. Single source of truth.
// t = i18n translation function
// ─────────────────────────────────────────────────────────────────────────────

export function getNavigationItems(
  t: (key: string, fallback?: string) => string,
): MenuItem[] {
  return [

    // ══ 1. DASHBOARD ══════════════════════════════════════════════════════════
    {
      key:   'dashboard',
      label: 'Overview',
      icon:  <LayoutDashboard className="w-5 h-5" />,
      href:  '/dashboard',
    },

    // ══ 2. STUDENTS ═══════════════════════════════════════════════════════════
    {
      key:   'students',
      label: t('nav.students._', 'Students'),
      icon:  <Users className="w-5 h-5" />,
      children: [
        { key: 'students-list',         label: t('nav.students.list', 'Student List'),         icon: <Users className="w-4 h-4" />,       href: '/students/list' },
        { key: 'students-admit',        label: t('nav.students.admit', 'Admit Student'),        icon: <UserPlus className="w-4 h-4" />,    href: '/students/admit' },
        { key: 'students-enroll',       label: t('nav.students.enroll', 'Enroll Student'),      icon: <GraduationCap className="w-4 h-4" />, href: '/students/enroll' },
        { key: 'students-requirements', label: t('nav.students.requirements', 'Requirements'),  icon: <CheckSquare className="w-4 h-4" />, href: '/students/requirements' },
        { key: 'students-contacts',     label: t('nav.students.contacts', 'Contacts'),          icon: <Phone className="w-4 h-4" />,       href: '/students/contacts' },
        { key: 'students-documents',    label: t('nav.students.documents', 'Documents'),        icon: <FileText className="w-4 h-4" />,    href: '/students/documents' },
        { key: 'students-duplicates',   label: t('nav.students.duplicates', 'Duplicates'),      icon: <AlertTriangle className="w-4 h-4" />, href: '/students/duplicates' },
        { key: 'students-history',      label: t('nav.students.history', 'History'),            icon: <Archive className="w-4 h-4" />,     href: '/students/history' },
        { key: 'students-id-cards',     label: 'ID Cards',                                      icon: <CreditCard className="w-4 h-4" />,  href: '/students/id-cards' },
      ],
    },

    // ══ 3. STAFF & ROLES ══════════════════════════════════════════════════════
    // Consolidated: old "Staff" group + old "Administration" group
    {
      key:   'staff-roles',
      label: 'Staff & Roles',
      icon:  <ShieldCheck className="w-5 h-5" />,
      roles: ['admin', 'super_admin'],
      children: [
        { key: 'admin-users',       label: 'User Management',    icon: <UserCog className="w-4 h-4" />,    href: '/admin/users',         roles: ['admin', 'super_admin'] },
        { key: 'staff-view',        label: 'View Staff',         icon: <Briefcase className="w-4 h-4" />,  href: '/staff' },
        { key: 'staff-add',         label: 'Add Staff',          icon: <UserPlus className="w-4 h-4" />,   href: '/staff/add' },
        { key: 'workplans',         label: 'Workplans',          icon: <Clipboard className="w-4 h-4" />,  href: '/work-plans' },
        { key: 'admin-departments', label: 'Departments',        icon: <Building className="w-4 h-4" />,   href: '/admin/departments',   roles: ['admin', 'super_admin'] },
        { key: 'admin-roles',       label: 'Roles & Permissions',icon: <Shield className="w-4 h-4" />,     href: '/admin/roles',         roles: ['admin', 'super_admin'] },
        { key: 'admin-sessions',    label: 'User Monitoring',    icon: <Activity className="w-4 h-4" />,   href: '/admin/user-sessions', roles: ['admin', 'super_admin'] },
        { key: 'admin-audit-logs',  label: 'Audit Trail',        icon: <FileSearch className="w-4 h-4" />, href: '/admin/audit-logs',    roles: ['admin', 'super_admin'] },
      ],
    },

    // ══ 4. ACADEMICS ══════════════════════════════════════════════════════════
    // Consolidated: Academics + Examinations + Promotions
    {
      key:   'academics',
      label: t('nav.academics._', 'Academics'),
      icon:  <GraduationCap className="w-5 h-5" />,
      children: [
        { key: 'workplans-ac',    label: 'Workplans',       icon: <Clipboard className="w-4 h-4" />,    href: '/work-plans' },
        { key: 'classes',         label: 'Classes',          icon: <School className="w-4 h-4" />,       href: '/academics/classes' },
        { key: 'streams',         label: 'Streams',          icon: <Target className="w-4 h-4" />,       href: '/academics/streams' },
        { key: 'subjects',        label: 'Subjects',         icon: <BookOpen className="w-4 h-4" />,     href: '/academics/subjects' },
        { key: 'timetable',       label: 'Timetable',        icon: <Calendar className="w-4 h-4" />,     href: '/academics/timetable' },
        { key: 'academic-years',  label: 'Academic Years',   icon: <Calendar className="w-4 h-4" />,     href: '/academics/years' },
        { key: 'terms',           label: 'Terms',            icon: <Clock className="w-4 h-4" />,        href: '/terms/list' },
        { key: 'curriculums',     label: 'Curriculums',      icon: <BookMarked className="w-4 h-4" />,   href: '/academics/curriculums' },
        { key: 'promotions',      label: 'Promotions',       icon: <TrendingUp className="w-4 h-4" />,   href: '/promotions' },
        { key: 'exams',           label: 'Examinations',     icon: <ClipboardList className="w-4 h-4" />,href: '/academics/exams' },
        { key: 'results',         label: 'Results',          icon: <Award className="w-4 h-4" />,        href: '/academics/results' },
        { key: 'report-cards',    label: 'Report Cards',     icon: <FileText className="w-4 h-4" />,     href: '/academics/reports' },
        { key: 'report-kitchen',  label: 'Template Kitchen', icon: <Palette className="w-4 h-4" />,      href: '/reports/kitchen', roles: ['admin', 'super_admin'] },
        { key: 'deadlines',       label: 'Deadlines',        icon: <AlarmClock className="w-4 h-4" />,   href: '/examinations/deadlines' },
      ],
    },

    // ══ 5. ATTENDANCE (PRIORITY) ══════════════════════════════════════════════
    // Attendance-first architecture: biometrics, devices, monitoring
    {
      key:   'attendance',
      label: 'Attendance',
      icon:  <UserCheck className="w-5 h-5" />,
      children: [
        { key: 'att-dashboard',      label: 'Dashboard',         icon: <UserCheck className="w-4 h-4" />,    href: '/attendance' },
        { key: 'att-logs',           label: 'Attendance Logs',   icon: <FileSearch className="w-4 h-4" />,   href: '/attendance/logs' },
        { key: 'att-device-logs',    label: 'Device Logs',       icon: <Activity className="w-4 h-4" />,     href: '/attendance/device-logs' },
        { key: 'att-devices',        label: 'Devices',           icon: <Fingerprint className="w-4 h-4" />,  href: '/attendance/devices' },
        { key: 'att-enrollment',     label: 'Enrollment Station', icon: <UserPlus className="w-4 h-4" />,    href: '/attendance/enrollment' },
        { key: 'att-mapping',        label: 'User Mapping',      icon: <Users className="w-4 h-4" />,        href: '/attendance/mapping' },
        { key: 'att-commands',       label: 'Command Center',    icon: <ArrowUpDown className="w-4 h-4" />,  href: '/attendance/commands', roles: ['admin', 'super_admin'] },
        { key: 'att-cmd-monitor',    label: 'Command Monitor',   icon: <Activity className="w-4 h-4" />,    href: '/attendance/devices/commands', roles: ['admin', 'super_admin'] },
        { key: 'att-device-ctrl',    label: 'Device Control',    icon: <Fingerprint className="w-4 h-4" />,  href: '/attendance/device-control', roles: ['admin', 'super_admin'] },
        { key: 'att-remote',         label: 'Remote Features',   icon: <Activity className="w-4 h-4" />,    href: '/attendance/remote-features', roles: ['admin', 'super_admin'] },
        { key: 'att-monitor',        label: 'Live Monitor',      icon: <Radio className="w-4 h-4" />,       href: '/admin/biometric-monitor', roles: ['admin', 'super_admin'] },
        { key: 'att-settings',       label: 'Settings',          icon: <Settings className="w-4 h-4" />,    href: '/attendance/settings', roles: ['admin', 'super_admin'] },
      ],
    },

    // ══ 6. FINANCE ════════════════════════════════════════════════════════════
    {
      key:   'finance',
      label: 'Finance',
      icon:  <Wallet className="w-5 h-5" />,
      children: [
        { key: 'finance-dashboard',  label: 'Overview',          icon: <DollarSign className="w-4 h-4" />,   href: '/finance' },
        { key: 'fees',               label: 'Fees',              icon: <CreditCard className="w-4 h-4" />,   href: '/finance/fees' },
        { key: 'learners-fees',      label: 'Learner Fees',      icon: <Users className="w-4 h-4" />,        href: '/finance/learners-fees' },
        { key: 'payments',           label: 'Payments',          icon: <Receipt className="w-4 h-4" />,      href: '/finance/payments' },
        { key: 'wallets',            label: 'Wallets',           icon: <Wallet className="w-4 h-4" />,       href: '/finance/wallets' },
        { key: 'ledger',             label: 'Ledger',            icon: <FileText className="w-4 h-4" />,     href: '/finance/ledger-v2' },
        { key: 'waivers',            label: 'Waivers',           icon: <Percent className="w-4 h-4" />,      href: '/finance/waivers' },
        { key: 'expenditures',       label: 'Expenditures',      icon: <TrendingDown className="w-4 h-4" />, href: '/finance/expenditures' },
        { key: 'payroll-salaries',   label: 'Payroll',           icon: <Coins className="w-4 h-4" />,        href: '/payroll/salaries' },
        { key: 'payroll-payments',   label: 'Pay Runs',          icon: <BadgeDollarSign className="w-4 h-4" />, href: '/payroll/payments' },
      ],
    },

    // ══ 7. TAHFIZ ═════════════════════════════════════════════════════════════
    {
      key:   'tahfiz',
      label: t('nav.tahfiz._', 'Tahfiz'),
      icon:  <BookOpen className="w-5 h-5 text-amber-600" />,
      children: [
        { key: 'tahfiz-overview',   label: 'Overview',    icon: <BarChart3 className="w-4 h-4" />,   href: '/tahfiz' },
        { key: 'tahfiz-learners',   label: 'Learners',    icon: <Users className="w-4 h-4" />,       href: '/tahfiz/students' },
        { key: 'tahfiz-records',    label: 'Records',     icon: <FileText className="w-4 h-4" />,    href: '/tahfiz/records' },
        { key: 'tahfiz-books',      label: 'Books',       icon: <Book className="w-4 h-4" />,        href: '/tahfiz/books' },
        { key: 'tahfiz-portions',   label: 'Portions',    icon: <BookMarked className="w-4 h-4" />,  href: '/tahfiz/portions' },
        { key: 'tahfiz-groups',     label: 'Groups',      icon: <Users className="w-4 h-4" />,       href: '/tahfiz/groups' },
        { key: 'tahfiz-attendance', label: 'Attendance',  icon: <Clock className="w-4 h-4" />,       href: '/tahfiz/attendance' },
        { key: 'tahfiz-plans',      label: 'Plans',       icon: <Target className="w-4 h-4" />,      href: '/tahfiz/plans' },
        { key: 'tahfiz-results',    label: 'Results',     icon: <Award className="w-4 h-4" />,       href: '/tahfiz/results' },
        { key: 'tahfiz-reports',    label: 'Reports',     icon: <BarChart3 className="w-4 h-4" />,   href: '/tahfiz/reports' },
      ],
    },

    // ══ 8. REPORTS & ANALYTICS ════════════════════════════════════════════════
    {
      key:   'reports',
      label: t('nav.reports._', 'Reports'),
      icon:  <ChartBar className="w-5 h-5" />,
      children: [
        { key: 'analytics-students', label: 'Students',         icon: <Users className="w-4 h-4" />,        href: '/analytics/students' },
        { key: 'analytics-staff',    label: 'Staff',            icon: <Briefcase className="w-4 h-4" />,    href: '/analytics/staff' },
        { key: 'analytics-finance',  label: 'Finance',          icon: <Scale className="w-4 h-4" />,        href: '/analytics/finance' },
        { key: 'income-statement',   label: 'Income Statement', icon: <FileBarChart className="w-4 h-4" />, href: '/finance/reports/income-statement' },
        { key: 'balance-sheet',      label: 'Balance Sheet',    icon: <Scale className="w-4 h-4" />,        href: '/finance/reports/balance-sheet' },
        { key: 'custom-reports',     label: 'Custom Reports',   icon: <PieChart className="w-4 h-4" />,     href: '/reports/custom' },
      ],
    },

    // ══ 9. SETTINGS ═══════════════════════════════════════════════════════════
    {
      key:   'settings',
      label: t('nav.settings._', 'Settings'),
      icon:  <Settings className="w-5 h-5" />,
      children: [
        { key: 'school-settings', label: 'School',         icon: <School className="w-4 h-4" />,   href: '/settings/school' },
        { key: 'appearance',      label: 'Appearance',     icon: <Palette className="w-4 h-4" />,  href: '/settings/appearance' },
        { key: 'profile',         label: 'My Profile',     icon: <UserCog className="w-4 h-4" />,  href: '/settings/profile' },
        { key: 'templates',       label: 'Templates',      icon: <FileCog className="w-4 h-4" />,  href: '/settings/templates' },
        { key: 'system-status',   label: 'System Status',  icon: <Activity className="w-4 h-4" />, href: '/settings/system' },
        { key: 'relay-setup',     label: 'Relay Setup',    icon: <Radio className="w-4 h-4" />,    href: '/settings/relay' },
        { key: 'inventory',       label: 'Inventory',      icon: <Package className="w-4 h-4" />,  href: '/inventory/stores' },
        { key: 'help',            label: 'Help & Support', icon: <HelpCircle className="w-4 h-4" />, href: '/help' },
      ],
    },
  ];
}
