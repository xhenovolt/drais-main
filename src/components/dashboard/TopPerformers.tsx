"use client";
import React from 'react';
import { motion } from 'framer-motion';
import { Trophy, TrendingUp, User, Medal, Award } from 'lucide-react';
import { MediaImg } from '@/components/media/MediaImg';

interface TopPerformerData {
  id: number;
  name: string;
  className: string;
  average: number;
  rank: number;
  trend: string;
  photoUrl?: string;
}

interface TopPerformersProps {
  data?: TopPerformerData[];
}

const TopPerformers: React.FC<TopPerformersProps> = ({ data = [] }) => {
  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="w-4 h-4 text-green-500" />;
      default:
        return <TrendingUp className="w-4 h-4 text-gray-400" />;
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="w-5 h-5 text-yellow-500" />;
      case 2:
        return <Medal className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Award className="w-5 h-5 text-orange-500" />;
      default:
        return <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-gray-600 bg-gray-200 rounded-full">{rank}</span>;
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-full bg-gradient-to-br from-green-500 to-emerald-600">
          <Trophy className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Top Performers</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">School-wide leaders</p>
        </div>
      </div>

      <div className="space-y-4">
        {data.length === 0 ? (
          <div className="text-center py-8">
            <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No performance data available
            </p>
          </div>
        ) : (
          data.map((performer, index) => (
            <motion.div
              key={performer.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors group"
            >
              <div className="flex-shrink-0">
                {getRankIcon(performer.rank)}
              </div>
              
              <div className="flex-shrink-0">
                {performer.photoUrl ? (
                  <MediaImg
                    src={performer.photoUrl}
                    alt={performer.name}
                    className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-slate-600"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {performer.name}
                  </p>
                  {getTrendIcon(performer.trend)}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {performer.className}
                </p>
              </div>

              <div className="text-right">
                <p className="font-semibold text-gray-900 dark:text-white">
                  {performer.average}%
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Average
                </p>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {data.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
          <button className="w-full text-sm text-blue-600 hover:text-blue-700 transition-colors">
            View All Top Performers →
          </button>
        </div>
      )}
    </div>
  );
};

export default TopPerformers;
