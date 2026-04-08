"use client";
import React from 'react';
import { BookOpen, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import Link from 'next/link';

interface SubjectStatsProps {
  data?: any[];
}

const SubjectStats: React.FC<SubjectStatsProps> = ({ data = [] }) => {
  const subjects = Array.isArray(data) ? data : [];

  const getTrendIcon = (trend: string) => {
    if (trend === 'up')   return <TrendingUp   className="w-4 h-4 text-green-500" />;
    if (trend === 'down') return <TrendingDown  className="w-4 h-4 text-red-500" />;
    return <BarChart3 className="w-4 h-4 text-gray-400" />;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50 dark:bg-green-900/20';
    if (score >= 70) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
    return 'text-red-600 bg-red-50 dark:bg-red-900/20';
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600">
          <BookOpen className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">Subject Performance</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Based on submitted results</p>
        </div>
      </div>

      {subjects.length === 0 ? (
        <div className="text-center py-8">
          <BookOpen className="w-10 h-10 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No subject results yet</p>
          <Link href="/academics/results" className="mt-2 inline-block text-xs text-indigo-600 hover:underline dark:text-indigo-400">
            Enter results →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {subjects.slice(0, 5).map((subject, index) => {
            const passRate   = Number(subject.passRate   ?? subject._avg?.passRate   ?? 0);
            const avgScore   = Number(subject.averageScore ?? subject._avg?.averageScore ?? 0);
            return (
              <div
                key={subject.subjectId ?? index}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{subject.name ?? `Subject ${index + 1}`}</p>
                    {getTrendIcon(subject.trend ?? 'stable')}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Pass rate</span>
                        <span>{passRate}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-600"
                          style={{ width: `${Math.min(passRate, 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${getScoreColor(avgScore)}`}>
                      {Math.round(avgScore)}%
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
        <Link href="/academics/results" className="text-sm text-indigo-600 hover:text-indigo-700 dark:hover:text-indigo-400 transition-colors">
          View detailed analysis →
        </Link>
      </div>
    </div>
  );
};

export default SubjectStats;
