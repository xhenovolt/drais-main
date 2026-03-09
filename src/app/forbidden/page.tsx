"use client";
import React from 'react';
import Link from 'next/link';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useSchoolConfig } from '@/hooks/useSchoolConfig';
import { motion } from 'framer-motion';
import { Home, ArrowLeft, Shield, Lock, AlertCircle, Contact } from 'lucide-react';

export default function ForbiddenPage() {
  const { t, dir } = useI18n();
  const { school } = useSchoolConfig();
  const isRTL = dir === 'rtl';

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 dark:from-red-900/20 dark:via-orange-900/20 dark:to-yellow-900/20 flex items-center justify-center p-4">
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
              <span className="text-8xl sm:text-9xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
                4
              </span>
              <motion.div
                animate={{ 
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ 
                  duration: 3, 
                  repeat: Infinity, 
                  ease: [0.42, 0, 0.58, 1] as [number, number, number, number] 
                }}
                className="relative"
              >
                <Shield className="w-20 h-20 sm:w-24 sm:h-24 text-red-500" />
                <motion.div
                  animate={{ 
                    scale: [1, 1.3, 1],
                    opacity: [0.7, 1, 0.7]
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                >
                  <Lock className="w-8 h-8 text-white" />
                </motion.div>
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute -top-2 -right-2"
                >
                  <AlertCircle className="w-6 h-6 text-orange-500" />
                </motion.div>
              </motion.div>
              <span className="text-8xl sm:text-9xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
                3
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
                {t('errors.access_forbidden') || 'Access Forbidden'}
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-300 max-w-lg mx-auto leading-relaxed">
                {t('errors.access_forbidden_description') || 
                  'You do not have permission to access this resource. Please contact your administrator if you believe this is an error.'}
              </p>
            </div>

            {/* Security Notice */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6 mx-auto max-w-md"
            >
              <div className="flex items-center justify-center space-x-3 rtl:space-x-reverse mb-3">
                <Shield className="w-8 h-8 text-red-600 dark:text-red-400" />
                <h2 className="text-lg font-semibold text-red-800 dark:text-red-300">
                  {t('errors.security_notice') || 'Security Notice'}
                </h2>
              </div>
              <p className="text-sm text-red-700 dark:text-red-400">
                {t('errors.security_notice_description') || 
                  'This action has been logged for security purposes. Unauthorized access attempts are monitored.'}
              </p>
            </motion.div>

            {/* Permission Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700 mx-auto max-w-lg"
            >
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {t('errors.what_you_can_do') || 'What you can do:'}
              </h3>
              <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300 text-start">
                <li className="flex items-start space-x-3 rtl:space-x-reverse">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
                  <span>{t('errors.check_permissions') || 'Check if you have the necessary permissions for this action'}</span>
                </li>
                <li className="flex items-start space-x-3 rtl:space-x-reverse">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
                  <span>{t('errors.contact_admin') || 'Contact your system administrator for access'}</span>
                </li>
                <li className="flex items-start space-x-3 rtl:space-x-reverse">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
                  <span>{t('errors.verify_role') || 'Verify your user role and assigned permissions'}</span>
                </li>
                <li className="flex items-start space-x-3 rtl:space-x-reverse">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0"></div>
                  <span>{t('errors.try_different_section') || 'Try accessing a different section of the system'}</span>
                </li>
              </ul>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.5 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link href="/dashboard" className="group">
                <button className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95">
                  <Home className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  {t('navigation.dashboard') || 'Go to Dashboard'}
                </button>
              </Link>

              <button
                onClick={() => window.history.back()}
                className="inline-flex items-center gap-3 px-6 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold rounded-xl shadow-sm hover:shadow-md transition-all duration-300 hover:scale-105 active:scale-95"
              >
                <ArrowLeft className={`w-5 h-5 transition-transform ${isRTL ? 'rotate-180' : ''}`} />
                {t('common.go_back') || 'Go Back'}
              </button>

              <Link href="/help/support" className="group">
                <button className="inline-flex items-center gap-3 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95">
                  <Contact className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  {t('common.contact_support') || 'Contact Support'}
                </button>
              </Link>
            </motion.div>

            {/* User Info */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1, duration: 0.5 }}
              className="border-t border-gray-200 dark:border-gray-700 pt-6"
            >
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('errors.current_user') || 'Current user:'} 
                <span className="font-semibold text-gray-700 dark:text-gray-300 ml-2">
                  {/* This would be populated with actual user data */}
                  Admin User
                </span>
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {t('errors.error_code') || 'Error Code:'} 403 - FORBIDDEN_ACCESS
              </p>
            </motion.div>
          </motion.div>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.3, duration: 0.5 }}
            className="text-xs text-gray-400 dark:text-gray-500"
          >
            © {new Date().getFullYear()} {school.name} Management System. All rights reserved.
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
