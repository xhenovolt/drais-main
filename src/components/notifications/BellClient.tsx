"use client";
import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { DefaultBell } from '@/components/icons/DefaultBell';
import { motion, AnimatePresence } from 'framer-motion';
import { NotificationsDropdown } from './NotificationsDropdown';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useSocket } from '@/hooks/useSocket';

interface BellClientProps {
  userId?: number;
  schoolId?: number;
  className?: string;
}

export const BellClient: React.FC<BellClientProps> = ({ 
  userId = 1, 
  schoolId, 
  className = '' 
}) => {
  const { t, digits } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const socket = useSocket();

  // Fetch initial unread count
  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        const response = await fetch(
          `/api/notifications/unread-count?user_id=${userId}${schoolId ? `&school_id=${schoolId}` : ''}`
        );
        const data = await response.json();
        if (data.success) {
          setUnreadCount(data.unread || 0);
        }
      } catch (error) {
        console.error('Error fetching unread count:', error);
        // Set to 0 on error to prevent UI issues
        setUnreadCount(0);
      }
    };

    fetchUnreadCount();
    
    // Poll every 30 seconds as fallback
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [userId, schoolId]);

  // Listen for real-time notifications (only if socket is available)
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (data: any) => {
      setUnreadCount(prev => prev + 1);
      
      // Show browser notification if permission granted
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(data.title, {
          body: data.message,
          icon: '/favicon.ico',
          tag: `notification-${data.id}`
        });
      }
    };

    const handleNotificationUpdate = (data: any) => {
      if (data.action === 'marked_read') {
        setUnreadCount(prev => Math.max(0, prev - data.ids.length));
      }
    };

    socket.on('notification:new', handleNewNotification);
    socket.on('notification:updated', handleNotificationUpdate);

    return () => {
      socket.off('notification:new', handleNewNotification);
      socket.off('notification:updated', handleNotificationUpdate);
    };
  }, [socket]);

  // Request notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const handleClick = () => {
    setIsOpen(!isOpen);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleNotificationRead = (count: number) => {
    setUnreadCount(prev => Math.max(0, prev - count));
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        className={`relative p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
        aria-label={unreadCount > 0 ? t('shell.notificationsUnreadAria', { count: unreadCount }) : t('shell.notificationsAria', 'Notifications')}
      >
        <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        
        {/* Enhanced Unread badge with feature update indicator */}
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-semibold rounded-full flex items-center justify-center leading-none"
            >
              {digits(unreadCount > 99 ? '99+' : unreadCount)}
            </motion.span>
          )}
        </AnimatePresence>

        {/* Feature update pulse indicator */}
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.7, 1, 0.7]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: [0.42, 0, 0.58, 1] as [number, number, number, number]
          }}
          className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full"
          style={{ 
            filter: 'blur(2px)',
            zIndex: -1
          }}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <NotificationsDropdown
            userId={userId}
            schoolId={schoolId}
            onClose={handleClose}
            onNotificationRead={handleNotificationRead}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default BellClient;
