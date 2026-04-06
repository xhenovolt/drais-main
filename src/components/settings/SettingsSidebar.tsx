"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { School, Palette, User, FileText, Activity, Settings, Radio } from 'lucide-react';

const settingsNav = [
  { label: 'School',      href: '/settings/school',      icon: School },
  { label: 'Appearance',  href: '/settings/appearance',   icon: Palette },
  { label: 'Profile',     href: '/settings/profile',      icon: User },
  { label: 'Templates',   href: '/settings/templates',    icon: FileText },
  { label: 'System Status', href: '/settings/system',     icon: Activity },
  { label: 'Relay Setup', href: '/settings/relay',        icon: Radio },
];

export default function SettingsSidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-56 flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 py-4 px-2 space-y-1">
      <div className="flex items-center gap-2 px-3 mb-4">
        <Settings className="w-5 h-5 text-gray-400" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Settings</span>
      </div>
      {settingsNav.map(item => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Icon className={`w-4 h-4 ${active ? 'text-indigo-600 dark:text-indigo-400' : ''}`} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
