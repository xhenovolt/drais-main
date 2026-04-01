"use client";
import React, { useState } from "react";
import useSWR from "swr";
import { Plus, Trash } from "lucide-react";
import { showToast, confirmAction } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const API_BASE = "/api/inventory";

const ItemsPage: React.FC = () => {
  const { data: itemsData, mutate: mutateItems } = useSWR(`${API_BASE}/items`);
  const { data: storesData } = useSWR(`${API_BASE}/stores`); // Fetch stores for the dropdown
  const items = itemsData?.data || [];
  const stores = storesData?.data || [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    store_id: "",
    name: "",
    unit: "",
    capacity: "",
    reorder_level: "",
  });

  console.log("Stores Data:", storesData); // Debug log for stores data

  const handleDelete = async (id: number) => {
    const confirmed = await confirmAction(
      'Are you sure?',
      'You are about to delete this item. This action cannot be undone!',
      'Yes, delete it!'
    );

    if (confirmed) {
      try {
        await apiFetch(`${API_BASE}/items/${id}`, {
          method: "DELETE",
          successMessage: 'Item has been deleted.',
        });
        mutateItems();
      } catch (error) {
        // apiFetch already showed error toast
      }
    }
  };

  const handleAddItem = async () => {
    try {
      await apiFetch(`${API_BASE}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
        successMessage: 'Item added successfully.',
      });
      mutateItems();
      setIsModalOpen(false);
      setFormData({
        store_id: "",
        name: "",
        unit: "",
        capacity: "",
        reorder_level: "",
      });
    } catch (error) {
      // apiFetch already showed error toast
    }
  };

  return (
    <div className="space-y-4 mx-20">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Store Items</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Item
        </button>
      </div>
      <table className="w-full border border-gray-300 dark:border-gray-700 rounded-lg">
        <thead className="bg-gray-100 dark:bg-gray-800">
          <tr>
            <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">ID</th>
            <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Store</th>
            <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Name</th>
            <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Unit</th>
            <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Capacity</th>
            <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Reorder Level</th>
            <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{item.id}</td>
              <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                {stores.find((store) => store.id === item.store_id)?.name || "N/A"}
              </td>
              <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{item.name}</td>
              <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{item.unit || "N/A"}</td>
              <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{item.capacity || "N/A"}</td>
              <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{item.reorder_level || "N/A"}</td>
              <td className="px-4 py-2 flex gap-2">
                <button
                  onClick={() => handleDelete(item.id)}
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
            <h3 className="text-lg font-bold mb-4">Add Item</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Store</label>
              <select
                value={formData.store_id}
                onChange={(e) => setFormData({ ...formData, store_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Select a store</option>
                {stores.length === 0 ? (
                  <option value="">No stores available</option>
                ) : (
                  stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))
                )}
              </select>
            </div>
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
              <label className="block text-sm font-medium mb-1">Unit</label>
              <input
                type="text"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Capacity</label>
              <input
                type="number"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Reorder Level</label>
              <input
                type="number"
                value={formData.reorder_level}
                onChange={(e) => setFormData({ ...formData, reorder_level: e.target.value })}
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
                onClick={handleAddItem}
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

export default ItemsPage;
