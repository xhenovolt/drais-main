"use client";
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  DollarSign, 
  TrendingUp, 
  AlertCircle, 
  Wallet,
  CreditCard,
  PieChart as PieChartIcon,
  Calculator
} from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Area, AreaChart } from 'recharts';
import DashboardCard from '@/components/dashboard/DashboardCard';
import LoadingPlaceholder from '@/components/dashboard/LoadingPlaceholder';

interface FinanceData {
  feeCollectionSummary: any[];
  paymentTrends: any[];
  outstandingBalances: any[];
  incomeExpenses: any[];
  walletBalances: any[];
}

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4'];

export default function FinanceAnalytics({ schoolId, termId }: { 
  schoolId: string; 
  termId?: string; 
}) {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [schoolId, termId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ school_id: schoolId });
      if (termId) params.append('term_id', termId);
      
      const response = await fetch(`/api/analytics/finance?${params}`);
      const result = await response.json();
      
      if (result.success) {
        // The API's five array fields are trusted as arrays here; guard
        // against any future partial/malformed response so a bad shape
        // shows "no data" instead of crashing every .map/.reduce below.
        const d = result.data || {};
        setData({
          feeCollectionSummary: Array.isArray(d.feeCollectionSummary) ? d.feeCollectionSummary : [],
          paymentTrends: Array.isArray(d.paymentTrends) ? d.paymentTrends : [],
          outstandingBalances: Array.isArray(d.outstandingBalances) ? d.outstandingBalances : [],
          incomeExpenses: Array.isArray(d.incomeExpenses) ? d.incomeExpenses : [],
          walletBalances: Array.isArray(d.walletBalances) ? d.walletBalances : [],
        });
      } else {
        setError(result.error || 'Failed to fetch data');
      }
    } catch (err) {
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingPlaceholder />;
  if (error) return <div className="text-red-500 p-4">Error: {error}</div>;
  if (!data) return <div className="p-4">No data available</div>;

  // Calculate totals
  const totalExpected = data.feeCollectionSummary.reduce((sum, item) => sum + parseFloat(item.total_expected || 0), 0);
  const totalCollected = data.feeCollectionSummary.reduce((sum, item) => sum + parseFloat(item.total_collected || 0), 0);
  const totalOutstanding = data.feeCollectionSummary.reduce((sum, item) => sum + parseFloat(item.total_outstanding || 0), 0);
  const collectionRate = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;

  // Process data for charts
  const paymentTrendData = data.paymentTrends.map(item => ({
    date: new Date(item.payment_date).toLocaleDateString(),
    amount: parseFloat(item.daily_collection),
    transactions: parseInt(item.transaction_count)
  })).reverse();

  const classCollectionData = data.feeCollectionSummary.map(item => ({
    class: item.class_name,
    collected: parseFloat(item.total_collected || 0),
    outstanding: parseFloat(item.total_outstanding || 0),
    rate: parseFloat(item.avg_payment_rate || 0)
  }));

  const incomeExpenseData = data.incomeExpenses.map(item => ({
    category: item.category_name,
    income: parseFloat(item.income),
    expenses: parseFloat(item.expenses),
    net: parseFloat(item.income) - parseFloat(item.expenses)
  }));

  return (
    <div className="space-y-6">
      {/* Financial KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm">Total Collected</p>
              <p className="text-2xl font-bold">UGX {totalCollected.toLocaleString()}</p>
              <p className="text-xs text-green-200">{collectionRate.toFixed(1)}% collection rate</p>
            </div>
            <DollarSign className="w-8 h-8 text-green-200" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm">Outstanding</p>
              <p className="text-2xl font-bold">UGX {totalOutstanding.toLocaleString()}</p>
              <p className="text-xs text-red-200">{data.outstandingBalances.length} students</p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-200" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">Expected Revenue</p>
              <p className="text-2xl font-bold">UGX {totalExpected.toLocaleString()}</p>
              <p className="text-xs text-blue-200">This term</p>
            </div>
            <Calculator className="w-8 h-8 text-blue-200" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm">Active Wallets</p>
              <p className="text-2xl font-bold">{data.walletBalances.length}</p>
              <p className="text-xs text-purple-200">Payment methods</p>
            </div>
            <Wallet className="w-8 h-8 text-purple-200" />
          </div>
        </motion.div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Trends */}
        <DashboardCard title="Daily Payment Trends (Last 30 Days)">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={paymentTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip 
                  formatter={(value, name) => [
                    name === 'amount' ? `UGX ${parseFloat(value).toLocaleString()}` : value,
                    name === 'amount' ? 'Daily Collection' : 'Transactions'
                  ]}
                />
                <Area type="monotone" dataKey="amount" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>

        {/* Collection by Class */}
        <DashboardCard title="Fee Collection by Class">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classCollectionData} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="class" type="category" width={80} />
                <Tooltip 
                  formatter={(value, name) => [
                    `UGX ${parseFloat(value).toLocaleString()}`,
                    name === 'collected' ? 'Collected' : 'Outstanding'
                  ]}
                />
                <Bar dataKey="collected" fill="#10b981" name="collected" />
                <Bar dataKey="outstanding" fill="#ef4444" name="outstanding" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>

        {/* Income vs Expenses */}
        <DashboardCard title="Income vs Expenses by Category">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={incomeExpenseData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip 
                  formatter={(value, name) => [
                    `UGX ${parseFloat(value).toLocaleString()}`,
                    name.charAt(0).toUpperCase() + name.slice(1)
                  ]}
                />
                <Bar dataKey="income" fill="#10b981" name="income" />
                <Bar dataKey="expenses" fill="#ef4444" name="expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>

        {/* Wallet Balances */}
        <DashboardCard title="Wallet Balances">
          <div className="space-y-4">
            {data.walletBalances.map((wallet, index) => (
              <motion.div
                key={wallet.wallet_name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {wallet.wallet_name}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {wallet.method} • {wallet.transaction_count} transactions
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    UGX {parseFloat(wallet.net_balance).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">
                    {wallet.last_transaction_date ? 
                      new Date(wallet.last_transaction_date).toLocaleDateString() : 
                      'No transactions'
                    }
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </DashboardCard>
      </div>

      {/* Outstanding Balances Table */}
      <DashboardCard title="Top Outstanding Balances">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Student</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Class</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Balance</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Last Payment</th>
                <th className="text-left py-3 px-4 font-medium text-gray-700 dark:text-gray-300">Days Overdue</th>
              </tr>
            </thead>
            <tbody>
              {data.outstandingBalances.slice(0, 10).map((student, index) => (
                <motion.tr
                  key={student.student_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <td className="py-3 px-4">
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {student.student_name}
                      </p>
                      <p className="text-sm text-gray-500">{student.admission_no}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                    {student.class_name}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-bold text-red-600 dark:text-red-400">
                      UGX {parseFloat(student.total_balance).toLocaleString()}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                    {student.last_payment_date ? 
                      new Date(student.last_payment_date).toLocaleDateString() : 
                      'Never'
                    }
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      student.days_since_payment > 30 ? 
                        'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' : 
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                      {student.days_since_payment || 0} days
                    </span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardCard>
    </div>
  );
}
