'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Target, Plus, Search, Calendar, BookOpen, MoreVertical } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

interface Plan {
  id: number;
  name: string;
  description: string;
  duration: string;
  status: 'active' | 'completed';
}

export default function LearningPlans() {
  const { t } = useI18n();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setPlans([
        { id: 1, name: 'Plan A', description: 'Complete Juz 1 in 2 weeks', duration: '2 weeks', status: 'active' },
        { id: 2, name: 'Plan B', description: 'Revise Juz 2 in 1 month', duration: '1 month', status: 'completed' },
        { id: 3, name: 'Plan C', description: 'Memorize Juz 3 in 3 weeks', duration: '3 weeks', status: 'active' },
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
      <div className="max-w-full mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">{`${t('nav.staff.workplans')}`}</h1>
            <p className="text-slate-600 mt-1">Create and manage structured learning plans for students</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Create Plan</span>
          </motion.button>
        </div>

        {/* Search */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search plans..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
              />
            </div>
            <select className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200">
              <option value="">All Classes</option>
            </select>
            <select className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200">
              <option value="">All Types</option>
              <option value="hifz">Hifz</option>
              <option value="tilawa">Tilawa</option>
              <option value="muraja">Muraja</option>
            </select>
          </div>
        </div>

        {/* Plans List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading
            ? Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="bg-white rounded-2xl p-6 shadow-lg animate-pulse">
                  <div className="h-6 bg-slate-200 rounded w-1/2 mb-4"></div>
                  <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-slate-200 rounded w-1/3"></div>
                </div>
              ))
            : plans
                .filter((plan) =>
                  plan.name.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .map((plan) => (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20 hover:shadow-xl transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-slate-800">{plan.name}</h3>
                        <p className="text-sm text-slate-600">{plan.description}</p>
                      </div>
                      <button className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                        <MoreVertical className="w-5 h-5 text-slate-400" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">{plan.duration}</span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          plan.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {plan.status}
                      </span>
                    </div>
                  </motion.div>
                ))}
        </div>

        {/* Content Placeholder */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-12 shadow-lg border border-white/20 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Target className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">Learning Plans</h3>
          <p className="text-slate-600 mb-6">
            This page will manage structured learning plans with goals, timelines, and progress tracking.
          </p>
        </div>
      </div>
    </div>
  );
}
