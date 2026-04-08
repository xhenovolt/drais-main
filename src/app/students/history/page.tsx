"use client";

import React, { useState, useEffect } from "react";
import { Search, Archive, TrendingUp, TrendingDown, BarChart3, User, Award } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from "framer-motion";
import useSWR from "swr";
import { fetcher } from "@/utils/fetcher";
import { useRouter, useSearchParams } from "next/navigation";

const AcademicHistoryPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const studentIdFromUrl = searchParams?.get("studentId") || "";

  const { user } = useAuth();
  const schoolId = user?.schoolId ?? 0;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Use URL student ID if provided, otherwise use selected student
  const effectiveStudentId = studentIdFromUrl || selectedStudent;

  // Fetch academic history data
  const { data: historyData, isLoading } = useSWR(
    `/api/students/history?school_id=${schoolId}${effectiveStudentId ? `&student_id=${effectiveStudentId}` : ""}`,
    fetcher,
    { refreshInterval: 30000 }
  );

  // Fetch students for filter
  const { data: studentsData } = useSWR(`/api/students/full?school_id=${schoolId}`, fetcher);

  const academicResults = historyData?.data?.academic_results || [];
  const studentHistory = historyData?.data?.student_history || [];
  const students = studentsData?.data || [];

  // Group results by student
  const groupedResults = academicResults.reduce((acc: any, result: any) => {
    const key = result.student_id;
    if (!acc[key]) {
      acc[key] = {
        student: {
          id: result.student_id,
          name: `${result.first_name} ${result.last_name}`,
          admission_no: result.admission_no,
        },
        results: [],
      };
    }
    acc[key].results.push(result);
    return acc;
  }, {});

  // Filter based on search
  const filteredResults = Object.values(groupedResults).filter((group: any) => {
    return !searchQuery || group.student.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const calculateAverage = (results: any[]) => {
    if (results.length === 0) return 0;
    const total = results.reduce((sum, result) => sum + (result.score || 0), 0);
    return (total / results.length).toFixed(1);
  };

  const getGradeColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-100";
    if (score >= 70) return "text-blue-600 bg-blue-100";
    if (score >= 60) return "text-yellow-600 bg-yellow-100";
    if (score >= 50) return "text-orange-600 bg-orange-100";
    return "text-red-600 bg-red-100";
  };

  const getTrendIcon = (current: number, previous: number) => {
    if (current > previous) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (current < previous) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <BarChart3 className="w-4 h-4 text-gray-500" />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              📚 Academic History
            </h1>
            <p className="text-gray-600 dark:text-gray-400">{filteredResults.length} student records</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-4 py-2 rounded-lg transition-colors ${
                viewMode === "grid"
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-4 py-2 rounded-lg transition-colors ${
                viewMode === "list"
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              List
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search students..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>

            <select
              value={effectiveStudentId}
              onChange={(e) => setSelectedStudent(e.target.value)}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            >
              <option value="">All Students</option>
              {students.map((student: any) => (
                <option key={student.id} value={student.id}>
                  {student.first_name} {student.last_name}
                </option>
              ))}
            </select>

            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedStudent("");
              }}
              className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Results Display */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-500 dark:text-gray-400">Loading academic history...</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {filteredResults.map((group: any, index: number) => (
                <motion.div
                  key={group.student.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  {/* Student Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                      {group.student.name.split(" ").map((n: string) => n.charAt(0)).join("")}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{group.student.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{group.student.admission_no}</p>
                    </div>
                  </div>

                  {/* Performance Summary */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{group.results.length}</div>
                      <div className="text-xs text-blue-600 dark:text-blue-400">Results</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {calculateAverage(group.results)}%
                      </div>
                      <div className="text-xs text-green-600 dark:text-green-400">Average</div>
                    </div>
                  </div>

                  {/* Recent Results */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-900 dark:text-white text-sm">Recent Results:</h4>
                    {group.results.slice(0, 3).map((result: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-700 rounded-lg"
                      >
                        <div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {result.subject_name}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                            {result.term_name}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getGradeColor(result.score || 0)}`}
                        >
                          {result.score || 0}%
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* View Details Button */}
                  <button
                    onClick={() => setSelectedStudent(group.student.id)}
                    className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    View Full History
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          // List View
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-gray-600">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Student
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Subject
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Term
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Score
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Grade
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                  <AnimatePresence>
                    {academicResults.slice(0, 50).map((result: any, index: number) => (
                      <motion.tr
                        key={result.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: index * 0.02 }}
                        className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                              {result.first_name?.charAt(0)}
                              {result.last_name?.charAt(0)}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white text-sm">
                                {result.first_name} {result.last_name}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {result.admission_no}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 dark:text-white">
                            {result.subject_name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {result.class_name}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900 dark:text-white">
                            {result.term_name}
                          </span>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {result.academic_year}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${getGradeColor(result.score || 0)}`}
                          >
                            {result.score || 0}%
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900 dark:text-white">
                            {result.grade || "N/A"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900 dark:text-white">
                            {new Date(result.created_at).toLocaleDateString()}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>

              {academicResults.length === 0 && (
                <div className="text-center py-12">
                  <Archive className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">No academic history found</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AcademicHistoryPage;