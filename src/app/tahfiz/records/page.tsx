'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Plus, Search, Filter, Calendar, MoreVertical } from 'lucide-react';
import Link from 'next/link';

interface Record {
  id: number;
  student: string;
  portion: string;
  date: string;
  status: 'completed' | 'pending';
}

export default function TahfizRecords() {
  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function fetchRecords() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/tahfiz/records'); // Replace 1 with the actual school_id
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to fetch records');
        setRecords(data.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchRecords();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
      <div className="max-w-full mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Tahfiz Records</h1>
            <p className="text-slate-600 mt-1">Track student presentations and progress records</p>
          </div>
          <Link href="/tahfiz/portions" className="btn btn-outline">Portions</Link>
          <Link href="/tahfiz/learners" className="btn btn-primary">Learners</Link>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Add Record</span>
          </motion.button>
        </div>

        {/* Search */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search records..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
              />
            </div>
            <select className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200">
              <option value="">All Students</option>
            </select>
            <input
              type="date"
              className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
            />
          </div>
        </div>

        {/* Records List */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="py-2 px-4 text-slate-600 font-medium">Student</th>
                <th className="py-2 px-4 text-slate-600 font-medium">Portion</th>
                <th className="py-2 px-4 text-slate-600 font-medium">Date</th>
                <th className="py-2 px-4 text-slate-600 font-medium">Status</th>
                <th className="py-2 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 3 }).map((_, index) => (
                    <tr key={index}>
                      <td className="py-2 px-4">
                        <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                      </td>
                      <td className="py-2 px-4">
                        <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                      </td>
                      <td className="py-2 px-4">
                        <div className="h-4 bg-slate-200 rounded w-1/3"></div>
                      </td>
                      <td className="py-2 px-4">
                        <div className="h-4 bg-slate-200 rounded w-1/4"></div>
                      </td>
                      <td className="py-2 px-4"></td>
                    </tr>
                  ))
                : records.map((record) => (
                    <tr key={record.id}>
                      <td className="py-2 px-4">{record.student}</td>
                      <td className="py-2 px-4">{record.portion}</td>
                      <td className="py-2 px-4">{record.date}</td>
                      <td className="py-2 px-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            record.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {record.status}
                        </span>
                      </td>
                      <td className="py-2 px-4">
                        <button className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                          <MoreVertical className="w-5 h-5 text-slate-400" />
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {error && <div className="text-red-500 text-center">{error}</div>}
      </div>
    </div>
  );
}
