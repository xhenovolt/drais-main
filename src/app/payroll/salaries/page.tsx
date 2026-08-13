"use client";

import React, { useState } from 'react';
import { apiErrorMessage } from '@/lib/errorMessage';
import useSWR from 'swr';
import { Plus, Edit, Trash, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';

const API_STAFF_SALARIES = '/api/staff_salaries';
const API_PAYROLL_DEFINITIONS = '/api/payroll_definitions';
const API_STAFF_LIST = '/api/staff/list';
const fetcher = (url: string) => fetch(url).then((res) => res.json());

type StaffSalary = {
  id: number;
  staff_id: number;
  month: string;
  period_month: number;
  definition_id: number;
  amount: number;
};

type PayrollDefinition = {
  id: number;
  name: string;
};

type Staff = {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
};

export default function StaffSalariesPage() {
  const { data: salaries, error, mutate } = useSWR<StaffSalary[]>(API_STAFF_SALARIES, fetcher);
  const { data: definitions } = useSWR<PayrollDefinition[]>(API_PAYROLL_DEFINITIONS, fetcher);
  const { data: staffResponse } = useSWR<{ success: boolean; data: Staff[] }>(API_STAFF_LIST, fetcher);
  const staff = staffResponse?.data || [];
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<StaffSalary>>({
    id: undefined,
    staff_id: undefined,
    month: '',
    period_month: undefined,
    definition_id: undefined,
    amount: undefined,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const method = form.id ? 'PUT' : 'POST';
    try {
      // The response was never inspected, so a rejected save closed the dialog
      // exactly like a successful one and the salary silently never existed.
      const res = await fetch(API_STAFF_SALARIES, {
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
      console.error('Failed to save staff salary:', error);
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
        await fetch(API_STAFF_SALARIES, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        mutate();
        Swal.fire('Deleted!', 'The staff salary has been deleted.', 'success');
      } catch (error) {
        Swal.fire('Error!', 'Failed to delete the staff salary.', 'error');
      }
    }
  };

  if (error) return <div>Error loading staff salaries.</div>;
  if (!salaries || !definitions || !staffResponse) return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4 mx-20">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Staff Salaries</h1>
        <button
          onClick={() => {
            setForm({
              id: undefined,
              staff_id: undefined,
              month: '',
              period_month: undefined,
              definition_id: undefined,
              amount: undefined,
            });
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white text-sm font-semibold shadow-lg hover:scale-105 transition-transform"
        >
          <Plus className="w-4 h-4" /> Add Salary
        </button>
      </div>

      <div className="rounded-2xl overflow-hidden border border-blue-200 backdrop-blur bg-gradient-to-br from-white/80 via-blue-50/60 to-pink-50/60 shadow-2xl">
        <table className="w-full text-sm">
          <thead className="text-left bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white">
            <tr>
              <th className="px-4 py-2 font-semibold">Staff</th>
              <th className="px-4 py-2 font-semibold">Month</th>
              <th className="px-4 py-2 font-semibold">Period</th>
              <th className="px-4 py-2 font-semibold">Definition</th>
              <th className="px-4 py-2 font-semibold">Amount</th>
              <th className="px-4 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {salaries.map((salary) => (
              <tr
                key={salary.id}
                className="hover:bg-gradient-to-r hover:from-blue-100 hover:via-pink-100 hover:to-indigo-100 transition-colors"
              >
                <td className="px-4 py-2">{staff.find((s) => s.id === salary.staff_id)?.first_name + ' ' + staff.find((s) => s.id === salary.staff_id)?.last_name || 'N/A'}</td>
                <td className="px-4 py-2">{salary.month}</td>
                <td className="px-4 py-2">{salary.period_month}</td>
                <td className="px-4 py-2">{definitions.find((def) => def.id === salary.definition_id)?.name || 'N/A'}</td>
                <td className="px-4 py-2">{salary.amount}</td>
                <td className="px-4 py-2 flex gap-2">
                  <button
                    onClick={() => {
                      setForm(salary);
                      setModalOpen(true);
                    }}
                    className="px-2 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(salary.id)}
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
            <h2 className="text-xl font-bold mb-4">{form.id ? 'Edit' : 'Add'} Salary</h2>
            <select
              value={form.staff_id || ''}
              onChange={(e) => setForm({ ...form, staff_id: Number(e.target.value) })}
              className="w-full mb-4 px-4 py-2 border rounded-lg"
            >
              <option value="">Select Staff</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name} - {s.position}</option>
              ))}
            </select>
            {/* These were two free-text boxes labelled "Month" and "Period
                Month". The columns are month = YEAR(4) and period_month =
                TINYINT (1-12), so the first is really the year and the second
                the month number — unguessable from the labels, and anything
                typed was rejected by the database. */}
            <label className="block text-sm font-medium mb-1">Year</label>
            <select
              value={form.month || ''}
              onChange={(e) => setForm({ ...form, month: e.target.value })}
              className="w-full mb-4 px-4 py-2 border rounded-lg"
            >
              <option value="">Select year…</option>
              {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
            <label className="block text-sm font-medium mb-1">Month</label>
            <select
              value={form.period_month || ''}
              onChange={(e) => setForm({ ...form, period_month: Number(e.target.value) })}
              className="w-full mb-4 px-4 py-2 border rounded-lg"
            >
              <option value="">Select month…</option>
              {['January','February','March','April','May','June','July','August','September','October','November','December']
                .map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select
              value={form.definition_id || ''}
              onChange={(e) => setForm({ ...form, definition_id: Number(e.target.value) })}
              className="w-full mb-4 px-4 py-2 border rounded-lg"
            >
              <option value="">Select Definition</option>
              {definitions.map((def) => (
                <option key={def.id} value={def.id}>{def.name}</option>
              ))}
            </select>
            <input
              placeholder="Amount"
              value={form.amount || ''}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              className="w-full mb-4 px-4 py-2 border rounded-lg"
            />
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