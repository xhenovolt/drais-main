"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useSchoolConfig } from '@/hooks/useSchoolConfig';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
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
  ChevronDown,
  ChevronRight,
  Building,
  UserPlus,
  Award,
  Clock,
  Calculator,
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
  Database,
  HelpCircle,
  Phone,
  Mail,
  Package,
  Truck,
  Clipboard,
  AlarmClock,
  MessageSquare,
  Layers,
  FolderTree,
  Coins,
  Landmark,
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
  Server,
  FileSearch,
} from 'lucide-react';
import NewBadge from '@/components/ui/NewBadge';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

// Define TahfizIcon alias so the sidebar can reference it reliably
const TahfizIcon = BookOpen;

interface MenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  children?: MenuItem[];
}

const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const theme = useTheme();
  const { t, dir, lang } = useI18n();
  const { school } = useSchoolConfig();
  const sidebarSchoolName = school.name || 'School';
  const [hovering, setHovering] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [isHovered, setIsHovered] = useState(false);
  
  // Add mobile sidebar state
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Add feature flags hook
  const { isRouteNew, recordInteraction } = useFeatureFlags({ 
    schoolId: 1, 
    autoRefresh: true 
  });

  // Tahfiz live counts
  const [tCounts, setTCounts] = useState({ learners: 0, records: 0, portions: 0, groups: 0, loaded: false });

  const isRTL = dir === 'rtl';
  const isRight = theme.sidebarPosition === 'right' || lang === 'ar';
  
  // Update effective collapsed logic for mobile
  const effectiveCollapsed = theme.sidebarCollapsed && !hovering && !isMobileOpen;

  // Fetch small counts for badges (defensive)
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [learnersRes, recordsRes, booksRes, groupsRes] = await Promise.allSettled([
          fetch('/api/tahfiz/learners'),
          fetch('/api/tahfiz/records'),
          fetch('/api/tahfiz/books'),
          fetch('/api/tahfiz/groups'),
        ]);
        const safeLen = (r: any) => (Array.isArray(r) ? r.length : (r && typeof r === 'object' ? 1 : 0));
        const parsed = { learners: 0, records: 0, portions: 0, groups: 0, loaded: true };
        if (learnersRes.status === 'fulfilled' && learnersRes.value.ok) {
          parsed.learners = safeLen(await learnersRes.value.json());
        }
        if (recordsRes.status === 'fulfilled' && recordsRes.value.ok) {
          parsed.records = safeLen(await recordsRes.value.json());
        }
        if (booksRes.status === 'fulfilled' && booksRes.value.ok) {
          parsed.portions = safeLen(await booksRes.value.json());
        }
        if (groupsRes.status === 'fulfilled' && groupsRes.value.ok) {
          parsed.groups = safeLen(await groupsRes.value.json());
        }
        if (mounted) setTCounts(parsed);
      } catch (e) {
        // ignore fetch errors, keep counts zero
        if (mounted) setTCounts(prev => ({ ...prev, loaded: true }));
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const toggleExpanded = (key: string) => {
    if (effectiveCollapsed) return;
    setExpandedItems(prev =>
      prev.includes(key)
        ? prev.filter(item => item !== key)
        : [...prev, key]
    );
  };

  // Auto-expand groups with active children
  useEffect(() => {
    const updates: string[] = [];
    menuItems.forEach(item => {
      if (item.children) {
        const hasActiveChild = item.children.some(child => pathname.startsWith(child.href || ''));
        if (hasActiveChild && !expandedItems.includes(item.key)) {
          updates.push(item.key);
        }
      }
    });
    if (updates.length) {
      setExpandedItems(prev => [...prev, ...updates]);
    }
  }, [pathname]);

  const menuItems: MenuItem[] = [
    {
      key: 'dashboard',
      label: t('nav.dashboard'),
      icon: <LayoutDashboard className="w-5 h-5" />,
      href: '/dashboard'
    },
    {
      key: 'students',
      label: t('nav.students._'),
      icon: <Users className="w-5 h-5" />,
      children: [
        { key: 'students-list', label: t('nav.students.list'), icon: <Users className="w-4 h-4" />, href: '/students/list' },
        { key: 'students-admit', label: t('nav.students.admit', 'Admit Student'), icon: <UserPlus className="w-4 h-4" />, href: '/students/admit' },
        { key: 'students-enroll', label: t('nav.students.enroll', 'Enroll Student'), icon: <GraduationCap className="w-4 h-4" />, href: '/students/enroll' },
        { key: 'students-attendance', label: t('nav.students.attendance'), icon: <UserCheck className="w-4 h-4" />, href: '/attendance' },
        { key: 'students-requirements', label: t('nav.students.requirements'), icon: <CheckSquare className="w-4 h-4" />, href: '/students/requirements' },
        { key: 'students-contacts', label: t('nav.students.contacts'), icon: <Phone className="w-4 h-4" />, href: '/students/contacts' },
        { key: 'students-documents', label: t('nav.students.documents'), icon: <FileText className="w-4 h-4" />, href: '/students/documents' },
        { key: 'students-history', label: t('nav.students.history'), icon: <Archive className="w-4 h-4" />, href: '/students/history' }
      ]
    },
    {
      key: 'staff',
      label: t('nav.staff._'),
      icon: <Briefcase className="w-5 h-5" />,
      children: [
        { key: 'staff-overview', label: t('nav.staff.overview'), icon: <UserCog className="w-4 h-4" />, href: '/staff' },
        { key: 'staff-list', label: t('nav.staff.list'), icon: <UserCog className="w-4 h-4" />, href: '/staff/list' },
        { key: 'staff-add', label: t('nav.staff.add'), icon: <UserPlus className="w-4 h-4" />, href: '/staff/add' },
        { key: 'staff-attendance', label: t('nav.staff.attendance'), icon: <UserCheck className="w-4 h-4" />, href: '/staff/attendance' },
        { key: 'staff-roles', label: 'Roles', icon: <Shield className="w-4 h-4" />, href: '/staff/roles' },
        { key: 'departments', label: t('nav.staff.departments'), icon: <Building className="w-4 h-4" />, href: '/departments' },
        { key: 'workplans', label: t('nav.staff.workplans'), icon: <Clipboard className="w-4 h-4" />, href: '/work-plans' }
      ]
    },
    {
      key: 'academics',
      label: t('nav.academics._'),
      icon: <GraduationCap className="w-5 h-5" />,
      children: [
        { key: 'classes', label: t('nav.academics.classes'), icon: <School className="w-4 h-4" />, href: '/academics/classes' },
        { key: 'streams', label: t('nav.academics.streams'), icon: <Target className="w-4 h-4" />, href: '/academics/streams' },
        { key: 'subjects', label: t('nav.academics.subjects'), icon: <BookOpen className="w-4 h-4" />, href: '/academics/subjects' },
        { key: 'timetable', label: t('nav.academics.timetable'), icon: <Calendar className="w-4 h-4" />, href: '/academics/timetable' },
        { key: 'academic-years', label: t('nav.academics.years'), icon: <Calendar className="w-4 h-4" />, href: '/academics/years' },
        { key: 'terms', label: t('nav.academics.terms'), icon: <Clock className="w-4 h-4" />, href: '/terms/list' },
        { key: 'curriculums', label: t('nav.academics.curriculums'), icon: <BookMarked className="w-4 h-4" />, href: '/academics/curriculums' }
      ]
    },
    {
      key: 'attendance',
      label: t('nav.attendance._') || 'Attendance',
      icon: <UserCheck className="w-5 h-5" />,
      children: [
        { key: 'attendance-dashboard', label: t('nav.attendance.dashboard') || 'Attendance Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, href: '/attendance' },
        { key: 'attendance-sessions', label: t('nav.attendance.sessions') || 'Sessions', icon: <Calendar className="w-4 h-4" />, href: '/attendance/sessions' },
        { key: 'attendance-reports', label: t('nav.attendance.reports') || 'Reports', icon: <BarChart3 className="w-4 h-4" />, href: '/attendance/reports' },
        { key: 'attendance-dahua', label: t('nav.attendance.dahua') || 'Dahua Devices', icon: <Fingerprint className="w-4 h-4" />, href: '/attendance/dahua' },
        { key: 'attendance-device-logs', label: 'Device Logs', icon: <FileSearch className="w-4 h-4" />, href: '/attendance/devices' },
        { key: 'attendance-reconcile', label: t('nav.attendance.reconcile') || 'Reconciliation', icon: <Activity className="w-4 h-4" />, href: '/attendance/reconcile' }
      ]
    },
    {
      key: 'promotions',
      label: t('nav.promotions._') || 'Promotions',
      icon: <TrendingUp className="w-5 h-5" />,
      href: '/promotions'
    },
    {
      key: 'tahfiz',
      label: t('nav.tahfiz._'),
      icon: <TahfizIcon className="w-5 h-5 text-amber-600" />,
      children: [
        {
          key: 'tahfiz-learners',
          label: t('nav.tahfiz.learners'),
          icon: <Users className="w-4 h-4" />,
          href: '/tahfiz/students'
        },
        {
          key: 'tahfiz-records',
          label: t('nav.tahfiz.records'),
          icon: <FileText className="w-4 h-4" />,
          href: '/tahfiz/records'
        },
        {
          key: 'tahfiz-books',
          label: t('nav.tahfiz.books'),
          icon: <Book className="w-4 h-4" />,
          href: '/tahfiz/books'
        },
        {
          key: 'tahfiz-portions',
          label: t('nav.tahfiz.portions'),
          icon: <BookMarked className="w-4 h-4" />,
          href: '/tahfiz/portions'
        },
        {
          key: 'tahfiz-groups',
          label: t('nav.tahfiz.groups'),
          icon: <Users className="w-4 h-4" />,
          href: '/tahfiz/groups'
        },
        {
          key: 'tahfiz-overview',
          label: t('nav.tahfiz.overview'),
          icon: <BarChart3 className="w-4 h-4" />,
          href: '/tahfiz'
        },
        {
          key: 'tahfiz-attendance',
          label: t('nav.tahfiz.attendance'),
          icon: <Clock className="w-4 h-4" />,
          href: '/tahfiz/attendance'
        },
        {
          key: 'tahfiz-plans',
          label: t('nav.tahfiz.plans'),
          icon: <Target className="w-4 h-4" />,
          href: '/tahfiz/plans'
        },
        {
          key: 'tahfiz-results',
          label: t('nav.tahfiz.results'),
          icon: <Award className="w-4 h-4" />,
          href: '/tahfiz/results'
        },
        {
          key: 'tahfiz-reports',
          label: t('nav.tahfiz.reports'),
          icon: <BarChart3 className="w-4 h-4" />,
          href: '/tahfiz/reports'
        }
      ]
    },
    {
      key: 'examinations',
      label: t('nav.examinations._'),
      icon: <ClipboardList className="w-5 h-5" />,
      children: [
        { key: 'exams', label: t('nav.examinations.exams'), icon: <ClipboardList className="w-4 h-4" />, href: '/academics/exams' },
        { key: 'results', label: t('nav.examinations.results'), icon: <Award className="w-4 h-4" />, href: '/academics/results' },
        { key: 'report-cards', label: t('nav.examinations.reportcards'), icon: <FileText className="w-4 h-4" />, href: '/academics/reports' },
        { key: 'deadlines', label: t('nav.examinations.deadlines'), icon: <AlarmClock className="w-4 h-4" />, href: '/examinations/deadlines' }
      ]
    },
    {
      key: 'finance',
      label: t('nav.finance._'),
      icon: <Wallet className="w-5 h-5" />,
      children: [
        { key: 'learners-fees', label: 'Learners Fees Overview', icon: <Users className="w-4 h-4" />, href: '/finance/learners-fees' },
        { key: 'wallets', label: t('nav.finance.wallets'), icon: <Wallet className="w-4 h-4" />, href: '/finance/wallets' },
        { key: 'fees', label: t('nav.finance.fees'), icon: <CreditCard className="w-4 h-4" />, href: '/finance/fees' },
        { key: 'fees-ledger', label: t('nav.finance.fees_ledger'), icon: <FileBarChart className="w-4 h-4" />, href: '/finance/ledger/fees' },
        { key: 'payments', label: t('nav.finance.payments'), icon: <Receipt className="w-4 h-4" />, href: '/finance/payments' },
        { key: 'ledger', label: t('nav.finance.ledger'), icon: <FileText className="w-4 h-4" />, href: '/finance/ledger' },
        { key: 'waivers', label: t('nav.finance.waivers'), icon: <Percent className="w-4 h-4" />, href: '/finance/waivers' },
        { key: 'expenditures', label: t('nav.finance.expenditures'), icon: <TrendingDown className="w-4 h-4" />, href: '/finance/expenditures' },
        { key: 'reports-income', label: t('nav.finance.income_statement'), icon: <FileBarChart className="w-4 h-4" />, href: '/finance/reports/income-statement' },
        { key: 'reports-balance', label: t('nav.finance.balance_sheet'), icon: <Scale className="w-4 h-4" />, href: '/finance/reports/balance-sheet' },
        { key: 'categories', label: t('nav.finance.categories'), icon: <PieChart className="w-4 h-4" />, href: '/finance/categories' }
      ]
    },
    {
      key: 'payroll',
      label: t('nav.payroll._'),
      icon: <Coins className="w-5 h-5" />,
      children: [
        { key: 'payroll-definitions', label: t('nav.payroll.definitions'), icon: <FileCog className="w-4 h-4" />, href: '/payroll/definitions' },
        { key: 'payroll-salaries', label: t('nav.payroll.salaries'), icon: <BadgeDollarSign className="w-4 h-4" />, href: '/payroll/salaries' },
        { key: 'payroll-payments', label: t('nav.payroll.payments'), icon: <TrendingUp className="w-4 h-4" />, href: '/payroll/payments' }
      ]
    },
    {
      key: 'inventory',
      label: t('nav.inventory._'),
      icon: <Package className="w-5 h-5" />,
      children: [
        { key: 'stores', label: t('nav.inventory.stores'), icon: <Building className="w-4 h-4" />, href: '/inventory/stores' },
        { key: 'store-items', label: t('nav.inventory.items'), icon: <Package className="w-4 h-4" />, href: '/inventory/items' },
        { key: 'store-transactions', label: t('nav.inventory.transactions'), icon: <Truck className="w-4 h-4" />, href: '/inventory/transactions' }
      ]
    },
    {
      key: 'locations',
      label: t('nav.locations._'),
      icon: <Map className="w-5 h-5" />,
      children: [
        { key: 'districts', label: t('nav.locations.districts'), icon: <Map className="w-4 h-4" />, href: '/locations/districts' },
        { key: 'counties', label: t('nav.locations.counties'), icon: <Map className="w-4 h-4" />, href: '/locations/counties' },
        { key: 'subcounties', label: t('nav.locations.subcounties'), icon: <Map className="w-4 h-4" />, href: '/locations/subcounties' },
        { key: 'parishes', label: t('nav.locations.parishes'), icon: <Map className="w-4 h-4" />, href: '/locations/parishes' },
        { key: 'villages', label: t('nav.locations.villages'), icon: <Map className="w-4 h-4" />, href: '/locations/villages' }
      ]
    },
    {
      key: 'events',
      label: t('nav.events._'),
      icon: <Calendar className="w-5 h-5" />,
      children: [
        { key: 'events-list', label: t('nav.events.list'), icon: <Calendar className="w-4 h-4" />, href: '/departments/events' },
        { key: 'reminders', label: t('nav.events.reminders'), icon: <Bell className="w-4 h-4" />, href: '/events/reminders' },
        { key: 'calendar', label: t('nav.events.calendar'), icon: <Calendar className="w-4 h-4" />, href: '/events/calendar' }
      ]
    },
    {
      key: 'documents',
      label: t('nav.documents._'),
      icon: <FileStack className="w-5 h-5" />,
      children: [
        { key: 'documents-upload', label: t('nav.documents.upload'), icon: <FilePlus2 className="w-4 h-4" />, href: '/documents/upload' },
        { key: 'documents-manage', label: t('nav.documents.manage'), icon: <FolderTree className="w-4 h-4" />, href: '/documents/manage' }
      ]
    },
    {
      key: 'reports',
      label: t('nav.reports._'),
      icon: <ChartBar className="w-5 h-5" />,
      children: [
        { key: 'analytics-students', label: t('nav.reports.students'), icon: <Users className="w-4 h-4" />, href: '/analytics/students' },
        { key: 'analytics-staff', label: t('nav.reports.staff'), icon: <Briefcase className="w-4 h-4" />, href: '/analytics/staff' },
        { key: 'analytics-finance', label: t('nav.reports.finance'), icon: <DollarSign className="w-4 h-4" />, href: '/analytics/finance' },
        { key: 'custom-reports', label: t('nav.reports.custom'), icon: <FileBarChart className="w-4 h-4" />, href: '/reports/custom' }
      ]
    },
    {
      key: 'communication',
      label: t('nav.communication._'),
      icon: <MessageSquare className="w-5 h-5" />,
      children: [
        { key: 'messages', label: t('nav.communication.messages'), icon: <MessageSquare className="w-4 h-4" />, href: '/communication/messages' },
        { key: 'notifications', label: t('nav.communication.notifications'), icon: <Bell className="w-4 h-4" />, href: '/communication/notifications' },
        { key: 'sms', label: t('nav.communication.sms'), icon: <Phone className="w-4 h-4" />, href: '/communication/sms' },
        { key: 'email', label: t('nav.communication.email'), icon: <Mail className="w-4 h-4" />, href: '/communication/email' }
      ]
    },
    {
      key: 'users-roles',
      label: t('nav.usersRoles._'),
      icon: <UserCog className="w-5 h-5" />,
      children: [
        { key: 'users', label: t('nav.usersRoles.users'), icon: <UserCog className="w-4 h-4" />, href: '/users/list' },
        { key: 'roles', label: t('nav.usersRoles.roles'), icon: <ShieldCheck className="w-4 h-4" />, href: '/users/roles' },
        { key: 'permissions', label: t('nav.usersRoles.permissions'), icon: <Shield className="w-4 h-4" />, href: '/system/permissions' },
        { key: 'audit-log', label: t('nav.usersRoles.audit'), icon: <FileText className="w-4 h-4" />, href: '/system/audit' }
      ]
    },
    {
      key: 'settings',
      label: t('nav.settings._'),
      icon: <Settings className="w-5 h-5" />,
      children: [
        { key: 'school-settings', label: t('nav.settings.school') || 'School Information', icon: <School className="w-4 h-4" />, href: '/settings' },
        { key: 'theme-settings', label: t('nav.settings.theme'), icon: <Palette className="w-4 h-4" />, href: '/settings/theme' },
        { key: 'system-settings', label: t('nav.settings.system'), icon: <Cog className="w-4 h-4" />, href: '/settings/system' },
        { key: 'profile', label: t('nav.settings.profile'), icon: <UserCog className="w-4 h-4" />, href: '/settings/profile' }
      ]
    },
    {
      key: 'help',
      label: t('nav.help'),
      icon: <HelpCircle className="w-5 h-5" />,
      href: '/help'
    }
  ];

  const renderBadge = (count: number) => {
    return (
      <span className={clsx(
        'ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold',
        count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'
      )}>
        {count > 99 ? '99+' : count}
      </span>
    );
  };

  // Update renderMenuItem to handle mobile layout
  function renderMenuItem(item: MenuItem, level = 0, isMobile = false) {
    const isActive = pathname === item.href || (item.children && item.children.some(child => pathname.startsWith(child.href || '')));
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.key);
    const hasActiveChild = item.children?.some(child => pathname.startsWith(child.href || ''));

    // Check if this route is flagged as new
    const isNew = item.href ? isRouteNew(item.href) : false;

    // For mobile, always show full layout
    const shouldCollapse = !isMobile && effectiveCollapsed;

    // Special rendering for Tahfiz parent to show summary + quick actions
    if (item.key === 'tahfiz' && hasChildren) {
      return (
        <div key={item.key} className="mb-2">
          <motion.button
            onClick={() => toggleExpanded(item.key)}
            initial={false}
            animate={{ backgroundColor: isExpanded || hasActiveChild ? 'rgba(250,240,230,0.12)' : 'transparent' }}
            className={clsx(
              'w-full flex items-center rounded-lg text-sm font-semibold transition-all duration-200',
              shouldCollapse ? 'justify-center p-2' : 'justify-between px-3 py-2',
              'text-amber-700 hover:bg-amber-50'
            )}
          >
            <div className="flex items-center gap-3">
              <span className="flex-shrink-0">{item.icon}</span>
              {!shouldCollapse && (
                <div className="flex flex-col">
                  <span className="truncate">{item.label}</span>
                  <span className="text-xs text-gray-500 mt-0.5">
                    {tCounts.loaded ? `${tCounts.learners} learners • ${tCounts.records} records` : 'Loading…'}
                  </span>
                </div>
              )}
            </div>

            {!shouldCollapse && (
              <div className="flex items-center gap-3">
                <div className="flex items-center space-x-2">
                  {tCounts.loaded ? (
                    <>
                      <span className="text-xs text-gray-400 hidden sm:inline">L {tCounts.learners}</span>
                      <span className="text-xs text-gray-400 hidden sm:inline">R {tCounts.records}</span>
                      <span className="text-xs text-gray-400 hidden sm:inline">P {tCounts.portions}</span>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">…</span>
                  )}
                </div>
                <span>
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>
              </div>
            )}
          </motion.button>

          <AnimatePresence initial={false}>
            {isExpanded && !shouldCollapse && item.children && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="ml-4 rtl:ml-0 rtl:mr-4 mt-2 space-y-1"
              >
                {item.children.map(child => (
                  <div key={child.key} className="flex items-center justify-between">
                    <Link
                      href={child.href!}
                      onClick={() => isMobile && setIsMobileOpen(false)}
                      className={clsx(
                        'flex items-center w-full gap-2 rounded-md px-3 py-2 text-sm transition',
                        pathname === child.href ? 'bg-amber-600/10 text-amber-700 font-medium' : 'text-gray-700 hover:bg-gray-100'
                      )}
                    >
                      <span className="flex-shrink-0">{child.icon}</span>
                      <span className="truncate">{child.label}</span>
                      {/* badges */}
                      {child.key === 'tahfiz-learners' && tCounts.loaded && renderBadge(tCounts.learners)}
                      {child.key === 'tahfiz-records' && tCounts.loaded && renderBadge(tCounts.records)}
                      {child.key === 'tahfiz-portions' && tCounts.loaded && renderBadge(tCounts.portions)}
                      {child.key === 'tahfiz-groups' && tCounts.loaded && renderBadge(tCounts.groups)}
                    </Link>
                  </div>
                ))}

                {/* Quick actions — shown inside the expanded Tahfiz group */}
                <div className="mt-2 px-2">
                  <div className="flex gap-2">
                    <Link 
                      href="/tahfiz/attendance" 
                      onClick={() => isMobile && setIsMobileOpen(false)}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-amber-600 text-white text-sm px-3 py-1.5 hover:shadow-md"
                    >
                      <UserCheck className="w-4 h-4" /> Mark Attendance
                    </Link>
                    <Link 
                      href="/tahfiz/students" 
                      onClick={() => isMobile && setIsMobileOpen(false)}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-600 text-amber-600 text-sm px-3 py-1.5 hover:bg-amber-50"
                    >
                      <Users className="w-4 h-4" /> Students
                    </Link>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    if (hasChildren) {
      return (
        <div key={item.key} className="mb-1">
          <button
            onClick={() => toggleExpanded(item.key)}
            className={clsx(
              'w-full flex items-center rounded-lg text-sm font-medium transition-all duration-200',
              shouldCollapse ? 'justify-center p-2' : 'justify-between px-3 py-2',
              (isExpanded || hasActiveChild)
                ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-600 dark:text-blue-400'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
            )}
          >
            <div className="flex items-center space-x-3 rtl:space-x-reverse">
              <span className="flex-shrink-0">{item.icon}</span>
              {!shouldCollapse && (
                <div className="flex items-center gap-2">
                  <span className="truncate">{item.label}</span>
                  {isNew && <NewBadge size="sm" animated />}
                </div>
              )}
            </div>
            {!shouldCollapse && (
              <span className="flex-shrink-0 ml-2 rtl:ml-0 rtl:mr-2">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className={clsx("w-4 h-4", isRTL && "transform rotate-180")} />
                )}
              </span>
            )}
          </button>

          <AnimatePresence initial={false}>
            {isExpanded && !shouldCollapse && item.children && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={clsx("ml-4 rtl:ml-0 rtl:mr-4 space-y-1 mt-1 overflow-hidden")}
              >
                {item.children.map(child => renderMenuItem(child, level + 1, isMobile))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }

    return (
      <Link
        key={item.key}
        href={item.href!}
        onClick={() => {
          if (isNew) {
            recordInteraction(item.href!, 'clicked');
          }
          if (isMobile) {
            setIsMobileOpen(false);
          }
        }}
        className={clsx(
          'flex items-center rounded-lg text-sm font-medium transition-all duration-200 mb-1 relative',
          shouldCollapse ? 'justify-center p-2' : 'px-3 py-2',
          level > 0 && 'text-xs py-1.5',
          isActive
            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
        )}
      >
        <span className="flex-shrink-0">{item.icon}</span>
        {!shouldCollapse && (
          <div className="flex items-center justify-between w-full">
            <span className="ml-3 rtl:ml-0 rtl:mr-3 truncate">{item.label}</span>
            {isNew && (
              <motion.div
                initial={{ scale: 0, x: 10 }}
                animate={{ scale: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <NewBadge size="sm" animated />
              </motion.div>
            )}
          </div>
        )}
        {/* Tooltip for collapsed state */}
        {shouldCollapse && isNew && (
          <div className="absolute left-full ml-2 px-2 py-1 bg-emerald-500 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
            NEW!
          </div>
        )}
      </Link>
    );
  }

  // Determine if sidebar should be expanded (either not collapsed or being hovered)
  const isExpanded = !theme.sidebarCollapsed || isHovered;

  // Close mobile sidebar when route changes
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Close mobile sidebar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const sidebar = document.getElementById('mobile-sidebar');
      const hamburger = document.getElementById('hamburger-button');
      
      if (isMobileOpen && 
          sidebar && 
          !sidebar.contains(event.target as Node) &&
          hamburger &&
          !hamburger.contains(event.target as Node)) {
        setIsMobileOpen(false);
      }
    };

    if (isMobileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden'; // Prevent body scroll on mobile
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [isMobileOpen]);

  // Listen for hamburger toggle from navbar
  useEffect(() => {
    const handleToggleSidebar = () => {
      setIsMobileOpen(prev => !prev);
    };

    window.addEventListener('toggleSidebar', handleToggleSidebar);
    return () => window.removeEventListener('toggleSidebar', handleToggleSidebar);
  }, []);

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setIsMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <AnimatePresence initial={false}>
        <motion.aside
          key={String(effectiveCollapsed) + lang + theme.sidebarPosition}
          onMouseEnter={() => { setHovering(true); setIsHovered(true); }}
          onMouseLeave={() => { setHovering(false); setIsHovered(false); }}
          initial={{ x: isRight ? 260 : -260, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: isRight ? 260 : -260, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          className={clsx(
            'fixed top-16 bottom-0 z-30 flex-col transition-all duration-300',
            // Hide on mobile, show on desktop
            'hidden md:flex',
            'backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border border-white/20 dark:border-white/10',
            'shadow-xl',
            isRight ? 'right-0 border-l left-auto' : 'left-0 border-r',
            effectiveCollapsed ? 'w-16' : 'w-72'
          )}
        >
          {/* Header */}
          <div className="p-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <AnimatePresence>
                {!effectiveCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="overflow-hidden"
                  >
                    
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 overflow-y-auto">
            <div className="space-y-1">
              {menuItems.map(item => renderMenuItem(item))}
            </div>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-white/10">
            <AnimatePresence>
              {!effectiveCollapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-gray-400 text-center"
                >
                  Tahfiz — fast, modern memorization tracking
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.aside>
      </AnimatePresence>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.aside
            id="mobile-sidebar"
            initial={{ x: isRight ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: isRight ? '100%' : '-100%' }}
            transition={{ type: "tween", duration: 0.3, ease: [0.42, 0, 0.58, 1] as [number, number, number, number] }}
            className={clsx(
              'fixed top-0 bottom-0 z-50 w-80 max-w-[85vw] flex flex-col',
              'md:hidden', // Only show on mobile
              'backdrop-blur-xl bg-white/95 dark:bg-slate-900/95 border border-white/20 dark:border-white/10',
              'shadow-2xl',
              isRight ? 'right-0 border-l' : 'left-0 border-r'
            )}
          >
            {/* Mobile Header */}
            <div className="p-4 border-b border-white/10 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                    <span className="text-white font-bold text-sm">D</span>
                  </div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    DRAIS
                  </h1>
                </div>
                <button
                  onClick={() => setIsMobileOpen(false)}
                  className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  aria-label="Close sidebar"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Mobile Navigation */}
            <nav className="flex-1 p-4 overflow-y-auto">
              <div className="space-y-2">
                {menuItems.map(item => renderMenuItem(item, 0, true))}
              </div>
            </nav>

            {/* Mobile Footer */}
            <div className="p-4 border-t border-white/10 bg-gradient-to-r from-blue-500/5 to-purple-500/5">
              <div className="text-xs text-gray-400 text-center">
                {sidebarSchoolName} Management System
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
};

export { Sidebar };
export default Sidebar;