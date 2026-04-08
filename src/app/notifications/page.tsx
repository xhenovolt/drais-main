"use client";
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, 
  Search, 
  Filter, 
  Archive, 
  Eye, 
  EyeOff, 
  Trash2,
  Settings,
  CheckCircle,
  AlertCircle,
  Info,
  XCircle,
  Clock,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import useSWR from 'swr';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';
import NewBadge from '@/components/ui/NewBadge';

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
  action: string;
}

const NotificationsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Fetch notifications — userId and schoolId come from the session server-side
  const { data, isLoading, mutate } = useSWR(
    `/api/notifications/list?filter=${filter}&limit=50`
  );

  const notifications: Notification[] = data?.notifications || [];

  // Filter notifications based on search
  const filteredNotifications = notifications.filter(notification =>
    !searchQuery || 
    notification.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    notification.message.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get priority display
  const getPriorityDisplay = (priority: string) => {
    switch (priority) {
      case 'critical':
        return { icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-50 dark:bg-red-900/20' };
      case 'high':
        return { icon: AlertCircle, color: 'text-orange-500', bgColor: 'bg-orange-50 dark:bg-orange-900/20' };
      case 'normal':
        return { icon: Info, color: 'text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-900/20' };
      case 'low':
        return { icon: CheckCircle, color: 'text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-900/20' };
      default:
        return { icon: Info, color: 'text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-900/20' };
    }
  };

  // Mark as read
  const markAsRead = async (notificationIds: number[]) => {
    try {
      await apiFetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: notificationIds }),
        successMessage: 'Marked as read',
      });
      mutate();
    } catch (error) {
      // apiFetch already shows error toast
    }
  };

  // Archive notifications
  const archiveNotifications = async (notificationIds: number[]) => {
    try {
      await apiFetch('/api/notifications/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: notificationIds }),
        successMessage: 'Notifications archived',
      });
      mutate();
    } catch (error) {
      // apiFetch already shows error toast
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                🔔 Notifications
              </h1>
              <NewBadge size="sm" animated />
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              {filteredNotifications.length} notifications
            </p>
          </div>
          
          <button className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
            <Settings className="w-4 h-4" />
            Preferences
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg mb-8">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search notifications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>

            {/* Filter tabs */}
            <div className="flex space-x-2">
              {(['all', 'unread', 'archived'] as const).map((filterOption) => (
                <button
                  key={filterOption}
                  onClick={() => setFilter(filterOption)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    filter === filterOption
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Notifications List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-500 dark:text-gray-400">Loading notifications...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-2xl">
              <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No notifications found
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {filter === 'unread' 
                  ? "You're all caught up! No unread notifications."
                  : "No notifications match your current filter."}
              </p>
            </div>
          ) : (
            <AnimatePresence>
              {filteredNotifications.map((notification, index) => {
                const { icon: PriorityIcon, color, bgColor } = getPriorityDisplay(notification.priority);
                
                return (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: index * 0.02 }}
                    className={`bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 border-2 ${
                      !notification.is_read 
                        ? 'border-blue-200 dark:border-blue-800' 
                        : 'border-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Priority indicator */}
                      <div className={`mt-1 ${color}`}>
                        <PriorityIcon className="w-5 h-5" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className={`text-lg font-semibold mb-2 ${
                              notification.is_read 
                                ? 'text-gray-700 dark:text-gray-300' 
                                : 'text-gray-900 dark:text-white'
                            }`}>
                              {notification.title}
                              {!notification.is_read && (
                                <span className="ml-2 w-2 h-2 bg-blue-500 rounded-full inline-block"></span>
                              )}
                            </h3>
                            
                            <p className="text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
                              {notification.message}
                            </p>
                            
                            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                              <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                <span title={new Date(notification.created_at).toLocaleString()}>
                                  {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                                </span>
                              </div>
                              
                              {notification.entity_type && (
                                <span className="px-2 py-1 bg-gray-100 dark:bg-slate-700 rounded-full text-xs">
                                  {notification.entity_type}
                                </span>
                              )}

                              {notification.action === 'system_update' && (
                                <span className="px-2 py-1 bg-gradient-to-r from-emerald-500 to-blue-500 text-white rounded-full text-xs flex items-center gap-1">
                                  <Sparkles className="w-3 h-3" />
                                  System Update
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            {!notification.is_read && (
                              <button
                                onClick={() => markAsRead([notification.id])}
                                className="p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                                title="Mark as read"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            
                            <button
                              onClick={() => archiveNotifications([notification.id])}
                              className="p-2 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                              title="Archive"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                            
                            {notification.metadata?.link && (
                              <a
                                href={notification.metadata.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
                                title="Open link"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;
