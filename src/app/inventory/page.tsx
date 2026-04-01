"use client";
import React, { useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { Plus, Edit, Trash, Eye } from "lucide-react";
import { confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const API_BASE = "/api/inventory";

const TABS = ["Stores", "Store Items", "Store Transactions"];

const InventoryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState(TABS[0]); // Default to "Stores"
  const [selectedStore, setSelectedStore] = useState<number | null>(null);

  // Fetch data for each tab
  const { data: storesData, mutate: mutateStores } = useSWR(`${API_BASE}/stores`);
  const { data: itemsData, mutate: mutateItems } = useSWR(
    selectedStore ? `${API_BASE}/items?store_id=${selectedStore}` : null
  );
  const { data: transactionsData, mutate: mutateTransactions } = useSWR(
    selectedStore ? `${API_BASE}/transactions?store_id=${selectedStore}` : null
  );

  const stores = storesData?.data || [];
  const items = itemsData?.data || [];
  const transactions = transactionsData?.data || [];

  const handleDelete = async (id: number, type: "store" | "item" | "transaction") => {
    const confirmed = await confirmAction(
      'Are you sure?',
      `You are about to delete this ${type}. This action cannot be undone!`,
      'Yes, delete it!'
    );

    if (confirmed) {
      try {
        await apiFetch(`${API_BASE}/${type}s/${id}`, {
          method: "DELETE",
          successMessage: `${type} has been deleted.`,
        });
        if (type === "store") mutateStores();
        if (type === "item") mutateItems();
        if (type === "transaction") mutateTransactions();
      } catch (error) {
        // apiFetch already showed error toast
      }
    }
  };

  return (
    <div className="space-y-4 mx-20">
      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-300">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              "px-4 py-2 font-semibold",
              activeTab === tab
                ? "border-b-4 border-blue-500 text-blue-500"
                : "text-gray-500 hover:text-blue-500"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Stores" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Stores</h2>
            <button className="px-4 py-2 bg-blue-500 text-white rounded-lg flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Store
            </button>
          </div>
          <table className="w-full border border-gray-300 rounded-lg">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Location</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => (
                <tr key={store.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{store.id}</td>
                  <td className="px-4 py-2">{store.name}</td>
                  <td className="px-4 py-2">{store.location || "N/A"}</td>
                  <td className="px-4 py-2 flex gap-2">
                    <button
                      onClick={() => setSelectedStore(store.id)}
                      className="px-2 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(store.id, "store")}
                      className="px-2 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "Store Items" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Store Items</h2>
            <button className="px-4 py-2 bg-blue-500 text-white rounded-lg flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Item
            </button>
          </div>
          <table className="w-full border border-gray-300 rounded-lg">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Unit</th>
                <th className="px-4 py-2">Capacity</th>
                <th className="px-4 py-2">Reorder Level</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{item.id}</td>
                  <td className="px-4 py-2">{item.name}</td>
                  <td className="px-4 py-2">{item.unit || "N/A"}</td>
                  <td className="px-4 py-2">{item.capacity || "N/A"}</td>
                  <td className="px-4 py-2">{item.reorder_level || "N/A"}</td>
                  <td className="px-4 py-2 flex gap-2">
                    <button
                      onClick={() => handleDelete(item.id, "item")}
                      className="px-2 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "Store Transactions" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Store Transactions</h2>
            <button className="px-4 py-2 bg-blue-500 text-white rounded-lg flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Transaction
            </button>
          </div>
          <table className="w-full border border-gray-300 rounded-lg">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Item ID</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Quantity</th>
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{transaction.id}</td>
                  <td className="px-4 py-2">{transaction.item_id}</td>
                  <td className="px-4 py-2">{transaction.tx_type}</td>
                  <td className="px-4 py-2">{transaction.quantity}</td>
                  <td className="px-4 py-2">{transaction.reference || "N/A"}</td>
                  <td className="px-4 py-2 flex gap-2">
                    <button
                      onClick={() => handleDelete(transaction.id, "transaction")}
                      className="px-2 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default InventoryPage;
