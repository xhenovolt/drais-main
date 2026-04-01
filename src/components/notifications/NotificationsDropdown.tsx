"use client";
import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Eye, 
  EyeOff, 
  Archive, 
  ExternalLink, 
  Clock, 
  CheckCircle,
  AlertCircle,
  Info,
  XCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

interface NotificationsDropdownProps {
  userId: number;
  schoolId?: number;
  onClose: () => void;
  onNotificationRead: (count: number) => void;
}

interface Notification {
  id: number;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  created_at: string;
  is_read: boolean;
  metadata?: any;
  entity_type?: string;
  entity_id?: number;
}

export const NotificationsDropdown: React.FC<NotificationsDropdownProps> = ({
  userId,
  schoolId,
  onClose,
  onNotificationRead
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [cursor, setCursor] = useState<string | null>(null);
  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(
          `/api/notifications/list?user_id=${userId}&filter=${filter}&limit=25${schoolId ? `&school_id=${schoolId}` : ''}`
        );
        const data = await response.json();
        if (data.success) {
          setAllNotifications(data.notifications || []);
          setHasMore(data.hasMore || false);
          setCursor(data.nextCursor || null);
        }
      } catch (error) {
        console.error('Error fetching notifications:', error);
        // Set empty array on error to prevent UI issues
        setAllNotifications([]);
        setHasMore(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotifications();
  }, [userId, schoolId, filter]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Load more notifications
  const loadMore = async () => {
    if (!hasMore || isLoadingMore || !cursor) return;

    setIsLoadingMore(true);
    try {
      const response = await fetch(
        `/api/notifications/list?user_id=${userId}&filter=${filter}&cursor=${cursor}&limit=25${schoolId ? `&school_id=${schoolId}` : ''}`
      );
      const result = await response.json();
      
      if (result.success) {
        setAllNotifications(prev => [...prev, ...result.notifications]);
        setHasMore(result.hasMore);
        setCursor(result.nextCursor);
      }
    } catch (error) {
      console.error('Error loading more notifications:', error);
      showToast('error', 'Failed to load more notifications');
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Mark as read
  const markAsRead = async (notificationIds: number[]) => {
    try {
      await apiFetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: notificationIds, user_id: userId }),
        successMessage: 'Marked as read',
      });

      setAllNotifications(prev => 
        prev.map(notif => 
          notificationIds.includes(notif.id) 
            ? { ...notif, is_read: true }
            : notif
        )
      );
      
      const unreadCount = notificationIds.filter(id => {
        const notif = allNotifications.find(n => n.id === id);
        return notif && !notif.is_read;
      }).length;
      
      onNotificationRead(unreadCount);
    } catch (error) {
      // apiFetch already showed error toast
    }
  };

  // Archive notifications
  const archiveNotifications = async (notificationIds: number[]) => {
    try {
      await apiFetch('/api/notifications/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: notificationIds, user_id: userId }),
        successMessage: 'Notifications archived',
      });

      setAllNotifications(prev => 
        prev.filter(notif => !notificationIds.includes(notif.id))
      );
      
      const unreadCount = notificationIds.filter(id => {
        const notif = allNotifications.find(n => n.id === id);
        return notif && !notif.is_read;
      }).length;
      
      onNotificationRead(unreadCount);
    } catch (error) {
      // apiFetch already showed error toast
    }
  };

  // Get priority icon and color
  const getPriorityDisplay = (priority: string) => {
    switch (priority) {
      case 'critical':
        return { icon: XCircle, color: 'text-red-500' };
      case 'high':
        return { icon: AlertCircle, color: 'text-orange-500' };
      case 'normal':
        return { icon: Info, color: 'text-blue-500' };
      case 'low':
        return { icon: CheckCircle, color: 'text-gray-400' };
      default:
        return { icon: Info, color: 'text-gray-400' };
    }
  };

  // Generate deep link
  const getNotificationLink = (notification: Notification) => {
    if (notification.metadata?.link) {
      return notification.metadata.link;
    }
    
    if (notification.entity_type && notification.entity_id) {
      return `/schools/${schoolId || 1}/${notification.entity_type}/${notification.entity_id}`;
    }
    
    return null;
  };

  // Mark all as read
  const markAllAsRead = () => {
    const unreadIds = allNotifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length > 0) {
      markAsRead(unreadIds);
    }
  };

  return (
    <motion.div
      ref={dropdownRef}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50"
      style={{ maxHeight: '80vh' }}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Notifications
          </h3>
          <button
            onClick={markAllAsRead}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            disabled={allNotifications.every(n => n.is_read)}
          >
            Mark all read
          </button>
        </div>
        
        {/* Filter tabs */}
        <div className="flex space-x-4">
          <button
            onClick={() => setFilter('all')}
            className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
              filter === 'all'
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
              filter === 'unread'
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            Unread
          </button>
        </div>
      </div>

      {/* Notifications list */}
      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">Loading notifications...</p>
          </div>
        ) : allNotifications.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 text-gray-300">
              <CheckCircle className="w-full h-full" />
            </div>
            <p className="text-gray-500 dark:text-gray-400">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {allNotifications.map((notification, index) => {
              const { icon: PriorityIcon, color } = getPriorityDisplay(notification.priority);
              const link = getNotificationLink(notification);
              
              return (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`p-4 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${
                    !notification.is_read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Priority indicator */}
                    <div className={`mt-1 ${color}`}>
                      <PriorityIcon className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className={`text-sm font-medium truncate ${
                          notification.is_read 
                            ? 'text-gray-700 dark:text-gray-300' 
                            : 'text-gray-900 dark:text-white'
                        }`}>
                          {notification.title}
                        </h4>
                        {!notification.is_read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></div>
                        )}
                      </div>
                      
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                        {notification.message}
                      </p>
                      
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          <span title={new Date(notification.created_at).toLocaleString()}>
                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        
                        {/* Quick actions */}
                        <div className="flex items-center gap-1">
                          {!notification.is_read && (
                            <button
                              onClick={() => markAsRead([notification.id])}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                              title="Mark as read"
                            >
                              <Eye className="w-3 h-3" />
                            </button>
                          )}
                          
                          <button
                            onClick={() => archiveNotifications([notification.id])}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                            title="Archive"
                          >
                            <Archive className="w-3 h-3" />
                          </button>
                          
                          {link && (
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                              title="Open link"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Load More */}
        {hasMore && (
          <div className="p-4 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={loadMore}
              disabled={isLoadingMore}
              className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
            >
              {isLoadingMore ? 'Loading...' : 'Load more notifications'}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => {
            onClose();
            // Navigate to full notifications page
            window.location.href = '/notifications';
          }}
          className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          View all notifications
        </button>
      </div>
    </motion.div>
  );
};

export default NotificationsDropdown;