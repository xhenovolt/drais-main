"use client";

import React, { useState } from 'react';
import useSWR from 'swr';
import { Plus, Edit, Trash, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';

const API_SALARY_PAYMENTS = '/api/salary_payments';
const API_STAFF_LIST = '/api/staff/list';
const API_WALLETS = '/api/finance/wallets'; // was '/api/wallets' — that route doesn't exist; this page's wallet dropdown never populated
const fetcher = (url: string) => fetch(url).then((res) => res.json());

type SalaryPayment = {
  id: number;
  staff_id: number;
  wallet_id: string;
  amount: number;
  method: string;
  reference: string;
};

type Staff = {
  id: number;
  first_name: string;
  last_name: string;
};

type Wallet = {
  id: string;
  name: string;
};

export default function SalaryPaymentsPage() {
  const { data: payments, error, mutate } = useSWR<SalaryPayment[]>(API_SALARY_PAYMENTS, fetcher);
  const { data: staffResponse } = useSWR<{ success: boolean; data: Staff[] }>(API_STAFF_LIST, fetcher);
  const { data: walletsResponse } = useSWR<{ success: boolean; data: Wallet[] }>(API_WALLETS, fetcher);
  const staff = staffResponse?.data || [];
  const wallets = walletsResponse?.data || [];
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Partial<SalaryPayment>>({
    id: undefined,
    staff_id: undefined,
    wallet_id: '',
    amount: undefined,
    method: '',
    reference: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const method = form.id ? 'PUT' : 'POST';
    try {
      await fetch(API_SALARY_PAYMENTS, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      mutate();
      setModalOpen(false);
    } catch (error) {
      console.error('Failed to save salary payment:', error);
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
        await fetch(API_SALARY_PAYMENTS, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        mutate();
        Swal.fire('Deleted!', 'The salary payment has been deleted.', 'success');
      } catch (error) {
        Swal.fire('Error!', 'Failed to delete the salary payment.', 'error');
      }
    }
  };

  if (error) return <div>Error loading salary payments.</div>;
  if (!payments || !staffResponse || !walletsResponse) return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin" /></div>;

  return (
    <div className="space-y-4 mx-20">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Salary Payments</h1>
        <button
          onClick={() => {
            setForm({
              id: undefined,
              staff_id: undefined,
              wallet_id: '',
              amount: undefined,
              method: '',
              reference: '',
            });
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white text-sm font-semibold shadow-lg hover:scale-105 transition-transform"
        >
          <Plus className="w-4 h-4" /> Add Payment
        </button>
      </div>

      <div className="rounded-2xl overflow-hidden border border-blue-200 backdrop-blur bg-gradient-to-br from-white/80 via-blue-50/60 to-pink-50/60 shadow-2xl">
        <table className="w-full text-sm">
          <thead className="text-left bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white">
            <tr>
              <th className="px-4 py-2 font-semibold">Staff</th>
              <th className="px-4 py-2 font-semibold">Wallet</th>
              <th className="px-4 py-2 font-semibold">Amount</th>
              <th className="px-4 py-2 font-semibold">Method</th>
              <th className="px-4 py-2 font-semibold">Reference</th>
              <th className="px-4 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr
                key={payment.id}
                className="hover:bg-gradient-to-r hover:from-blue-100 hover:via-pink-100 hover:to-indigo-100 transition-colors"
              >
                <td className="px-4 py-2">{staff.find((s) => s.id === payment.staff_id)?.first_name + ' ' + staff.find((s) => s.id === payment.staff_id)?.last_name || 'N/A'}</td>
                <td className="px-4 py-2">{wallets.find((w) => w.id === payment.wallet_id)?.name || 'N/A'}</td>
                <td className="px-4 py-2">{payment.amount}</td>
                <td className="px-4 py-2">{payment.method}</td>
                <td className="px-4 py-2">{payment.reference}</td>
                <td className="px-4 py-2 flex gap-2">
                  <button
                    onClick={() => {
                      setForm(payment);
                      setModalOpen(true);
                    }}
                    className="px-2 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(payment.id)}
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
            <h2 className="text-xl font-bold mb-4">{form.id ? 'Edit' : 'Add'} Payment</h2>
            <select
              value={form.staff_id || ''}
              onChange={(e) => setForm({ ...form, staff_id: Number(e.target.value) })}
              className="w-full mb-4 px-4 py-2 border rounded-lg"
            >
              <option value="">Select Staff</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
              ))}
            </select>
            <select
              value={form.wallet_id || ''}
              onChange={(e) => setForm({ ...form, wallet_id: e.target.value })}
              className="w-full mb-4 px-4 py-2 border rounded-lg"
            >
              <option value="">Select Wallet</option>
              {wallets.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <input
              placeholder="Amount"
              value={form.amount || ''}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
              className="w-full mb-4 px-4 py-2 border rounded-lg"
            />
            <input
              placeholder="Method"
              value={form.method || ''}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
              className="w-full mb-4 px-4 py-2 border rounded-lg"
            />
            <input
              placeholder="Reference"
              value={form.reference || ''}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              className="w-full mb-4 px-4 py-2 border rounded-lg"
            />
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