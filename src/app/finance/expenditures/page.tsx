"use client";
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Edit, Trash2, DollarSign, TrendingUp, CheckCircle, Clock, XCircle } from 'lucide-react';
import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';
import NewBadge from '@/components/ui/NewBadge';

interface Expenditure {
  id: number;
  category_id: number;
  category_name: string;
  wallet_id: number;
  wallet_name: string;
  amount: number;
  description: string;
  vendor_name: string;
  vendor_contact: string;
  invoice_number: string;
  expense_date: string;
  status: string;
  approved_by: number;
  approved_at: string;
  created_at: string;
}

export default function ExpendituresPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    category_id: '', amount: '', description: '', vendor_name: '', vendor_contact: '', invoice_number: '', expense_date: ''
  });
  const [expenditures, setExpenditures] = useState<{ data: Expenditure[], summary: any } | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const url = `/api/finance/expenditures?${categoryFilter ? `category_id=${categoryFilter}` : ''}${statusFilter ? `&status=${statusFilter}` : ''}${searchQuery ? `&search=${searchQuery}` : ''}`;
      const response = await apiFetch<{ data: Expenditure[], summary: any }>(url, { silent: true });
      setExpenditures(response);
    } catch (error) {
      showToast('error', 'Failed to load expenditures');
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => { loadData(); }, [categoryFilter, statusFilter]);

  const entries = expenditures?.data || [];
  const summary = expenditures?.summary || {};

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/finance/expenditures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, amount: parseFloat(formData.amount) }),
        successMessage: 'Expenditure added successfully',
      });
      setShowModal(false);
      setFormData({ category_id: '', amount: '', description: '', vendor_name: '', vendor_contact: '', invoice_number: '', expense_date: '' });
      loadData();
    } catch (error) {
      // apiFetch already showed error toast
    }
  };

  const handleDelete = async (id: number) => {
    if (!await confirmAction('Delete expenditure?', 'This action cannot be undone.', 'Delete')) return;
    try {
      await apiFetch(`/api/finance/expenditures?id=${id}`, {
        method: 'DELETE',
        successMessage: 'Expenditure deleted',
      });
      loadData();
    } catch (error) {
      // apiFetch already showed error toast
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'text-green-600 bg-green-100';
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'paid': return 'text-blue-600 bg-blue-100';
      case 'cancelled': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">💰 Expenditures</h1>
              <NewBadge size="sm" animated />
            </div>
            <p className="text-gray-600 dark:text-gray-400">{entries.length} transactions • UGX {Number(summary.total_amount || 0).toLocaleString()} total</p>
          </div>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
            <Plus className="w-4 h-4" />Add Expenditure
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 mb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Expenditure</p><p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">UGX {Number(summary.total_amount || 0).toLocaleString()}</p></div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center"><DollarSign className="w-6 h-6 text-white" /></div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-gray-600 dark:text-gray-400">Approved</p><p className="text-2xl font-bold text-green-600 mt-1">UGX {Number(summary.approved_amount || 0).toLocaleString()}</p></div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center"><CheckCircle className="w-6 h-6 text-white" /></div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pending</p><p className="text-2xl font-bold text-yellow-600 mt-1">UGX {Number(summary.pending_amount || 0).toLocaleString()}</p></div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center"><Clock className="w-6 h-6 text-white" /></div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-gray-600 dark:text-gray-400">Transactions</p><p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{summary.total_count || 0}</p></div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center"><TrendingUp className="w-6 h-6 text-white" /></div>
            </div>
          </motion.div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg mb-8 p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg" />
            </div>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg"><option value="">All Categories</option></select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg"><option value="">All Status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="paid">Paid</option></select>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-4 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {isLoading ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div><p className="text-gray-500">Loading...</p></td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center"><DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" /><p className="text-gray-500">No expenditures found</p></td></tr>
              ) : entries.map((item, index) => (
                <motion.tr key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.02 }} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{item.expense_date}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{item.category_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{item.description}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{item.vendor_name || '-'}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white text-right">UGX {Number(item.amount).toLocaleString()}</td>
                  <td className="px-6 py-4 text-center"><span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>{item.status}</span></td>
                  <td className="px-6 py-4"><div className="flex items-center justify-center gap-2">
                    <button className="p-2 rounded text-blue-600 hover:bg-blue-50"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(item.id)} className="p-2 rounded text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                  </div></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add Expenditure</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Category</label><select required value={formData.category_id} onChange={(e) => setFormData({ ...formData, category_id: e.target.value })} className="w-full px-4 py-2 border rounded-lg"><option value="">Select Category</option></select></div>
              <div><label className="block text-sm font-medium mb-1">Amount (UGX)</label><input type="number" required value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="w-full px-4 py-2 border rounded-lg" /></div>
              <div><label className="block text-sm font-medium mb-1">Description</label><textarea required value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-4 py-2 border rounded-lg" /></div>
              <div><label className="block text-sm font-medium mb-1">Vendor Name</label><input type="text" value={formData.vendor_name} onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })} className="w-full px-4 py-2 border rounded-lg" /></div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Add</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
