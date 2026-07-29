"use client";
import React, { useState, useMemo, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Upload,
  Eye,
  Edit,
  Trash2,
  DollarSign,
  Users,
  CheckCircle,
  AlertCircle,
  Clock
} from 'lucide-react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { swrFetcher } from '@/lib/apiClient';
import { toast } from 'react-hot-toast';
import NewBadge from '@/components/ui/NewBadge';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useCurrency } from '@/hooks/useCurrency';
import FeeItemModal from '@/components/finance/FeeItemModal';
import Pagination from '@/components/ui/Pagination';

interface FeeItem {
  id: number;
  student_id: number;
  term_id: number;
  item: string;
  amount: number;
  discount: number;
  waived: number;
  paid: number;
  balance: number;
  due_date?: string;
  status: string;
  student_name: string;
  admission_no: string;
  class_name?: string;
  term_name: string;
}

const PAGE_SIZE = 50;

/**
 * This page used to fetch EVERY student_fee_items row for the whole school
 * (no LIMIT server-side) and render each one as a separately-timed
 * <motion.tr> (delay: index * 0.05) — for any school with real fee history
 * that's thousands of rows and, past a couple hundred, a multi-second
 * stacked animation queue. Both are gone: the API is paginated + the
 * summary stats are a single aggregate query instead of a client-side sum
 * over the whole table, and rows render plainly (no per-row animation).
 */
const FeesPage: React.FC = () => {
  const { t } = useI18n();
  const { format } = useCurrency();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'structure' | 'students' | 'templates'>('students');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [termFilter, setTermFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modalItem, setModalItem] = useState<FeeItem | null | undefined>(undefined); // undefined=closed, null=new, item=edit

  // Debounce free-text search so every keystroke doesn't refetch.
  useEffect(() => {
    const t = setTimeout(() => { setSearchQuery(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const clearFilters = () => { setSearchInput(''); setSearchQuery(''); setClassFilter(''); setTermFilter(''); setStatusFilter(''); setPage(1); };

  const handleDelete = async (item: FeeItem) => {
    if (!confirm(`Delete fee item "${item.item}" for ${item.student_name}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/finance/student_fee_items?id=${item.id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) { toast.error(j.error || 'Delete failed'); return; }
      toast.success('Fee item deleted');
      mutate();
    } catch { toast.error('Delete failed'); }
  };

  const { data: classesData } = useSWR('/api/classes', swrFetcher);
  const classes = (classesData as any)?.data || [];
  const { data: termsData } = useSWR('/api/terms', swrFetcher);
  const terms = (termsData as any)?.data || [];

  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(PAGE_SIZE));
  if (classFilter) params.set('class_id', classFilter);
  if (termFilter) params.set('term_id', termFilter);
  if (statusFilter) params.set('status', statusFilter);
  if (searchQuery) params.set('q', searchQuery);

  const { data: feesData, isLoading, mutate } = useSWR(
    `/api/finance/fees?${params.toString()}`,
    swrFetcher,
    { refreshInterval: 60000 }
  );

  const feeItems: FeeItem[] = feesData?.data || [];
  const pagination = feesData?.pagination || { page: 1, limit: PAGE_SIZE, total: 0, pages: 1 };
  const summary = feesData?.summary || { total_amount: 0, total_paid: 0, total_balance: 0, overdue_count: 0 };

  const totalAmount = useMemo(() => Number(summary.total_amount) || 0, [summary]);
  const totalPaid = useMemo(() => Number(summary.total_paid) || 0, [summary]);
  const totalBalance = useMemo(() => Number(summary.total_balance) || 0, [summary]);
  const overdueCount = useMemo(() => Number(summary.overdue_count) || 0, [summary]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':    return 'text-green-600 bg-green-100 dark:bg-green-900/30';
      case 'partial': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30';
      case 'overdue': return 'text-red-600 bg-red-100 dark:bg-red-900/30';
      default:        return 'text-gray-600 bg-gray-100 dark:bg-gray-900/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':    return <CheckCircle className="w-3 h-3" />;
      case 'overdue': return <AlertCircle className="w-3 h-3" />;
      default:        return <Clock className="w-3 h-3" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                💳 {t('finance.fees')}
              </h1>
              <NewBadge size="sm" animated />
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              {pagination.total} fee items • {format(totalBalance)} outstanding
            </p>
          </div>

          <div className="flex gap-3">
            <button onClick={() => router.push('/finance/import')} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              <Upload className="w-4 h-4" />
              Import Fees
            </button>
            <button onClick={() => setModalItem(null)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="w-4 h-4" />
              Add Fee Item
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Fees</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{format(totalAmount)}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Paid</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{format(totalPaid)}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Outstanding</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{format(totalBalance)}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                <Clock className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Overdue</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{overdueCount}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg mb-8">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex space-x-8 px-6">
              {[
                { key: 'students', label: 'Student Fees', icon: Users },
                { key: 'structure', label: 'Fee Structure', icon: CreditCard },
                { key: 'templates', label: 'Templates', icon: Eye }
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'students' && (
              <div className="space-y-6">
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search students..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="partial">Partial</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                    <option value="waived">Waived</option>
                  </select>

                  <select
                    value={classFilter}
                    onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
                    className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Classes</option>
                    {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>

                  <select
                    value={termFilter}
                    onChange={(e) => { setTermFilter(e.target.value); setPage(1); }}
                    className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Terms</option>
                    {terms.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>

                  <button onClick={clearFilters} className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                    Clear Filters
                  </button>
                </div>

                {/* Fee Items Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-slate-700">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fee Item</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {isLoading ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center">
                            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                            <p className="text-gray-500">Loading fee items...</p>
                          </td>
                        </tr>
                      ) : feeItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center">
                            <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500">No fee items found</p>
                          </td>
                        </tr>
                      ) : (
                        feeItems.map((item) => (
                          <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                            <td className="px-6 py-4">
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">{item.student_name}</div>
                                <div className="text-xs text-gray-500">{item.admission_no} • {item.class_name}</div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900 dark:text-white">{item.item}</div>
                              <div className="text-xs text-gray-500">{item.term_name}</div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{format(item.amount)}</td>
                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{format(item.paid)}</td>
                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{format(item.balance)}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                                {getStatusIcon(item.status)}
                                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <button onClick={() => setModalItem(item)} className="p-1 rounded text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDelete(item)} className="p-1 rounded text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {pagination.total > pagination.limit && (
                  <Pagination
                    currentPage={pagination.page}
                    totalPages={pagination.pages}
                    onPageChange={setPage}
                    totalItems={pagination.total}
                    itemsPerPage={pagination.limit}
                  />
                )}
              </div>
            )}

            {activeTab === 'structure' && (
              <div className="text-center py-12">
                <CreditCard className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Fee structure management coming soon</p>
              </div>
            )}

            {activeTab === 'templates' && (
              <div className="text-center py-12">
                <Eye className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Fee templates management coming soon</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {modalItem !== undefined && (
        <FeeItemModal
          item={modalItem}
          onClose={() => setModalItem(undefined)}
          onSaved={() => { setModalItem(undefined); mutate(); }}
        />
      )}
    </div>
  );
};

export default FeesPage;
