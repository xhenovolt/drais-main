"use client";

import React, { useState } from 'react';
import { apiErrorMessage } from '@/lib/errorMessage';
import useSWR from 'swr';
import { Plus, Edit, Trash, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';

const API_PAYROLL_DEFINITIONS = '/api/payroll_definitions';
const fetcher = (url: string) => fetch(url).then((res) => res.json());

type PayrollDefinition = {
  id: number;
  name: string;
  type: string;
};

export default function PayrollDefinitionsPage() {
  const { data, error, mutate } = useSWR<PayrollDefinition[]>(API_PAYROLL_DEFINITIONS, fetcher);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<PayrollDefinition>>({ id: undefined, name: '', type: '' });
  const [saveError, setSaveError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const method = form.id ? 'PUT' : 'POST';
    try {
      // The response was never checked: a rejected save closed the dialog and
      // looked exactly like a successful one, so definitions appeared
      // impossible to add when in fact the failure was simply never shown.
      const res = await fetch(API_PAYROLL_DEFINITIONS, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || j?.error) {
        setSaveError(apiErrorMessage(j, `Could not save (${res.status}).`));
        return;
      }
      setSaveError('');
      mutate();
      setModalOpen(false);
    } catch (error) {
      setSaveError('Could not reach the server.');
      console.error('Failed to save payroll definition:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    const confirm = await Swal.fire({
      title: 'Are you sure?',
      text: 'This action cannot be undone!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete it!',
    });

    if (confirm.isConfirmed) {
      try {
        await fetch(API_PAYROLL_DEFINITIONS, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        mutate();
        Swal.fire('Deleted!', 'The payroll definition has been deleted.', 'success');
      } catch (error) {
        Swal.fire('Error!', 'Failed to delete the payroll definition.', 'error');
      }
    }
  };

  if (error) return <div>Error loading payroll definitions.</div>;
  if (!data) return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4 mx-20">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Payroll Definitions</h1>
        <button
          onClick={() => {
            setForm({ id: undefined, name: '', type: '' });
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white text-sm font-semibold shadow-lg hover:scale-105 transition-transform"
        >
          <Plus className="w-4 h-4" /> Add Definition
        </button>
      </div>

      <div className="rounded-2xl overflow-hidden border border-blue-200 backdrop-blur bg-gradient-to-br from-white/80 via-blue-50/60 to-pink-50/60 shadow-2xl">
        <table className="w-full text-sm">
          <thead className="text-left bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white">
            <tr>
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold">Type</th>
              <th className="px-4 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((def) => (
              <tr
                key={def.id}
                className="hover:bg-gradient-to-r hover:from-blue-100 hover:via-pink-100 hover:to-indigo-100 transition-colors"
              >
                <td className="px-4 py-2">{def.name}</td>
                <td className="px-4 py-2">{def.type}</td>
                <td className="px-4 py-2 flex gap-2">
                  <button
                    onClick={() => {
                      setForm(def);
                      setModalOpen(true);
                    }}
                    className="px-2 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(def.id)}
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

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur" onClick={() => setModalOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full relative"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-4">{form.id ? 'Edit' : 'Add'} Definition</h2>
            <input
              placeholder="Name"
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full mb-4 px-4 py-2 border rounded-lg"
            />
            {/* Was a free-text box labelled only "Type", with no hint of what
                to write. A salary component is either money added or money
                taken off; anything else is a typo waiting to break reporting. */}
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={form.type || ''}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full mb-1 px-4 py-2 border rounded-lg"
            >
              <option value="">Select type…</option>
              <option value="earning">Earning — added to pay (basic, allowance, bonus)</option>
              <option value="deduction">Deduction — taken off pay (NSSF, PAYE, advance)</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              e.g. “Basic Salary” as an earning, “PAYE” as a deduction.
            </p>
            {saveError && <p className="text-sm text-rose-600 mb-3">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}