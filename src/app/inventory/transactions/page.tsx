"use client";
import React, { useState } from "react";
import useSWR from "swr";
import { Plus, Trash } from "lucide-react";
import { confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';
import clsx from "clsx";

const API_BASE = "/api/inventory";

const TransactionsPage: React.FC = () => {
  const { data: transactionsData, mutate: mutateTransactions } = useSWR(`${API_BASE}/transactions`);
  const transactions = transactionsData?.data || [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ item_id: "", tx_type: "", quantity: "", reference: "" });

  const handleDelete = async (id: number) => {
    const confirmed = await confirmAction(
      'Are you sure?',
      'You are about to delete this transaction. This action cannot be undone!',
      'Yes, delete it!'
    );

    if (confirmed) {
      try {
        await apiFetch(`${API_BASE}/transactions/${id}`, {
          method: "DELETE",
          successMessage: 'Transaction has been deleted.',
        });
        mutateTransactions();
      } catch (error) {
        // apiFetch already showed error toast
      }
    }
  };

  const handleAddTransaction = async () => {
    try {
      await apiFetch(`${API_BASE}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
        successMessage: 'Transaction added successfully.',
      });
      mutateTransactions();
      setIsModalOpen(false);
      setFormData({ item_id: "", tx_type: "", quantity: "", reference: "" });
    } catch (error) {
      // apiFetch already showed error toast
    }
  };

  return (
    <div className="space-y-4 mx-20">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Store Transactions</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Transaction
        </button>
      </div>
      <table className="w-full border border-gray-300 dark:border-gray-700 rounded-lg">
        <thead className="bg-gray-100 dark:bg-gray-800">
          <tr>
            <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">ID</th>
            <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Item ID</th>
            <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Type</th>
            <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Quantity</th>
            <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Reference</th>
            <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Actions</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{transaction.id}</td>
              <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{transaction.item_id}</td>
              <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{transaction.tx_type}</td>
              <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{transaction.quantity}</td>
              <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{transaction.reference || "N/A"}</td>
              <td className="px-4 py-2 flex gap-2">
                <button
                  onClick={() => handleDelete(transaction.id)}
                  className="px-2 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  <Trash className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isModalOpen && (
        <div className="fixed inset-0 bg-white/30 dark:bg-gray-900/30 backdrop-blur-md flex items-center justify-center">
          <div className="bg-white/70 dark:bg-gray-800/70 p-6 rounded-lg shadow-lg w-96 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold mb-4">Add Transaction</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Item ID</label>
              <input
                type="text"
                value={formData.item_id}
                onChange={(e) => setFormData({ ...formData, item_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Type</label>
              <input
                type="text"
                value={formData.tx_type}
                onChange={(e) => setFormData({ ...formData, tx_type: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTransaction}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransactionsPage;
             