'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Menu, Bell, Cloud, CloudOff, Wifi, WifiOff, Check, CheckCheck, Loader, AlertCircle, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';
import { SearchBar } from '@/components/ui/SearchBar';
import { ProfileDropdown } from '@/components/ui/ProfileDropdown';

const fetcher = (url: string) => fetch(url).then(r => r.json());

/** Small badge shown in the navbar indicating Cloudinary connection status. */
function CloudinaryBadge() {
  const { data } = useSWR('/api/cloudinary/status', fetcher, {
    refreshInterval: 5 * 60 * 1000, // re-check every 5 min
    revalidateOnFocus: false,
  });

  const connected = data?.connected;
  const pending   = data === undefined;

  if (pending) return null;

  return (
    <div
      title={data?.message || (connected ? 'Cloudinary connected' : 'Cloudinary not connected')}
      className={`hidden lg:flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
        connected
          ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-700 dark:text-green-400'
          : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400'
      }`}
    >
      {connected ? <Cloud className="w-3 h-3" /> : <CloudOff className="w-3 h-3" />}
      <span>{connected ? 'Cloud ✓' : 'Cloud ✗'}</span>
    </div>
  );
}

/** Global badge showing device status — RED if no devices or all offline. */
function DeviceStatusBadge() {
  const { data } = useSWR('/api/devices/summary', fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: false,
  });

  const pending = data === undefined;
  if (pending) return null;

  const total  = data?.data?.total  ?? 0;
  const online = data?.data?.online ?? 0;

  // Show RED "No Devices" when nothing registered
  if (total === 0) {
    return (
      <Link
        href="/attendance/devices/monitor"
        title="No devices registered"
        className="hidden lg:flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30"
      >
        <WifiOff className="w-3 h-3" />
        <span>No Devices</span>
      </Link>
    );
  }

  const anyOnline = online > 0;

  return (
    <Link
      href="/attendance/devices/monitor"
      title={`${online}/${total} device${total !== 1 ? 's' : ''} online`}
      className={`hidden lg:flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
        anyOnline
          ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30'
          : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'
      }`}
    >
      {anyOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
      <span>{anyOnline ? `${online} Live` : 'Offline'}</span>
    </Link>
  );
}
/** Global badge to cancel stale relay commands — only visible when queue has pending/sent rows. */
function RelayQueueDrainBadge() {
  const [count, setCount] = useState(0);
  const [draining, setDraining] = useState(false);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch('/api/relay-commands/drain');
      if (!res.ok) return;
      const data = await res.json();
      setCount(data.count ?? 0);
    } catch {}
  }, []);

  useEffect(() => {
    fetchCount();
    const iv = setInterval(fetchCount, 10000);
    return () => clearInterval(iv);
  }, [fetchCount]);

  if (count === 0) return null;

  const drain = async () => {
    if (draining) return;
    setDraining(true);
    try {
      await fetch('/api/relay-commands/drain', { method: 'POST' });
      setCount(0);
    } catch {}
    setDraining(false);
  };

  return (
    <button
      onClick={drain}
      disabled={draining}
      title={`${count} stale relay command${count !== 1 ? 's' : ''} — click to cancel all`}
      className="hidden lg:flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border
                 bg-amber-50 border-amber-300 text-amber-700
                 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400
                 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-60 transition-colors"
    >
      {draining ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
      <span>Clear queue ({count})</span>
    </button>
  );
}
// ─── Notification Bell Dropdown ───────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Unread count — poll every 30s
  const { data: countData, mutate: mutateCount } = useSWR(
    '/api/notifications/unread-count',
    fetcher,
    { refreshInterval: 30000, revalidateOnFocus: true }
  );
  const unread: number = countData?.unread ?? 0;

  // Notification list — only fetch when dropdown is open
  const { data: listData, isLoading: listLoading, mutate: mutateList } = useSWR(
    open ? '/api/notifications/list?limit=10' : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const notifications: any[] = listData?.notifications ?? [];

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Mark all as read when opening
  const handleOpen = useCallback(async () => {
    setOpen(prev => !prev);
  }, []);

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (!unreadIds.length) return;
    try {
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: unreadIds }),
      });
      // Optimistic — refresh both lists
      mutateCount();
      mutateList();
    } catch { /* silent — count will resync on next poll */ }
  };

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 relative"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
      >
        <Bell size={20} className="text-gray-700 dark:text-gray-300" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-0.5 bg-red-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-500" />
              Notifications
              {unread > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">{unread}</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  title="Mark all as read"
                  className="flex items-center gap-1 text-[10px] text-indigo-600 hover:underline font-semibold"
                >
                  <CheckCheck className="w-3 h-3" /> All read
                </button>
              )}
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-[10px] text-gray-400 hover:text-indigo-600 transition-colors"
              >
                View all →
              </Link>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
            {listLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                <Loader className="w-4 h-4 animate-spin text-indigo-500" />
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Bell className="w-8 h-8 text-gray-300" />
                <p className="text-sm text-gray-400">No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                    !n.is_read ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.is_read ? 'bg-gray-200 dark:bg-gray-600' : 'bg-indigo-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 dark:text-white truncate">{n.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{n.created_at ? timeAgo(n.created_at) : '—'}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface TopbarProps {
  onMenuClick: () => void;
}

/**
 * TOPBAR - Professional Header with Search & Profile
 * 
 * DESKTOP LAYOUT:
 * - Left: Menu (hidden lg+) + Logo
 * - Center: Global Search Bar
 * - Right: Notifications + Profile Dropdown
 * 
 * MOBILE LAYOUT:
 * - Left: Menu icon + Logo
 * - Center: Search icon (opens modal)
 * - Right: Profile circle (compact)
 * 
 * DESIGN RULES:
 * - 56px height
 * - Visible simplicity, hidden power
 * - One-click access to everything powerful
 * - Touch zones: 44px minimum
 * - No clutter
 */
export const Topbar = ({ onMenuClick }: TopbarProps) => {
  return (
    <div className="sticky top-0 z-50 h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex items-center justify-between w-full h-full px-3 sm:px-4 lg:px-6 gap-4">
        {/* LEFT: Menu (mobile) + Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Menu Button - Only visible on mobile, 44px touch zone */}
          <button
            onClick={onMenuClick}
            className="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Toggle menu"
          >
            <Menu size={24} className="text-gray-700 dark:text-gray-300" />
          </button>

          {/* Logo */}
          <Link 
            href="/"
            className="flex items-center gap-2 font-bold text-lg text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-md">
              D
            </div>
            <span className="hidden sm:inline">DRAIS</span>
          </Link>
        </div>

        {/* CENTER: Global Search Bar */}
        <div className="hidden md:flex flex-1 max-w-md">
          <SearchBar isMobile={false} />
        </div>

        {/* RIGHT: Icons + Profile */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Mobile Search Icon */}
          <div className="md:hidden">
            <SearchBar isMobile={true} />
          </div>

          {/* Cloudinary Status Badge — desktop only */}
          <CloudinaryBadge />

          {/* Device Status Badge — desktop only */}
          <DeviceStatusBadge />

          {/* Relay queue drain — desktop only, appears only when queue is non-empty */}
          <RelayQueueDrainBadge />

          {/* Notification Bell */}
          <NotificationBell />

          {/* Profile Dropdown */}
          <ProfileDropdown />
        </div>
      </div>
    </div>
  );
};
