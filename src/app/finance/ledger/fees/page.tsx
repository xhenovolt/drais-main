"use client";
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, Search, Download, DollarSign, Users,
  CheckCircle, Clock, AlertCircle, TrendingUp, GraduationCap,
  Send, Edit, Eye
} from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';
import { toast } from 'react-hot-toast';
import NewBadge from '@/components/ui/NewBadge';

interface FeeLedgerEntry {
  student_id: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  class_name: string;
  section_name: string;
  parent_phone: string;
  total_expected: number;
  total_discount: number;
  total_waived: number;
  total_paid: number;
  total_balance: number;
  fee_items_count: number;
  fully_paid: number;
  partially_paid: number;
  pending_items_count: number;
  last_payment_date: string | null;
  overall_status: string;
}

export default function FeesLedgerPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [termFilter, setTermFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ledgerData, setLedgerData] = useState<{ data: FeeLedgerEntry[], summary: any } | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const url = `/api/finance/ledger/fees?${classFilter ? `class_id=${classFilter}` : ''}${sectionFilter ? `&section_id=${sectionFilter}` : ''}${termFilter ? `&term_id=${termFilter}` : ''}${statusFilter ? `&status=${statusFilter}` : ''}${searchQuery ? `&search=${searchQuery}` : ''}`;
      const response = await apiFetch<{ data: FeeLedgerEntry[], summary: any }>(url, { silent: true });
      setLedgerData(response);
    } catch (error) {
      toast.error('Failed to load fees ledger');
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    loadData();
  }, [classFilter, sectionFilter, termFilter, statusFilter]);

  const entries = ledgerData?.data || [];
  const summary = ledgerData?.summary || {};

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'text-green-600 bg-green-100 dark:bg-green-900/30';
      case 'partial': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30';
      case 'overdue': return 'text-red-600 bg-red-100 dark:bg-red-900/30';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid': return <CheckCircle className="w-4 h-4" />;
      case 'partial': return <Clock className="w-4 h-4" />;
      case 'overdue': return <AlertCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const handleSendReminder = async (entry: FeeLedgerEntry) => {
    try {
      await fetch('/api/reminders/send-fee-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: entry.student_id, phone: entry.parent_phone, balance: entry.total_balance })
      });
      toast.success('Reminder sent successfully');
    } catch (error) {
      toast.error('Failed to send reminder');
    }
  };

  const handleExportCSV = () => {
    const headers = ['Admission No', 'Name', 'Class', 'Section', 'Expected', 'Paid', 'Balance', 'Status'];
    const rows = entries.map(e => [e.admission_no, `${e.first_name} ${e.last_name}`, e.class_name, e.section_name, e.total_expected, e.total_paid, e.total_balance, e.overall_status]);
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fees-ledger-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">📊 Fees Ledger</h1>
              <NewBadge size="sm" animated />
            </div>
            <p className="text-gray-600 dark:text-gray-400">{entries.length} students • UGX {Number(summary.total_outstanding || 0).toLocaleString()} outstanding</p>
          </div>
          <div className="flex gap-3">
            <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
              <Download className="w-4 h-4" />Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Students</p><p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{summary.total_students || 0}</p></div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center"><Users className="w-6 h-6 text-white" /></div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-gray-600 dark:text-gray-400">Expected</p><p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">UGX {Number(summary.total_expected || 0).toLocaleString()}</p></div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center"><DollarSign className="w-6 h-6 text-white" /></div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-gray-600 dark:text-gray-400">Collected</p><p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">UGX {Number(summary.total_collected || 0).toLocaleString()}</p></div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center"><CheckCircle className="w-6 h-6 text-white" /></div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-gray-600 dark:text-gray-400">Outstanding</p><p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">UGX {Number(summary.total_outstanding || 0).toLocaleString()}</p></div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center"><TrendingUp className="w-6 h-6 text-white" /></div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-gray-600 dark:text-gray-400">Fully Paid</p><p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{summary.fully_paid || 0}</p></div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center"><GraduationCap className="w-6 h-6 text-white" /></div>
            </div>
          </motion.div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg mb-8 p-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input type="text" placeholder="Search students..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg">
              <option value="">All Status</option><option value="paid">Fully Paid</option><option value="partial">Partially Paid</option><option value="pending">Pending</option><option value="overdue">Overdue</option>
            </select>
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg"><option value="">All Classes</option></select>
            <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg"><option value="">All Sections</option><option value="day">Day</option><option value="boarding">Boarding</option></select>
            <select value={termFilter} onChange={(e) => setTermFilter(e.target.value)} className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg"><option value="">All Terms</option></select>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-700">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Expected</th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                  <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {isLoading ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div><p className="text-gray-500">Loading...</p></td></tr>
                ) : entries.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center"><FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">No students found</p></td></tr>
                ) : entries.map((entry, index) => (
                  <motion.tr key={entry.student_id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.02 }} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                    <td className="px-6 py-4"><div className="text-sm font-medium text-gray-900 dark:text-white">{entry.first_name} {entry.last_name}</div><div className="text-xs text-gray-500">{entry.admission_no}</div></td>
                    <td className="px-6 py-4"><div className="text-sm text-gray-900 dark:text-white">{entry.class_name}</div><div className="text-xs text-gray-500">{entry.section_name}</div></td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white text-right">UGX {Number(entry.total_expected).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-green-600 dark:text-green-400 text-right">UGX {Number(entry.total_paid).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm font-medium text-red-600 dark:text-red-400 text-right">UGX {Number(entry.total_balance).toLocaleString()}</td>
                    <td className="px-6 py-4 text-center"><span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(entry.overall_status)}`}>{getStatusIcon(entry.overall_status)}{entry.overall_status}</span></td>
                    <td className="px-6 py-4"><div className="flex items-center justify-center gap-2">
                      <button className="p-2 rounded text-blue-600 hover:bg-blue-50"><Eye className="w-4 h-4" /></button>
                      {entry.total_balance > 0 && <button onClick={() => handleSendReminder(entry)} className="p-2 rounded text-green-600 hover:bg-green-50"><Send className="w-4 h-4" /></button>}
                      <button className="p-2 rounded text-gray-600 hover:bg-gray-100"><Edit className="w-4 h-4" /></button>
                    </div></td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
