"use client";
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Calendar, Weight, AlertCircle } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { showToast } from '@/lib/toast';

interface ResultType {
  id: number;
  school_id: number;
  name: string;
  code: string;
  description?: string;
  weight: number;
  status: string;
  deadline?: string;
  created_at: string;
  updated_at?: string;
}

export default function ResultTypesManager() {
  const { t, digits, formatDate } = useI18n();
  const [resultTypes, setResultTypes] = useState<ResultType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    weight: '',
    deadline: ''
  });

  useEffect(() => {
    fetchResultTypes();
  }, []);

  const fetchResultTypes = async () => {
    try {
      const response = await fetch('/api/result_types');
      const data = await response.json();
      if (data.success) {
        setResultTypes(Array.isArray(data.data) ? data.data : []);
      }
    } catch (error) {
      console.error('Error fetching result types:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingId ? `/api/result_types/${editingId}` : '/api/result_types';
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          weight: parseFloat(formData.weight) || 0,
          school_id: 1
        }),
      });

      if (response.ok) {
        await fetchResultTypes();
        resetForm();
      } else {
        showToast('error', t('academicsPages.results.rt.saveFailed', "The result type could not be saved."));
      }
    } catch (error) {
      console.error('Error saving result type:', error);
      showToast('error', t('academicsPages.results.rt.saveFailed', "The result type could not be saved."));
    }
  };

  const handleEdit = (resultType: ResultType) => {
    setEditingId(resultType.id);
    setFormData({
      name: resultType.name,
      code: resultType.code,
      description: resultType.description || '',
      weight: resultType.weight.toString(),
      deadline: resultType.deadline || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm(t('academicsPages.results.rt.confirmDelete', "Are you sure you want to delete this result type?"))) {
      try {
        const response = await fetch(`/api/result_types/${id}`, {
          method: 'DELETE',
        });
        if (response.ok) {
          await fetchResultTypes();
        } else {
          showToast('error', t('academicsPages.results.rt.deleteFailed', "The result type could not be deleted."));
        }
      } catch (error) {
        console.error('Error deleting result type:', error);
        showToast('error', t('academicsPages.results.rt.deleteFailed', "The result type could not be deleted."));
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      description: '',
      weight: '',
      deadline: ''
    });
    setEditingId(null);
    setShowForm(false);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">{t('academicsPages.results.rt.loading', "Loading...")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">{t('academicsPages.results.rt.title', "Result Types Management")}</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t('academicsPages.results.rt.add', "Add Result Type")}
        </button>
      </div>

      {showForm && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t('academicsPages.results.rt.name', "Name")}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('academicsPages.results.rt.code', "Code")}</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('academicsPages.results.rt.weightPct', "Weight (%)")}</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('academicsPages.results.rt.deadline', "Deadline")}</label>
                <input
                  type="datetime-local"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t('academicsPages.results.rt.description', "Description")}</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full p-2 border rounded-lg"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg"
              >
                {editingId ? t('academicsPages.results.rt.update', "Update") : t('academicsPages.results.rt.create', "Create")}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg"
              >
                {t('academicsPages.results.rt.cancel', "Cancel")}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-start">{t('academicsPages.results.rt.name', "Name")}</th>
              <th className="px-4 py-3 text-start">{t('academicsPages.results.rt.code', "Code")}</th>
              <th className="px-4 py-3 text-start">{t('academicsPages.results.rt.weight', "Weight")}</th>
              <th className="px-4 py-3 text-start">{t('academicsPages.results.rt.deadline', "Deadline")}</th>
              <th className="px-4 py-3 text-start">{t('academicsPages.results.rt.status', "Status")}</th>
              <th className="px-4 py-3 text-start">{t('academicsPages.results.rt.actions', "Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {resultTypes.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">{t('academicsPages.results.rt.none', "No result types yet.")}</td></tr>
            )}
            {resultTypes.map((resultType) => (
              <tr key={resultType.id} className="border-b border-gray-200 dark:border-gray-700">
                <td className="px-4 py-3">{resultType.name}</td>
                <td className="px-4 py-3">{resultType.code}</td>
                <td className="px-4 py-3 flex items-center gap-1">
                  <Weight className="w-4 h-4" />
                  {digits(`${resultType.weight}%`)}
                </td>
                <td className="px-4 py-3">
                  {resultType.deadline ? (
                    <div className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {formatDate(new Date(resultType.deadline), 'medium')}
                    </div>
                  ) : (
                    <span className="text-gray-400">{t('academicsPages.results.rt.noDeadline', "No deadline")}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    resultType.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {resultType.status === 'active' || resultType.status === 'inactive' ? t(`academicsPages.results.rt.st.${resultType.status}`, resultType.status) : resultType.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(resultType)}
                      title={t('academicsPages.results.rt.edit', "Edit")} aria-label={t('academicsPages.results.rt.edit', "Edit")}
                      className="text-blue-500 hover:text-blue-700"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(resultType.id)}
                      title={t('academicsPages.results.rt.delete', "Delete")} aria-label={t('academicsPages.results.rt.delete', "Delete")}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}