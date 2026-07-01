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
  MessageSquareText,
  Languages,
  BookOpen,
  Calendar,
  DoorOpen,
  RadioTower,
  ClipboardList,
  UserCheck,
  DollarSign,
  FileText, FileCheck, Sliders, Sparkles,
  Settings,
  Building,
  Boxes,
  UserPlus,
  Award,
  Clock,
  PieChart,
  Bell,
  Inbox,
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
  Workflow,
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
  Library,
  Activity,
  Fingerprint,
  Book,
  FileSearch,
  ArrowUpDown,
  Radio,
  AlertTriangle,
  Trash2,
  Upload,
  Database,
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
   */
  roles?: string[];
  /**
   * Module codes (from school_modules) required to see this item.
   * ALL listed codes must be enabled for the school.
   * Super-admin sees everything regardless.
   */
  requiredModules?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter helper — call from sidebar to strip items the user cannot see
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter menu items by role AND enabled school modules.
 * Super-admin bypasses both filters — they can see everything.
 */
export function filterMenuByRole(
  items: MenuItem[],
  hasRole: (slug: string) => boolean,
  isSuperAdmin: boolean,
  enabledModules?: Set<string>,
): MenuItem[] {
  return items.reduce<MenuItem[]>((acc, item) => {
    // Role gate — super-admin bypasses
    if (item.roles && item.roles.length > 0 && !isSuperAdmin) {
      if (!item.roles.some(role => hasRole(role))) return acc;
    }
    // Module gate — super-admin bypasses; only applies when module list is loaded
    if (item.requiredModules && item.requiredModules.length > 0 && !isSuperAdmin && enabledModules) {
      if (!item.requiredModules.every(m => enabledModules.has(m))) return acc;
    }
    // Recursively filter children
    if (item.children) {
      const filteredChildren = filterMenuByRole(item.children, hasRole, isSuperAdmin, enabledModules);
      acc.push({ ...item, children: filteredChildren });
    } else {
      acc.push(item);
    }
    return acc;
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────────
// LABEL_AR — every literal English label in this file, mapped to its Arabic
// equivalent. Applied as a post-processing tree-walk so we don't have to
// touch ~110 individual `label: '...'` sites. Unknown labels fall through
// verbatim (safe: shows the English literal until an entry is added).
// ─────────────────────────────────────────────────────────────────────────────
const LABEL_AR: Record<string, string> = {
  // Dashboard
  'Overview':                  'نظرة عامة',
  'Dashboard':                 'لوحة التحكم',

  // Students group
  'Students':                  'الطلاب',
  'Student List':              'قائمة الطلاب',
  'Admit Student':             'قبول طالب',
  'Admissions Pipeline':       'مسار القبول',
  'Enroll Student':            'تسجيل طالب',
  'Requirements':              'المتطلبات',
  'Contacts':                  'جهات الاتصال',
  'Documents':                 'المستندات',
  'Duplicates':                'السجلات المكرّرة',
  'History':                   'السجل',
  'ID Cards':                  'بطاقات الهوية',
  'Bulk Import':               'استيراد جماعي',
  'Promotions':                'الترقيات',
  'Attendance':                'الحضور',

  // Staff & Roles group
  'Staff & Roles':             'الموظفون والأدوار',
  'Staff':                     'الموظفون',
  'View Staff':                'عرض الموظفين',
  'Add Staff':                 'إضافة موظف',
  'User Management':           'إدارة المستخدمين',
  'Workplans':                 'خطط العمل',
  'Departments':               'الأقسام',
  'Roles & Permissions':       'الأدوار والصلاحيات',
  'User Monitoring':           'مراقبة المستخدمين',
  'Audit Trail':               'سجل التدقيق',
  'Trash':                     'المهملات',
  'Positions':                 'الوظائف',
  'School Modules':            'وحدات المدرسة',
  'Communications':            'الاتصالات',
  'Admission Mode':            'نمط القبول',

  // Academics group
  'Academics':                 'الأكاديميات',
  'Classes':                   'الصفوف',
  'Streams':                   'الشعب',
  'Subjects':                  'المواد',
  'Teacher Allocation':        'توزيع المعلمين',
  'Allocation History':        'سجل التوزيع',
  'Timetable':                 'الجدول الزمني',
  'Academic Years':            'السنوات الدراسية',
  'Terms':                     'الفصول الدراسية',
  'Curriculums':               'المناهج الدراسية',
  'Examinations':              'الامتحانات',
  'Results':                   'النتائج',
  'Report Cards':              'بطاقات التقارير',
  'Snapshots':                 'اللقطات',

  // Documents & Assessment group (the hoisted CAFE/DRCE/Issuance group)
  'Documents & Assessment':    'الوثائق والتقييم',
  'CAFE (Assessment Engine)':  'إدارة كفي',
  'CAFE Result Entry':         'إدخال نتائج كفي',
  'Template Kitchen':          'مطبخ القوالب',
  'New Document':              'وثيقة جديدة',
  'Block Library':             'مكتبة الكتل',
  'Issuance':                  'الإصدار',
  'Custom Fields':             'الحقول المخصصة',

  // Reports group
  'Reports':                   'التقارير',
  'Analytics':                 'التحليلات',
  'Exports':                   'التصديرات',
  'Intelligence':              'الذكاء',

  // Tahfiz group
  'Tahfiz':                    'التحفيظ',
  'Groups':                    'المجموعات',
  'Books':                     'الكتب',
  'Portions':                  'المقاطع',
  'Progress':                  'التقدّم',
  'Review':                    'المراجعة',
  'Halaqat':                   'الحلقات',
  'Learners':                  'المتعلمون',

  // Finance group
  'Finance':                   'الشؤون المالية',
  'Fees':                      'الرسوم',
  'Invoices':                  'الفواتير',
  'Receipts':                  'الإيصالات',
  'Payments':                  'المدفوعات',
  'Expenses':                  'المصروفات',
  'Payroll':                   'الرواتب',
  'Wallets':                   'المحافظ',
  'Waivers':                   'الإعفاءات',
  'Clearance':                 'التخليص المالي',
  'Import Fees':               'استيراد الرسوم',
  'Expenditures':              'المصروفات',
  'Learner Fees':              'رسوم الطلاب',
  'Fee Structures':            'هياكل الرسوم',
  'Ledger v2':                 'دفتر الأستاذ',
  'Legacy Ledger':             'الدفتر القديم',

  // Attendance group
  'Devices':                   'الأجهزة',
  'Logs':                      'السجلات',
  'Enrollment':                'التسجيل',
  'Mapping':                   'الربط',
  'Remote Features':           'الميزات عن بُعد',
  'Device Control':            'التحكم بالأجهزة',
  'Device Logs':               'سجلات الأجهزة',
  'Commands':                  'الأوامر',
  'Biometric':                 'البصمة',

  // Settings group
  'Settings':                  'الإعدادات',
  'School':                    'المدرسة',
  'Appearance':                'المظهر',
  'Profile':                   'الملف الشخصي',
  'System':                    'النظام',
  'Templates':                 'القوالب',
  'Study Modes':               'أنماط الدراسة',
  'Relay':                     'الترحيل',
  'Branding':                  'العلامة التجارية',
  'Modules':                   'الوحدات',
  'School Identity':           'هوية المدرسة',
  'School Hours':              'ساعات المدرسة',
  'Academic Calendar':         'التقويم الدراسي',
  'Notifications':             'الإشعارات',

  // Added — labels previously falling through to English
  'Parents & Guardians':       'أولياء الأمور',
  'Notification Policies':     'سياسات الإشعارات',
  'Notification Outbox':       'صندوق الإشعارات الصادرة',
  'Secular Report Cards':      'بطاقات تقارير المواد العامة',
  'Theology Report Cards':     'بطاقات تقارير المواد الشرعية',
  'Reports (Legacy)':          'التقارير (القديمة)',
  'Deadlines':                 'المواعيد النهائية',
  'Attendance Logs':           'سجلات الحضور',
  'Enrollment Station':        'محطة التسجيل',
  'User Mapping':              'ربط المستخدمين',
  'Command Center':            'مركز التحكم',
  'Command Monitor':           'مراقبة الأوامر',
  'Live Monitor':              'المراقبة المباشرة',
  'Device Alerts':             'تنبيهات الأجهزة',
  'Holidays':                  'العطلات',
  'Pass-outs':                 'أذونات الخروج',
  'Gate Mode':                 'وضع البوابة',
  'Fee Items':                 'بنود الرسوم',
  'Fee Rules':                 'قواعد الرسوم',
  'Bills (generate)':          'إنشاء الفواتير',
  'Money Locations':           'مواقع الأموال',
  'Ledger':                    'دفتر الأستاذ',
  'Budgets':                   'الميزانيات',
  'Pocket Money':              'مصروف الجيب',
  'Import':                    'استيراد',
  'Pay Runs':                  'دورات الرواتب',
  'Inventory':                 'المخزون',
  'Stores':                    'المخازن',
  'Items':                     'الأصناف',
  'Movements':                 'الحركات',
  'Participants':              'المشاركون',
  'Records':                   'السجلات',
  'Plans':                     'الخطط',
  'Income Statement':          'قائمة الدخل',
  'Balance Sheet':             'الميزانية العمومية',
  'Custom Reports':            'تقارير مخصصة',
  'Programs':                  'البرامج',
  'Report Comments':           'تعليقات التقارير',
  'Localization':              'الترجمة والتعريب',
  'Database':                  'قاعدة البيانات',
  'My Profile':                'ملفي الشخصي',
  'System Status':             'حالة النظام',
  'Relay Setup':               'إعداد الترحيل',
  'Help & Support':            'المساعدة والدعم',
};

/**
 * Apply LABEL_AR translations to a built menu tree in place. Unknown
 * labels pass through verbatim. Recursive on `children`. Returns a
 * new tree (does not mutate input).
 */
function translateMenuTree(items: MenuItem[], lang: string): MenuItem[] {
  if (lang !== 'ar') return items;
  return items.map(item => ({
    ...item,
    label: LABEL_AR[item.label] ?? item.label,
    children: item.children ? translateMenuTree(item.children, lang) : undefined,
  }));
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
  lang: string = 'en',
): MenuItem[] {
  const items: MenuItem[] = [

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
        { key: 'admissions',            label: 'Admissions Pipeline',                            icon: <Workflow className="w-4 h-4" />,    href: '/admissions' },
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
        { key: 'workplans', label: 'Workplans', icon: <Clipboard className="w-4 h-4" />, href: '/work-plans', requiredModules: ['work_plans'] },
        { key: 'admin-departments', label: 'Departments',        icon: <Building className="w-4 h-4" />,   href: '/admin/departments',   roles: ['admin', 'super_admin'] },
        { key: 'admin-roles',       label: 'Roles & Permissions',icon: <Shield className="w-4 h-4" />,     href: '/admin/roles',         roles: ['admin', 'super_admin'] },
        { key: 'admin-sessions',    label: 'User Monitoring',    icon: <Activity className="w-4 h-4" />,   href: '/admin/user-sessions', roles: ['admin', 'super_admin'] },
        { key: 'admin-audit-logs',  label: 'Audit Trail',        icon: <FileSearch className="w-4 h-4" />, href: '/admin/audit-logs',    roles: ['admin', 'super_admin'] },
        { key: 'admin-trash',       label: 'Trash',              icon: <Trash2 className="w-4 h-4" />,     href: '/admin/trash',         roles: ['admin', 'super_admin'] },
        { key: 'admin-positions',   label: 'Positions',          icon: <Briefcase className="w-4 h-4" />,  href: '/admin/positions',     roles: ['admin', 'super_admin'] },
        { key: 'admin-modules',     label: 'School Modules',     icon: <Boxes className="w-4 h-4" />,      href: '/admin/modules',         roles: ['super_admin'] },
        { key: 'admin-comm',           label: 'Communications',     icon: <MessageSquare className="w-4 h-4" />, href: '/admin/communications', roles: ['admin', 'super_admin'] },
        { key: 'admin-parents',        label: 'Parents & Guardians', icon: <Users className="w-4 h-4" />,        href: '/admin/parents',        roles: ['admin', 'super_admin'] },
        { key: 'admin-notifications',  label: 'Notification Policies', icon: <Bell className="w-4 h-4" />,        href: '/admin/notifications/policies', roles: ['admin', 'super_admin'] },
        { key: 'admin-notif-outbox',   label: 'Notification Outbox',   icon: <Inbox className="w-4 h-4" />,       href: '/admin/notifications/outbox',   roles: ['admin', 'super_admin'] },
        { key: 'admin-admission-mode', label: 'Admission Mode',     icon: <Workflow className="w-4 h-4" />,      href: '/admin/admission-mode', roles: ['admin', 'super_admin'] },
      ],
    },

    // ══ 4. ACADEMICS ══════════════════════════════════════════════════════════
    // Consolidated: Academics + Examinations + Promotions
    {
      key:   'academics',
      label: t('nav.academics._', 'Academics'),
      icon:  <GraduationCap className="w-5 h-5" />,
      children: [
        { key: 'workplans-ac', label: 'Workplans', icon: <Clipboard className="w-4 h-4" />, href: '/work-plans', requiredModules: ['work_plans'] },
        { key: 'classes',         label: 'Classes',          icon: <School className="w-4 h-4" />,       href: '/academics/classes' },
        { key: 'streams',         label: 'Streams',          icon: <Target className="w-4 h-4" />,       href: '/academics/streams' },
        { key: 'subjects',        label: 'Subjects',         icon: <BookOpen className="w-4 h-4" />,     href: '/academics/subjects' },
        { key: 'allocations',         label: 'Teacher Allocation',     icon: <UserCheck className="w-4 h-4" />, href: '/academics/allocations' },
        { key: 'allocations-history', label: 'Allocation History',     icon: <Clock className="w-4 h-4" />,     href: '/academics/allocations/history' },
        { key: 'timetable',       label: 'Timetable',        icon: <Calendar className="w-4 h-4" />,     href: '/academics/timetable' },
        { key: 'academic-years',  label: 'Academic Years',   icon: <Calendar className="w-4 h-4" />,     href: '/academics/years' },
        { key: 'terms',           label: 'Terms',            icon: <Clock className="w-4 h-4" />,        href: '/terms/list' },
        { key: 'curriculums',     label: 'Curriculums',      icon: <BookMarked className="w-4 h-4" />,   href: '/academics/curriculums' },
        { key: 'promotions',      label: 'Promotions',       icon: <TrendingUp className="w-4 h-4" />,   href: '/promotions' },
        { key: 'exams', label: 'Examinations', icon: <ClipboardList className="w-4 h-4" />, href: '/academics/exams', requiredModules: ['examinations'] },
        { key: 'results',         label: 'Results',          icon: <Award className="w-4 h-4" />,        href: '/academics/results' },
        { key: 'report-cards',           label: 'Report Cards',           icon: <FileText className="w-4 h-4" />,     href: '/academics/report-cards' },
        { key: 'report-cards-secular',   label: 'Secular Report Cards',   icon: <FileText className="w-4 h-4" />,     href: '/academics/report-cards/secular' },
        { key: 'report-cards-theology',  label: 'Theology Report Cards',  icon: <FileText className="w-4 h-4" />,     href: '/academics/report-cards/theology' },
        { key: 'report-cards-legacy',    label: 'Reports (Legacy)',       icon: <FileText className="w-4 h-4" />,     href: '/academics/reports',          roles: ['super_admin'] },
        { key: 'cafe-entry-inline', label: 'CAFE Result Entry', icon: <ClipboardList className="w-4 h-4" />, href: '/academics/results-cafe', roles: ['admin', 'super_admin', 'teacher'] },
        { key: 'deadlines',       label: 'Deadlines',        icon: <AlarmClock className="w-4 h-4" />,   href: '/examinations/deadlines' },
      ],
    },

    // ══ 4b. DOCUMENTS & ASSESSMENT ════════════════════════════════════════════
    // Hoisted out of Academics so CAFE + DRCE + Issuance are top-level
    // discoverable instead of buried at the bottom of a long children list.
    {
      key:   'documents',
      label: 'Documents & Assessment',
      icon:  <Sparkles className="w-5 h-5" />,
      children: [
        { key: 'cafe-top',        label: 'CAFE (Assessment Engine)', icon: <Sliders className="w-4 h-4" />,    href: '/admin/cafe',             roles: ['admin', 'super_admin'] },
        { key: 'cafe-entry-top',  label: 'CAFE Result Entry',        icon: <ClipboardList className="w-4 h-4" />, href: '/academics/results-cafe', roles: ['admin', 'super_admin', 'teacher'] },
        { key: 'drce-kitchen',    label: 'Template Kitchen',         icon: <Palette className="w-4 h-4" />,    href: '/reports/kitchen',        roles: ['admin', 'super_admin'] },
        { key: 'drce-new-doc',    label: 'New Document',             icon: <FileText className="w-4 h-4" />,   href: '/drce/new',               roles: ['admin', 'super_admin'] },
        { key: 'drce-blocks-top', label: 'Block Library',            icon: <Library className="w-4 h-4" />,    href: '/admin/drce/blocks',      roles: ['admin', 'super_admin'] },
        { key: 'issuance-top',    label: 'Issuance',                 icon: <FileCheck className="w-4 h-4" />,  href: '/issuance',               roles: ['admin', 'super_admin'] },
        { key: 'custom-fields-top', label: 'Custom Fields',          icon: <FileCog className="w-4 h-4" />,    href: '/admin/custom-fields',    roles: ['admin', 'super_admin'] },
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
        { key: 'att-device-alerts',  label: 'Device Alerts',     icon: <AlertTriangle className="w-4 h-4" />, href: '/admin/device-alerts', roles: ['admin', 'super_admin'] },
        { key: 'att-holidays',       label: 'Holidays',          icon: <Calendar className="w-4 h-4" />,    href: '/attendance/holidays', roles: ['admin', 'super_admin'] },
        { key: 'passouts',           label: 'Pass-outs',         icon: <DoorOpen className="w-4 h-4" />,     href: '/passouts' },
        { key: 'passouts-gate',      label: 'Gate Mode',         icon: <RadioTower className="w-4 h-4" />,   href: '/passouts/gate' },
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
        { key: 'finance-dash',       label: 'Dashboard',         icon: <BarChart3 className="w-4 h-4" />,    href: '/finance/dashboard' },
        { key: 'fees',               label: 'Fees',              icon: <CreditCard className="w-4 h-4" />,   href: '/finance/fees' },
        { key: 'fee-items',          label: 'Fee Items',         icon: <CreditCard className="w-4 h-4" />,   href: '/finance/fee-items' },
        { key: 'fee-rules',          label: 'Fee Rules',         icon: <CreditCard className="w-4 h-4" />,   href: '/finance/fee-rules' },
        { key: 'bills',              label: 'Bills (generate)',  icon: <CreditCard className="w-4 h-4" />,   href: '/finance/bills' },
        { key: 'learners-fees',      label: 'Learner Fees',      icon: <Users className="w-4 h-4" />,        href: '/finance/learners-fees' },
        { key: 'payments',           label: 'Payments',          icon: <Receipt className="w-4 h-4" />,      href: '/finance/payments' },
        { key: 'wallets',            label: 'Wallets',           icon: <Wallet className="w-4 h-4" />,       href: '/finance/wallets' },
        { key: 'money-locations',    label: 'Money Locations',   icon: <Wallet className="w-4 h-4" />,       href: '/finance/locations' },
        { key: 'ledger',             label: 'Ledger',            icon: <FileText className="w-4 h-4" />,     href: '/finance/ledger-v2' },
        { key: 'waivers',            label: 'Waivers',           icon: <Percent className="w-4 h-4" />,      href: '/finance/waivers' },
        { key: 'clearance',          label: 'Clearance',         icon: <ShieldCheck className="w-4 h-4" />,  href: '/finance/clearance' },
        { key: 'import-fees',        label: 'Import Fees',       icon: <FileText className="w-4 h-4" />,     href: '/finance/import-fees' },
        { key: 'expenditures',       label: 'Expenditures',      icon: <TrendingDown className="w-4 h-4" />, href: '/finance/expenditures' },
        { key: 'budgets',            label: 'Budgets',           icon: <TrendingDown className="w-4 h-4" />, href: '/finance/budgets' },
        { key: 'pocket-money',       label: 'Pocket Money',      icon: <Wallet className="w-4 h-4" />,       href: '/finance/pocket-money' },
        { key: 'finance-import',     label: 'Import',            icon: <Upload className="w-4 h-4" />,       href: '/finance/import' },
        { key: 'payroll-salaries', label: 'Payroll',  icon: <Coins className="w-4 h-4" />,          href: '/payroll/salaries',  requiredModules: ['payroll'] },
        { key: 'payroll-payments', label: 'Pay Runs', icon: <BadgeDollarSign className="w-4 h-4" />, href: '/payroll/payments', requiredModules: ['payroll'] },
      ],
    },

    // ══ 7. INVENTORY ══════════════════════════════════════════════════════════
    {
      key:             'inventory',
      label:           'Inventory',
      icon:            <Package className="w-5 h-5" />,
      requiredModules: ['inventory'],
      children: [
        { key: 'inventory-overview',     label: 'Overview',      icon: <BarChart3 className="w-4 h-4" />,    href: '/inventory'              },
        { key: 'inventory-stores',       label: 'Stores',        icon: <Building className="w-4 h-4" />,     href: '/inventory/stores'       },
        { key: 'inventory-items',        label: 'Items',         icon: <Package className="w-4 h-4" />,      href: '/inventory/items'        },
        { key: 'inventory-transactions', label: 'Movements',     icon: <Activity className="w-4 h-4" />,     href: '/inventory/transactions' },
      ],
    },

    // ══ 8. TAHFIZ ═════════════════════════════════════════════════════════════
    {
      key:             'tahfiz',
      label:           t('nav.tahfiz._', 'Tahfiz'),
      icon:            <BookOpen className="w-5 h-5 text-amber-600" />,
      requiredModules: ['tahfiz'],
      children: [
        { key: 'tahfiz-overview',   label: 'Overview',    icon: <BarChart3 className="w-4 h-4" />,   href: '/tahfiz' },
        { key: 'tahfiz-learners',   label: 'Participants', icon: <Users className="w-4 h-4" />,       href: '/tahfiz/participants' },
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
        { key: 'analytics-students', label: 'Students',         icon: <Users className="w-4 h-4" />,        href: '/analytics/students',                requiredModules: ['analytics'] },
        { key: 'analytics-staff',    label: 'Staff',            icon: <Briefcase className="w-4 h-4" />,    href: '/analytics/staff',                   requiredModules: ['analytics'] },
        { key: 'analytics-finance',  label: 'Finance',          icon: <Scale className="w-4 h-4" />,        href: '/analytics/finance',                 requiredModules: ['analytics'] },
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
        { key: 'academic-programs', label: 'Programs',     icon: <GraduationCap className="w-4 h-4" />, href: '/settings/academic-programs' },
        { key: 'report-comments', label: 'Report Comments', icon: <MessageSquareText className="w-4 h-4" />, href: '/settings/report-comments' },
        { key: 'localization',    label: 'Localization',   icon: <Languages className="w-4 h-4" />, href: '/settings/localization' },
        { key: 'database-settings', label: 'Database',     icon: <Database className="w-4 h-4" />, href: '/settings/database', roles: ['super_admin'] },
        { key: 'school-hours',    label: 'School Hours',   icon: <Clock className="w-4 h-4" />,    href: '/settings/hours' },
        { key: 'appearance',      label: 'Appearance',     icon: <Palette className="w-4 h-4" />,  href: '/settings/appearance' },
        { key: 'profile',         label: 'My Profile',     icon: <UserCog className="w-4 h-4" />,  href: '/settings/profile' },
        { key: 'templates',       label: 'Templates',      icon: <FileCog className="w-4 h-4" />,  href: '/settings/templates' },
        { key: 'system-status',   label: 'System Status',  icon: <Activity className="w-4 h-4" />, href: '/settings/system' },
        { key: 'relay-setup',     label: 'Relay Setup',    icon: <Radio className="w-4 h-4" />,    href: '/settings/relay' },
        { key: 'help',            label: 'Help & Support', icon: <HelpCircle className="w-4 h-4" />, href: '/help' },
      ],
    },
  ];

  return translateMenuTree(items, lang);
}
