"use client";
import React from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useSchoolConfig } from '@/hooks/useSchoolConfig';
import { motion } from 'framer-motion';
import { Home, RefreshCw, Server, Wifi, ArrowLeft } from 'lucide-react';

export default function ServerErrorPage() {
  const { t, dir } = useI18n();
  const { school } = useSchoolConfig();
  const isRTL = dir === 'rtl';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-purple-900/20 dark:via-blue-900/20 dark:to-indigo-900/20 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-8"
        >
          {/* Error Animation */}
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.8, type: "spring" }}
            className="relative"
          >
            <div className="flex items-center justify-center space-x-4 rtl:space-x-reverse">
              <span className="text-8xl sm:text-9xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                5
              </span>
              <motion.div
                animate={{ 
                  rotate: [0, 5, -5, 0],
                  scale: [1, 1.05, 1]
                }}
                transition={{ 
                  duration: 3, 
                  repeat: Infinity, 
                  ease: [0.42, 0, 0.58, 1] as [number, number, number, number] 
                }}
                className="relative"
              >
                <Server className="w-20 h-20 sm:w-24 sm:h-24 text-purple-500" />
                <motion.div
                  animate={{ 
                    opacity: [0.5, 1, 0.5],
                    scale: [1, 1.1, 1]
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute -top-2 -right-2"
                >
                  <Wifi className="w-6 h-6 text-red-500" />
                </motion.div>
              </motion.div>
              <span className="text-8xl sm:text-9xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                0
              </span>
              <span className="text-8xl sm:text-9xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                0
              </span>
            </div>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="space-y-6"
          >
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
                {t('errors.server_error') || 'Server Error'}
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-300 max-w-lg mx-auto leading-relaxed">
                {t('errors.server_error_description') || 
                  'Our servers are currently experiencing issues. We are working to restore normal service as quickly as possible.'}
              </p>
            </div>

            {/* Server Status */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-2xl p-6 mx-auto max-w-md"
            >
              <div className="flex items-center justify-center space-x-3 rtl:space-x-reverse mb-3">
                <Server className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                <h2 className="text-lg font-semibold text-purple-800 dark:text-purple-300">
                  {t('errors.server_status') || 'Server Status'}
                </h2>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-purple-700 dark:text-purple-400">Database:</span>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                    <span className="text-yellow-600">Checking...</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-purple-700 dark:text-purple-400">API:</span>
                  <div className="flex items-center space-x-2 rtl:space-x-reverse">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span className="text-red-600">Offline</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <button
                onClick={() => window.location.reload()}
                className="group inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95"
              >
                <RefreshCw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
                {t('common.refresh') || 'Refresh Page'}
              </button>

              <Link href="/dashboard" className="group">
                <button className="inline-flex items-center gap-3 px-6 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold rounded-xl shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105 active:scale-95">
                  <Home className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  {t('navigation.dashboard') || 'Go to Dashboard'}
                </button>
              </Link>
            </motion.div>
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.5 }}
            className="text-xs text-gray-400 dark:text-gray-500"
          >
            © {new Date().getFullYear()} {school.name} Management System. All rights reserved.
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
