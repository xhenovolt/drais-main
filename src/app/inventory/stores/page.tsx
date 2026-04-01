"use client";
import React, { useState } from "react";
import useSWR from "swr";
import { Plus, Trash, Eye } from "lucide-react";
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const API_BASE = "/api/inventory";

const StoresPage: React.FC = () => {
  const { data: storesData, error, isLoading, mutate: mutateStores } = useSWR(`${API_BASE}/stores`);
  const stores = storesData?.data || [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", location: "" });

  const handleAddStore = async () => {
    try {
      await apiFetch(`${API_BASE}/stores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
        successMessage: 'Store added successfully.',
      });
      mutateStores();
      setIsModalOpen(false);
      setFormData({ name: "", location: "" });
    } catch (error) {
      // apiFetch already showed error toast
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error loading stores. Please try again later.</div>;
  }

  return (
    <div className="space-y-4 mx-20">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Stores</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Store
        </button>
      </div>
      <table className="w-full border border-gray-300 dark:border-gray-700 rounded-lg">
        <thead className="bg-gray-100 dark:bg-gray-800">
          <tr>
            <th className="px-4 py-2">ID</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Location</th>
            <th className="px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((store) => (
            <tr key={store.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="px-4 py-2">{store.id}</td>
              <td className="px-4 py-2">{store.name}</td>
              <td className="px-4 py-2">{store.location || "N/A"}</td>
              <td className="px-4 py-2 flex gap-2">
                <button className="px-2 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600">
                  <Eye className="w-4 h-4" />
                </button>
                <button
                  onClick={() => showToast('info', 'Delete functionality not implemented')}
                  className="px-2 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600"
                >
                  <Trash className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Add Store Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-white/30 dark:bg-gray-900/30 backdrop-blur-md flex items-center justify-center">
          <div className="bg-white/70 dark:bg-gray-800/70 p-6 rounded-lg shadow-lg w-96 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-bold mb-4">Add Store</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
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
                onClick={handleAddStore}
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

export default StoresPage;
