'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Users, BookOpen, FileText, BarChart3, UserCheck,
  Target, Calendar, Award, TrendingUp, Clock
} from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

export default function TahfizOverview() {
  const { t } = useI18n();
  const [stats] = useState([
    { label: t('people.students'),         value: '0', icon: Users,    color: 'emerald' },
    { label: t('orgUnits.groups'),         value: '0', icon: Users,    color: 'blue' },
    { label: t('tahfiz.memorisation'),     value: '0', icon: BookOpen, color: 'purple' },
    { label: t('common.completed'),        value: '0', icon: Award,    color: 'amber' }
  ]);
  const [quickActions] = useState([
    { title: t('people.learners'),         href: '/tahfiz/portions',   icon: Users,     description: t('tahfiz.memorisation') },
    { title: t('orgUnits.groups'),         href: '/tahfiz/groups',     icon: Users,     description: t('tahfiz.halaqat') },
    { title: t('academic.attendance'),     href: '/tahfiz/attendance', icon: UserCheck, description: t('academic.attendance') },
    { title: t('snapshot.reportCards'),    href: '/tahfiz/reports',    icon: BarChart3, description: t('tahfiz.progress') }
  ]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
      <div className="max-w-full mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-800 mb-2">{t('tahfiz.tahfiz')}</h1>
          <p className="text-slate-600 text-lg">{t('tahfiz.memorisation')}</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-600 text-sm font-medium">{stat.label}</p>
                  <p className="text-3xl font-bold text-slate-800 mt-1">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl bg-${stat.color}-100 flex items-center justify-center`}>
                  <stat.icon className={`w-6 h-6 text-${stat.color}-600`} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">{t('common.more')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {quickActions.map((action, index) => (
              <motion.div
                key={action.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link href={action.href}>
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20 hover:shadow-xl transition-all duration-300 group cursor-pointer">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <action.icon className="w-5 h-5 text-emerald-600" />
                      </div>
                      <h3 className="font-bold text-slate-800 group-hover:text-emerald-600 transition-colors">
                        {action.title}
                      </h3>
                    </div>
                    <p className="text-slate-600 text-sm">{action.description}</p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
            <Clock className="w-5 h-5 mr-2" />
            {t('operations.auditTrail')}
          </h2>
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-600">{t('common.nothingHere')}</p>
            <p className="text-slate-500 text-sm mt-1">{t('common.empty')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
