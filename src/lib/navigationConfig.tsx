/**
 * Central navigation configuration.
 * All sidebar menu items live here — NO hardcoding in sidebar components.
 * Add `roles` to restrict items to specific role slugs.
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

export function getNavigationItems(
  t: (key: string, fallback?: string) => string,
): MenuItem[] {
  return [
    // ── Dashboard ────────────────────────────────────────────────────────────
    {
      key: 'dashboard',
      label: t('nav.dashboard'),
      icon: <LayoutDashboard className="w-5 h-5" />,
      href: '/dashboard',
    },

    // ── Students ─────────────────────────────────────────────────────────────
    {
      key: 'students',
      label: t('nav.students._'),
      icon: <Users className="w-5 h-5" />,
      children: [
        { key: 'students-list',         label: t('nav.students.list'),                           icon: <Users className="w-4 h-4" />,       href: '/students/list' },
        { key: 'students-admit',        label: t('nav.students.admit', 'Admit Student'),          icon: <UserPlus className="w-4 h-4" />,    href: '/students/admit' },
        { key: 'students-enroll',       label: t('nav.students.enroll', 'Enroll Student'),        icon: <GraduationCap className="w-4 h-4" />, href: '/students/enroll' },
        { key: 'students-attendance',   label: t('nav.students.attendance'),                      icon: <UserCheck className="w-4 h-4" />,   href: '/attendance' },
        { key: 'students-requirements', label: t('nav.students.requirements'),                    icon: <CheckSquare className="w-4 h-4" />, href: '/students/requirements' },
        { key: 'students-contacts',     label: t('nav.students.contacts'),                        icon: <Phone className="w-4 h-4" />,       href: '/students/contacts' },
        { key: 'students-documents',    label: t('nav.students.documents'),                       icon: <FileText className="w-4 h-4" />,    href: '/students/documents' },
        { key: 'students-history',      label: t('nav.students.history'),                         icon: <Archive className="w-4 h-4" />,     href: '/students/history' },
      ],
    },

    // ── Staff ─────────────────────────────────────────────────────────────────
    {
      key: 'staff',
      label: t('nav.staff._'),
      icon: <Briefcase className="w-5 h-5" />,
      children: [
        { key: 'staff-overview',    label: t('nav.staff.overview'),    icon: <UserCog className="w-4 h-4" />,   href: '/staff' },
        { key: 'staff-list',        label: t('nav.staff.list'),        icon: <UserCog className="w-4 h-4" />,   href: '/staff/list' },
        { key: 'staff-add',         label: t('nav.staff.add'),         icon: <UserPlus className="w-4 h-4" />,  href: '/staff/add' },
        { key: 'staff-attendance',  label: t('nav.staff.attendance'),  icon: <UserCheck className="w-4 h-4" />, href: '/staff/attendance' },
        { key: 'staff-roles',       label: 'Roles',                    icon: <Shield className="w-4 h-4" />,    href: '/staff/roles' },
        { key: 'departments',       label: t('nav.staff.departments'), icon: <Building className="w-4 h-4" />,  href: '/departments' },
        { key: 'workplans',         label: t('nav.staff.workplans'),   icon: <Clipboard className="w-4 h-4" />, href: '/work-plans' },
      ],
    },

    // ── Academics ─────────────────────────────────────────────────────────────
    {
      key: 'academics',
      label: t('nav.academics._'),
      icon: <GraduationCap className="w-5 h-5" />,
      children: [
        { key: 'classes',        label: t('nav.academics.classes'),    icon: <School className="w-4 h-4" />,    href: '/academics/classes' },
        { key: 'streams',        label: t('nav.academics.streams'),    icon: <Target className="w-4 h-4" />,    href: '/academics/streams' },
        { key: 'subjects',       label: t('nav.academics.subjects'),   icon: <BookOpen className="w-4 h-4" />,  href: '/academics/subjects' },
        { key: 'timetable',      label: t('nav.academics.timetable'),  icon: <Calendar className="w-4 h-4" />,  href: '/academics/timetable' },
        { key: 'academic-years', label: t('nav.academics.years'),      icon: <Calendar className="w-4 h-4" />,  href: '/academics/years' },
        { key: 'terms',          label: t('nav.academics.terms'),      icon: <Clock className="w-4 h-4" />,     href: '/terms/list' },
        { key: 'curriculums',    label: t('nav.academics.curriculums'),icon: <BookMarked className="w-4 h-4" />,href: '/academics/curriculums' },
      ],
    },

    // ── Attendance ────────────────────────────────────────────────────────────
    {
      key: 'attendance',
      label: t('nav.attendance._', 'Attendance'),
      icon: <UserCheck className="w-5 h-5" />,
      children: [
        { key: 'attendance-dashboard',    label: t('nav.attendance.dashboard', 'Attendance Dashboard'), icon: <LayoutDashboard className="w-4 h-4" />, href: '/attendance' },
        { key: 'attendance-sessions',     label: t('nav.attendance.sessions', 'Sessions'),               icon: <Calendar className="w-4 h-4" />,        href: '/attendance/sessions' },
        { key: 'attendance-reports',      label: t('nav.attendance.reports', 'Reports'),                 icon: <BarChart3 className="w-4 h-4" />,        href: '/attendance/reports' },
        { key: 'attendance-dahua',        label: t('nav.attendance.dahua', 'Dahua Devices'),             icon: <Fingerprint className="w-4 h-4" />,      href: '/attendance/dahua' },
        { key: 'attendance-device-logs',  label: 'Device Logs',                                          icon: <FileSearch className="w-4 h-4" />,       href: '/attendance/devices' },
        { key: 'attendance-reconcile',    label: t('nav.attendance.reconcile', 'Reconciliation'),        icon: <Activity className="w-4 h-4" />,         href: '/attendance/reconcile' },
      ],
    },

    // ── Promotions ────────────────────────────────────────────────────────────
    {
      key: 'promotions',
      label: t('nav.promotions._', 'Promotions'),
      icon: <TrendingUp className="w-5 h-5" />,
      href: '/promotions',
    },

    // ── Tahfiz ────────────────────────────────────────────────────────────────
    {
      key: 'tahfiz',
      label: t('nav.tahfiz._'),
      icon: <TahfizIcon className="w-5 h-5 text-amber-600" />,
      children: [
        { key: 'tahfiz-learners',    label: t('nav.tahfiz.learners'),   icon: <Users className="w-4 h-4" />,    href: '/tahfiz/students' },
        { key: 'tahfiz-records',     label: t('nav.tahfiz.records'),    icon: <FileText className="w-4 h-4" />, href: '/tahfiz/records' },
        { key: 'tahfiz-books',       label: t('nav.tahfiz.books'),      icon: <Book className="w-4 h-4" />,     href: '/tahfiz/books' },
        { key: 'tahfiz-portions',    label: t('nav.tahfiz.portions'),   icon: <BookMarked className="w-4 h-4" />, href: '/tahfiz/portions' },
        { key: 'tahfiz-groups',      label: t('nav.tahfiz.groups'),     icon: <Users className="w-4 h-4" />,    href: '/tahfiz/groups' },
        { key: 'tahfiz-overview',    label: t('nav.tahfiz.overview'),   icon: <BarChart3 className="w-4 h-4" />,href: '/tahfiz' },
        { key: 'tahfiz-attendance',  label: t('nav.tahfiz.attendance'), icon: <Clock className="w-4 h-4" />,    href: '/tahfiz/attendance' },
        { key: 'tahfiz-plans',       label: t('nav.tahfiz.plans'),      icon: <Target className="w-4 h-4" />,   href: '/tahfiz/plans' },
        { key: 'tahfiz-results',     label: t('nav.tahfiz.results'),    icon: <Award className="w-4 h-4" />,    href: '/tahfiz/results' },
        { key: 'tahfiz-reports',     label: t('nav.tahfiz.reports'),    icon: <BarChart3 className="w-4 h-4" />,href: '/tahfiz/reports' },
      ],
    },

    // ── Examinations ──────────────────────────────────────────────────────────
    {
      key: 'examinations',
      label: t('nav.examinations._'),
      icon: <ClipboardList className="w-5 h-5" />,
      children: [
        { key: 'exams',        label: t('nav.examinations.exams'),       icon: <ClipboardList className="w-4 h-4" />, href: '/academics/exams' },
        { key: 'results',      label: t('nav.examinations.results'),     icon: <Award className="w-4 h-4" />,         href: '/academics/results' },
        { key: 'report-cards', label: t('nav.examinations.reportcards'), icon: <FileText className="w-4 h-4" />,      href: '/academics/reports' },
        {
          key: 'report-template-kitchen',
          label: t('nav.examinations.templateKitchen', 'Template Kitchen'),
          icon: <Palette className="w-4 h-4" />,
          href: '/reports/kitchen',
          roles: ['admin', 'super_admin'],
        },
        { key: 'deadlines',    label: t('nav.examinations.deadlines'),   icon: <AlarmClock className="w-4 h-4" />,    href: '/examinations/deadlines' },
      ],
    },

    // ── Finance ───────────────────────────────────────────────────────────────
    {
      key: 'finance',
      label: t('nav.finance._'),
      icon: <Wallet className="w-5 h-5" />,
      children: [
        { key: 'learners-fees',   label: 'Learners Fees Overview',             icon: <Users className="w-4 h-4" />,       href: '/finance/learners-fees' },
        { key: 'wallets',         label: t('nav.finance.wallets'),             icon: <Wallet className="w-4 h-4" />,      href: '/finance/wallets' },
        { key: 'fees',            label: t('nav.finance.fees'),                icon: <CreditCard className="w-4 h-4" />,  href: '/finance/fees' },
        { key: 'fees-ledger',     label: t('nav.finance.fees_ledger'),         icon: <FileBarChart className="w-4 h-4" />,href: '/finance/ledger/fees' },
        { key: 'payments',        label: t('nav.finance.payments'),            icon: <Receipt className="w-4 h-4" />,     href: '/finance/payments' },
        { key: 'ledger',          label: t('nav.finance.ledger'),              icon: <FileText className="w-4 h-4" />,    href: '/finance/ledger' },
        { key: 'waivers',         label: t('nav.finance.waivers'),             icon: <Percent className="w-4 h-4" />,     href: '/finance/waivers' },
        { key: 'expenditures',    label: t('nav.finance.expenditures'),        icon: <TrendingDown className="w-4 h-4" />,href: '/finance/expenditures' },
        { key: 'reports-income',  label: t('nav.finance.income_statement'),    icon: <FileBarChart className="w-4 h-4" />,href: '/finance/reports/income-statement' },
        { key: 'reports-balance', label: t('nav.finance.balance_sheet'),       icon: <Scale className="w-4 h-4" />,       href: '/finance/reports/balance-sheet' },
        { key: 'categories',      label: t('nav.finance.categories'),          icon: <PieChart className="w-4 h-4" />,    href: '/finance/categories' },
      ],
    },

    // ── Payroll ───────────────────────────────────────────────────────────────
    {
      key: 'payroll',
      label: t('nav.payroll._'),
      icon: <Coins className="w-5 h-5" />,
      children: [
        { key: 'payroll-definitions', label: t('nav.payroll.definitions'), icon: <FileCog className="w-4 h-4" />,        href: '/payroll/definitions' },
        { key: 'payroll-salaries',    label: t('nav.payroll.salaries'),    icon: <BadgeDollarSign className="w-4 h-4" />, href: '/payroll/salaries' },
        { key: 'payroll-payments',    label: t('nav.payroll.payments'),    icon: <TrendingUp className="w-4 h-4" />,      href: '/payroll/payments' },
      ],
    },

    // ── Inventory ─────────────────────────────────────────────────────────────
    {
      key: 'inventory',
      label: t('nav.inventory._'),
      icon: <Package className="w-5 h-5" />,
      children: [
        { key: 'stores',             label: t('nav.inventory.stores'),       icon: <Building className="w-4 h-4" />, href: '/inventory/stores' },
        { key: 'store-items',        label: t('nav.inventory.items'),        icon: <Package className="w-4 h-4" />,  href: '/inventory/items' },
        { key: 'store-transactions', label: t('nav.inventory.transactions'), icon: <Truck className="w-4 h-4" />,    href: '/inventory/transactions' },
      ],
    },

    // ── Locations ─────────────────────────────────────────────────────────────
    {
      key: 'locations',
      label: t('nav.locations._'),
      icon: <Map className="w-5 h-5" />,
      children: [
        { key: 'districts',   label: t('nav.locations.districts'),   icon: <Map className="w-4 h-4" />, href: '/locations/districts' },
        { key: 'counties',    label: t('nav.locations.counties'),    icon: <Map className="w-4 h-4" />, href: '/locations/counties' },
        { key: 'subcounties', label: t('nav.locations.subcounties'), icon: <Map className="w-4 h-4" />, href: '/locations/subcounties' },
        { key: 'parishes',    label: t('nav.locations.parishes'),    icon: <Map className="w-4 h-4" />, href: '/locations/parishes' },
        { key: 'villages',    label: t('nav.locations.villages'),    icon: <Map className="w-4 h-4" />, href: '/locations/villages' },
      ],
    },

    // ── Events ────────────────────────────────────────────────────────────────
    {
      key: 'events',
      label: t('nav.events._'),
      icon: <Calendar className="w-5 h-5" />,
      children: [
        { key: 'events-list', label: t('nav.events.list'),      icon: <Calendar className="w-4 h-4" />, href: '/departments/events' },
        { key: 'reminders',   label: t('nav.events.reminders'), icon: <Bell className="w-4 h-4" />,     href: '/events/reminders' },
        { key: 'calendar',    label: t('nav.events.calendar'),  icon: <Calendar className="w-4 h-4" />, href: '/events/calendar' },
      ],
    },

    // ── Documents ─────────────────────────────────────────────────────────────
    {
      key: 'documents',
      label: t('nav.documents._'),
      icon: <FileStack className="w-5 h-5" />,
      children: [
        { key: 'documents-upload', label: t('nav.documents.upload'),  icon: <FilePlus2 className="w-4 h-4" />,  href: '/documents/upload' },
        { key: 'documents-manage', label: t('nav.documents.manage'),  icon: <FolderTree className="w-4 h-4" />, href: '/documents/manage' },
      ],
    },

    // ── Reports / Analytics ───────────────────────────────────────────────────
    {
      key: 'reports',
      label: t('nav.reports._'),
      icon: <ChartBar className="w-5 h-5" />,
      children: [
        { key: 'analytics-students', label: t('nav.reports.students'), icon: <Users className="w-4 h-4" />,       href: '/analytics/students' },
        { key: 'analytics-staff',    label: t('nav.reports.staff'),    icon: <Briefcase className="w-4 h-4" />,   href: '/analytics/staff' },
        { key: 'analytics-finance',  label: t('nav.reports.finance'),  icon: <DollarSign className="w-4 h-4" />,  href: '/analytics/finance' },
        { key: 'custom-reports',     label: t('nav.reports.custom'),   icon: <FileBarChart className="w-4 h-4" />,href: '/reports/custom' },
      ],
    },

    // ── Communication ─────────────────────────────────────────────────────────
    {
      key: 'communication',
      label: t('nav.communication._'),
      icon: <MessageSquare className="w-5 h-5" />,
      children: [
        { key: 'messages',      label: t('nav.communication.messages'),      icon: <MessageSquare className="w-4 h-4" />, href: '/communication/messages' },
        { key: 'notifications', label: t('nav.communication.notifications'), icon: <Bell className="w-4 h-4" />,          href: '/communication/notifications' },
        { key: 'sms',           label: t('nav.communication.sms'),           icon: <Phone className="w-4 h-4" />,         href: '/communication/sms' },
        { key: 'email',         label: t('nav.communication.email'),         icon: <Mail className="w-4 h-4" />,          href: '/communication/email' },
      ],
    },

    // ── Users & Roles ─────────────────────────────────────────────────────────
    {
      key: 'users-roles',
      label: t('nav.usersRoles._'),
      icon: <UserCog className="w-5 h-5" />,
      children: [
        { key: 'users',       label: t('nav.usersRoles.users'),       icon: <UserCog className="w-4 h-4" />,    href: '/users/list' },
        { key: 'roles',       label: t('nav.usersRoles.roles'),       icon: <ShieldCheck className="w-4 h-4" />,href: '/users/roles' },
        { key: 'permissions', label: t('nav.usersRoles.permissions'), icon: <Shield className="w-4 h-4" />,     href: '/system/permissions' },
        { key: 'audit-log',   label: t('nav.usersRoles.audit'),       icon: <FileText className="w-4 h-4" />,   href: '/system/audit' },
      ],
    },

    // ── Settings ──────────────────────────────────────────────────────────────
    {
      key: 'settings',
      label: t('nav.settings._'),
      icon: <Settings className="w-5 h-5" />,
      children: [
        { key: 'school-settings', label: t('nav.settings.school', 'School Information'), icon: <School className="w-4 h-4" />,  href: '/settings' },
        { key: 'theme-settings',  label: t('nav.settings.theme'),                         icon: <Palette className="w-4 h-4" />, href: '/settings/theme' },
        { key: 'system-settings', label: t('nav.settings.system'),                        icon: <Cog className="w-4 h-4" />,     href: '/settings/system' },
        { key: 'profile',         label: t('nav.settings.profile'),                       icon: <UserCog className="w-4 h-4" />, href: '/settings/profile' },
      ],
    },

    // ── Help ──────────────────────────────────────────────────────────────────
    {
      key: 'help',
      label: t('nav.help'),
      icon: <HelpCircle className="w-5 h-5" />,
      href: '/help',
    },
  ];
}
