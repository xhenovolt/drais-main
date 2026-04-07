"use client";
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, 
  Plus, 
  Search, 
  Eye, 
  Edit, 
  Trash2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  MoreVertical,
  CreditCard,
  Building,
  AlertCircle
} from 'lucide-react';
import useSWR from 'swr';
import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch, swrFetcher } from '@/lib/apiClient';
import NewBadge from '@/components/ui/NewBadge';
import WalletModal from '@/components/finance/WalletModal';

interface WalletData {
  id: number;
  name: string;
  method: string;
  currency: string;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
  account_number?: string;
  bank_name?: string;
  branch_name?: string;
  transaction_count: number;
  total_credits: number;
  total_debits: number;
  created_at: string;
}

const WalletsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');

  // Fetch wallets
  const { data: walletsData, isLoading, mutate } = useSWR(
    '/api/finance/wallets',
    swrFetcher,
    { refreshInterval: 30000 }
  );

  const wallets: WalletData[] = walletsData?.data || [];

  // Filter wallets based on search
  const filteredWallets = wallets.filter(wallet =>
    !searchQuery || 
    wallet.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    wallet.method.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate totals
  const totalBalance = wallets.reduce((sum, wallet) => sum + wallet.current_balance, 0);
  const activeWallets = wallets.filter(w => w.is_active).length;
  const totalTransactions = wallets.reduce((sum, wallet) => sum + wallet.transaction_count, 0);

  const getMethodIcon = (method: string) => {
    switch (method.toLowerCase()) {
      case 'bank':
      case 'bank_transfer':
        return <Building className="w-5 h-5" />;
      case 'card':
      case 'visa':
      case 'mastercard':
        return <CreditCard className="w-5 h-5" />;
      case 'cash':
        return <DollarSign className="w-5 h-5" />;
      default:
        return <Wallet className="w-5 h-5" />;
    }
  };

  const handleViewLedger = (wallet: WalletData) => {
    // Open ledger in drawer/modal
    setSelectedWallet(wallet);
  };

  const handleAddWallet = () => {
    setSelectedWallet(null);
    setModalMode('add');
    setShowWalletModal(true);
  };

  const handleEditWallet = (wallet: WalletData) => {
    setSelectedWallet(wallet);
    setModalMode('edit');
    setShowWalletModal(true);
  };

  const handleDeleteWallet = async (wallet: WalletData) => {
    if (!await confirmAction(`Delete ${wallet.name}?`, 'This action cannot be undone.', 'Delete')) return;

    try {
      await apiFetch(`/api/finance/wallets/${wallet.id}`, {
        method: 'DELETE',
        successMessage: 'Wallet deleted successfully',
      });
      mutate();
    } catch (error) {
      // apiFetch already showed error toast
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
                💰 Wallets
              </h1>
              <NewBadge size="sm" animated />
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              {activeWallets} active wallets • {totalTransactions} total transactions
            </p>
          </div>
          
          <button
            onClick={handleAddWallet}
            className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all duration-200"
          >
            <Plus className="w-5 h-5" />
            Add Wallet
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Balance
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  UGX {totalBalance.toLocaleString()}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Active Wallets
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {activeWallets}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                <Wallet className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Transactions
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {totalTransactions}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Search */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search wallets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Wallets Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-500 dark:text-gray-400">Loading wallets...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AnimatePresence>
              {filteredWallets.map((wallet, index) => (
                <motion.div
                  key={wallet.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white">
                        {getMethodIcon(wallet.method)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {wallet.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                          {wallet.method.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                    
                    {!wallet.is_active && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">
                        <AlertCircle className="w-3 h-3" />
                        Inactive
                      </div>
                    )}
                  </div>

                  {/* Balance */}
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Current Balance</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {wallet.currency} {wallet.current_balance.toLocaleString()}
                    </p>
                    {wallet.current_balance !== wallet.opening_balance && (
                      <div className="flex items-center gap-1 mt-1">
                        {wallet.current_balance > wallet.opening_balance ? (
                          <TrendingUp className="w-4 h-4 text-green-500" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-500" />
                        )}
                        <span className="text-sm text-gray-500">
                          from {wallet.currency} {wallet.opening_balance.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center p-2 bg-gray-50 dark:bg-slate-700 rounded-lg">
                      <div className="text-sm font-bold text-gray-900 dark:text-white">
                        {wallet.transaction_count}
                      </div>
                      <div className="text-xs text-gray-500">Transactions</div>
                    </div>
                    <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="text-sm font-bold text-green-600">
                        {wallet.currency} {wallet.total_credits.toLocaleString()}
                      </div>
                      <div className="text-xs text-green-600">Credits</div>
                    </div>
                    <div className="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <div className="text-sm font-bold text-red-600">
                        {wallet.currency} {wallet.total_debits.toLocaleString()}
                      </div>
                      <div className="text-xs text-red-600">Debits</div>
                    </div>
                  </div>

                  {/* Account Info */}
                  {(wallet.account_number || wallet.bank_name) && (
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      {wallet.bank_name && (
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          {wallet.bank_name}
                        </p>
                      )}
                      {wallet.account_number && (
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          Account: {wallet.account_number}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleViewLedger(wallet)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      View Ledger
                    </button>
                    <button 
                      onClick={() => handleEditWallet(wallet)}
                      className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDeleteWallet(wallet)}
                      className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredWallets.length === 0 && (
              <div className="col-span-full text-center py-12">
                <Wallet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No wallets found</p>
              </div>
            )}
          </div>
        )}

        {/* Wallet Modal */}
        <WalletModal
          open={showWalletModal}
          onClose={() => setShowWalletModal(false)}
          onSubmit={() => mutate()}
          mode={modalMode}
          initialData={selectedWallet}
        />
      </div>
    </div>
  );
};

export default WalletsPage;