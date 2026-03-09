"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
	LayoutDashboard,
	Users,
	Briefcase,
	GraduationCap,
	Wallet2,
	MoreHorizontal,
	Settings,
	Palette,
	User,
	HelpCircle,
	Calendar,
	DollarSign,
	BadgeDollarSign,
	BookOpen,
	CalendarCheck2,
	X,
	ChevronRight,
	UserCheck,
	ClipboardList,
	TrendingUp,
	Coins,
	Package,
	Map,
	MessageSquare,
	UserCog,
	ChartBar,
	Bell,
	Award,
	FileText,
	Building,
	Target,
	School,
	Phone,
	Mail,
	Archive,
	CheckSquare,
	Shield,
	Cog,
	BookMarked,
	BarChart3,
	Fingerprint,
	Activity,
	FileSearch,
	AlarmClock,
	TrendingDown,
	PieChart,
	Scale,
	FileCog,
	Truck,
	FilePlus2,
	FolderTree,
	FileBarChart,
	ShieldCheck,
	Percent,
	Clock,
	FileStack,
	Layers,
	Landmark,
	Receipt,
} from "lucide-react";
import clsx from "clsx";
import React, { useState } from "react";

// Core items displayed in the bottom navigation
const coreItems = [
	{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ href: "/students/list", label: "Students", icon: Users },
	{ href: "/staff/list", label: "Staff", icon: Briefcase },
	{ href: "/academics/classes", label: "Classes", icon: GraduationCap },
	{ href: "/finance/fees", label: "Finance", icon: Wallet2 },
];

// Secondary menu items grouped by category for the More drawer
const navigationCategories = [
	{
		title: "Academic Management",
		items: [
			{ href: "/attendance", label: "Attendance", icon: UserCheck },
			{ href: "/academics/timetable", label: "Timetable", icon: Calendar },
			{ href: "/academics/subjects", label: "Subjects", icon: BookOpen },
			{ href: "/academics/exams", label: "Examinations", icon: ClipboardList },
			{ href: "/academics/results", label: "Results", icon: Award },
			{ href: "/academics/reports", label: "Report Cards", icon: FileText },
		],
	},
	{
		title: "Curriculum & Tahfiz",
		items: [
			{ href: "/academics/curriculums", label: "Curriculums", icon: BookMarked },
			{ href: "/tahfiz", label: "Tahfiz Module", icon: BookOpen },
			{ href: "/tahfiz/students", label: "Tahfiz Learners", icon: Users },
			{ href: "/tahfiz/records", label: "Tahfiz Records", icon: FileText },
			{ href: "/tahfiz/groups", label: "Tahfiz Groups", icon: Users },
		],
	},
	{
		title: "Finance & Payroll",
		items: [
			{ href: "/finance/wallets", label: "Wallets", icon: Wallet2 },
			{ href: "/finance/payments", label: "Payments", icon: Receipt },
			{ href: "/finance/ledger", label: "Ledger", icon: FileText },
			{ href: "/finance/waivers", label: "Waivers", icon: Percent },
			{ href: "/payroll/salaries", label: "Salaries", icon: BadgeDollarSign },
			{ href: "/payroll/payments", label: "Payroll", icon: TrendingUp },
		],
	},
	{
		title: "Organization",
		items: [
			{ href: "/departments", label: "Departments", icon: Building },
			{ href: "/academics/streams", label: "Streams", icon: Target },
			{ href: "/academic-years", label: "Academic Years", icon: Calendar },
			{ href: "/terms/list", label: "Terms", icon: Clock },
			{ href: "/work-plans", label: "Work Plans", icon: ClipboardList },
		],
	},
	{
		title: "Operations",
		items: [
			{ href: "/inventory/stores", label: "Inventory", icon: Package },
			{ href: "/locations/districts", label: "Locations", icon: Map },
			{ href: "/departments/events", label: "Events", icon: Calendar },
			{ href: "/documents/manage", label: "Documents", icon: FileStack },
			{ href: "/promotions", label: "Promotions", icon: TrendingUp },
		],
	},
	{
		title: "Communication & Reporting",
		items: [
			{ href: "/communication/messages", label: "Messages", icon: MessageSquare },
			{ href: "/communication/notifications", label: "Notifications", icon: Bell },
			{ href: "/analytics/students", label: "Analytics", icon: ChartBar },
			{ href: "/reports/custom", label: "Reports", icon: FileBarChart },
		],
	},
	{
		title: "System Administration",
		items: [
			{ href: "/settings", label: "School Settings", icon: School },
			{ href: "/settings/theme", label: "Theme", icon: Palette },
			{ href: "/users/list", label: "Users & Roles", icon: UserCog },
			{ href: "/system/permissions", label: "Permissions", icon: ShieldCheck },
			{ href: "/settings/system", label: "System Settings", icon: Cog },
			{ href: "/settings/profile", label: "Profile", icon: User },
		],
	},
	{
		title: "Help & Support",
		items: [
			{ href: "/help", label: "Help Center", icon: HelpCircle },
			{ href: "/settings/profile", label: "Support", icon: LifeBuoy },
		],
	},
];

// Simple placeholder icon for LifeBuoy
const LifeBuoy = () => <HelpCircle className="w-4 h-4" />;

export const BottomNav: React.FC = () => {
	const pathname = usePathname();
	const [open, setOpen] = useState(false);
	const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

	const isActive = (href: string) => pathname.startsWith(href);

	return (
		<>
			{/* Bottom Navigation Bar - Mobile Only */}
			<nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur-md bg-white/80 dark:bg-gray-900/80 border-t border-gray-200/50 dark:border-gray-700/50 h-16 flex items-stretch shadow-lg">
				{coreItems.map((item) => {
					const Icon = item.icon;
					const active = isActive(item.href);
					return (
						<Link
							key={item.href}
							href={item.href}
							className="flex-1 flex flex-col items-center justify-center text-[11px] font-semibold relative group transition-colors"
						>
							<Icon
								className={clsx(
									"w-5 h-5 mb-1 transition-colors",
									active
										? "text-[var(--color-primary)]"
										: "text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200"
								)}
							/>
							<span className={clsx(
								"transition-colors",
								active ? "text-[var(--color-primary)]" : "text-gray-600 dark:text-gray-400"
							)}>
								{item.label}
							</span>
							{active && (
								<div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary)]" />
							)}
						</Link>
					);
				})}
				<button
					onClick={() => setOpen(true)}
					className="flex-1 flex flex-col items-center justify-center text-[11px] font-semibold relative group transition-colors hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
					aria-label="More navigation options"
				>
					<MoreHorizontal className="w-5 h-5 mb-1 text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors" />
					<span className="text-gray-600 dark:text-gray-400">More</span>
				</button>
			</nav>

			{/* Navigation Drawer - Full Screen Modal */}
			{open && (
				<div className="md:hidden fixed inset-0 z-50 flex flex-col">
					{/* Backdrop */}
					<div
						className="flex-1 bg-black/40 backdrop-blur-sm transition-opacity"
						onClick={() => setOpen(false)}
					/>

					{/* Drawer Content */}
					<div className="bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col">
						{/* Header */}
						<div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
							<div>
								<h2 className="text-lg font-bold text-gray-900 dark:text-white">Navigation</h2>
								<p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Explore all modules</p>
							</div>
							<button
								onClick={() => setOpen(false)}
								className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
								aria-label="Close navigation"
							>
								<X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
							</button>
						</div>

						{/* Scrollable Content */}
						<div className="overflow-y-auto flex-1 px-4 py-4 space-y-2">
							{navigationCategories.map((category) => (
								<div key={category.title}>
									{/* Category Header */}
									<button
										onClick={() =>
											setExpandedCategory(
												expandedCategory === category.title ? null : category.title
											)
										}
										className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
									>
										<h3 className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-[var(--color-primary)] transition-colors">
											{category.title}
										</h3>
										<ChevronRight
											className={clsx(
												"w-4 h-4 text-gray-500 transition-transform duration-200",
												expandedCategory === category.title && "rotate-90"
											)}
										/>
									</button>

									{/* Category Items */}
									{expandedCategory === category.title && (
										<div className="space-y-1 pl-2 mb-3">
											{category.items.map((item) => {
												const Icon = item.icon;
												const active = isActive(item.href);
												return (
													<Link
														key={item.href}
														href={item.href}
														onClick={() => setOpen(false)}
														className={clsx(
															"flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-sm transition-all",
															active
																? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
																: "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
														)}
													>
														<Icon className="w-4 h-4 flex-shrink-0" />
														<span>{item.label}</span>
														{active && (
															<div className="ml-auto w-2 h-2 rounded-full bg-[var(--color-primary)]" />
														)}
													</Link>
												);
											})}
										</div>
									)}
								</div>
							))}
						</div>
					</div>
				</div>
			)}
		</>
	);
};

export default BottomNav;
