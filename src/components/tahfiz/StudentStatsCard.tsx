'use client';
import React from 'react';
import { motion } from 'framer-motion';
import { Users, BookOpen, Award, TrendingUp, Clock, CheckCircle } from 'lucide-react';

interface StudentStats {
  total: number;
  active: number;
  inactive: number;
  completed: number;
  deleted: number;
  withGroups: number;
  withoutGroups: number;
  averageProgress: number;
}

interface StudentStatsCardProps {
  stats: StudentStats;
  loading?: boolean;
}

export default function StudentStatsCard({ stats, loading = false }: StudentStatsCardProps) {
  if (loading) {
    return (
      <div className="bg-card/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-slate-200 rounded-lg" />
                <div className="space-y-2">
                  <div className="h-6 bg-slate-200 rounded w-16" />
                  <div className="h-4 bg-slate-200 rounded w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statItems = [
    {
      label: 'Total Students',
      value: stats.total,
      icon: Users,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700'
    },
    {
      label: 'Active Students',
      value: stats.active,
      icon: CheckCircle,
      color: 'from-emerald-500 to-emerald-600',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-700'
    },
    {
      label: 'In Groups',
      value: stats.withGroups,
      icon: BookOpen,
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-700'
    },
    {
      label: 'Avg. Progress',
      value: `${Math.round(stats.averageProgress)}%`,
      icon: TrendingUp,
      color: 'from-amber-500 to-amber-600',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-700'
    }
  ];

  return (
    <div className="bg-card/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
      <h3 className="text-lg font-semibold text-foreground mb-6 flex items-center">
        <Award className="w-5 h-5 mr-2" />
        Student Statistics
      </h3>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {statItems.map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="relative"
          >
            <div className="flex items-center space-x-3">
              <div className={`w-12 h-12 rounded-lg ${item.bgColor} flex items-center justify-center`}>
                <item.icon className={`w-6 h-6 ${item.textColor}`} />
              </div>
              <div>
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: index * 0.1 + 0.2, type: "spring", stiffness: 200 }}
                  className="text-2xl font-bold text-foreground"
                >
                  {typeof item.value === 'string' ? item.value : item.value.toLocaleString()}
                </motion.div>
                <p className="text-sm text-muted-foreground">{item.label}</p>
              </div>
            </div>
            
            {/* Progress bar for average progress */}
            {item.label === 'Avg. Progress' && typeof item.value === 'string' && (
              <div className="mt-3">
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.averageProgress}%` }}
                    transition={{ delay: index * 0.1 + 0.4, duration: 0.8 }}
                    className="bg-gradient-to-r from-amber-500 to-amber-600 h-2 rounded-full"
                  />
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>
      
      {/* Additional details */}
      <div className="mt-6 pt-6 border-t border-border">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="text-center">
            <div className="font-semibold text-foreground">{stats.completed}</div>
            <div className="text-muted-foreground">Completed</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-foreground">{stats.inactive}</div>
            <div className="text-muted-foreground">Inactive</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-foreground">{stats.withoutGroups}</div>
            <div className="text-muted-foreground">No Group</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-foreground">{stats.deleted}</div>
            <div className="text-muted-foreground">Archived</div>
          </div>
        </div>
      </div>
    </div>
  );
}