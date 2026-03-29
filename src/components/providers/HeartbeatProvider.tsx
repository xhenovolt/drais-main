'use client';
/**
 * HeartbeatProvider - calls POST /api/heartbeat every 60s while the user is logged in.
 * Updates sessions.last_activity_at so the User Monitoring page shows accurate online status.
 * Mount inside the authenticated section of the app layout.
 */
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds

// Pages where we should NOT send heartbeats (unauthenticated routes)
const AUTH_PREFIXES = ['/auth', '/login', '/signup', '/forgot-password', '/reset-password'];

export default function HeartbeatProvider() {
  const pathname   = usePathname();
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSent   = useRef<number>(0);

  const isAuthPage = AUTH_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));

  useEffect(() => {
    if (isAuthPage) return;

    async function sendHeartbeat() {
      // Debounce: don't send if we sent less than 30s ago
      if (Date.now() - lastSent.current < 30_000) return;
      lastSent.current = Date.now();
      try {
        await fetch('/api/heartbeat', { method: 'POST' });
      } catch {
        // Silently ignore — heartbeat is non-critical
      }
    }

    // Send on mount (marks the user as online immediately)
    sendHeartbeat();

    // Schedule periodic heartbeats
    timerRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isAuthPage]);

  return null;
}
