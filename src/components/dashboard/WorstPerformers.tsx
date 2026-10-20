"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, TrendingDown, User, BookOpen, MessageCircle } from 'lucide-react';
import { MediaImg } from '@/components/media/MediaImg';

interface WorstPerformerData {
  id: number;
  name: string;
  className: string;
  average: number;
  rank: number;
  isAtRisk: boolean;
  photoUrl?: string;
}

interface WorstPerformersProps {
  data?: WorstPerformerData[];
}

const WorstPerformers: React.FC<WorstPerformersProps> = ({ data = [] }) => {
  const getQuickAction = (studentId: number, action: string) => {
    console.log(`Quick action: ${action} for student ${studentId}`);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-full bg-gradient-to-br from-red-500 to-pink-600">
          <AlertTriangle className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">At-Risk Students</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Need attention</p>
        </div>
      </div>

      <div className="space-y-4">
        {data.length === 0 ? (
          <div className="text-center py-8">
            <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No at-risk students identified
            </p>
          </div>
        ) : (
          data.map((performer, index) => (
            <motion.div
              key={performer.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-shrink-0">
                  {performer.photoUrl ? (
                    <MediaImg
                      src={performer.photoUrl}
                      alt={performer.name}
                      className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-slate-600"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {performer.name}
                    </p>
                    {performer.isAtRisk && (
                      <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-full">
                        At Risk
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {performer.className} • {performer.average}% avg
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-red-600">
                    #{performer.rank}
                  </span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => getQuickAction(performer.id, 'tutor')}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                >
                  <BookOpen className="w-3 h-3" />
                  Assign Tutor
                </button>
                <button
                  onClick={() => getQuickAction(performer.id, 'contact')}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-xs font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                >
                  <MessageCircle className="w-3 h-3" />
                  Contact Parent
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {data.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          <button className="w-full text-sm text-red-600 hover:text-red-700 transition-colors">
            View All At-Risk Students →
          </button>
        </div>
      )}
    </div>
  );
};

export default WorstPerformers;
