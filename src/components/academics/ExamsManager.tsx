"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Dialog, Transition } from '@headlessui/react';
import { X } from 'lucide-react';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
const API_BASE = '/api';
const fetcher = (u: string) => fetch(u).then(r => r.json());
export const ExamsManager: React.FC = () => {
  const { t } = useI18n();
  const { data: classes } = useSWR(`${API_BASE}/classes`, fetcher);
  const { data: subjects } = useSWR(`${API_BASE}/subjects`, fetcher);
  const { data: terms } = useSWR(`${API_BASE}/terms`, fetcher);
  const [filters, setFilters] = useState({ term_id: '', class_id: '' });
  const exams = useSWR(`${API_BASE}/exams?term_id=${filters.term_id}&class_id=${filters.class_id}`, fetcher);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ term_id: '', class_id: '', subject_id: '', name: '', date: '', start_time: '', end_time: '' });

  const add = async () => {
    if (!formData.class_id || !formData.subject_id || !formData.name) return;
    await fetch(`${API_BASE}/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term_id: formData.term_id ? parseInt(formData.term_id, 10) : undefined,
        class_id: parseInt(formData.class_id, 10),
        subject_id: parseInt(formData.subject_id, 10),
        name: formData.name,
        date: formData.date || undefined,
        start_time: formData.start_time || undefined,
        end_time: formData.end_time || undefined,
      })
    });
    setFormData({ term_id: '', class_id: '', subject_id: '', name: '', date: '', start_time: '', end_time: '' });
    setIsModalOpen(false);
    exams.mutate();
  };

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    add();
  };
  const deleteExam = async (id: number) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: 'You won\'t be able to revert this!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, delete it!'
    });
  
    if (!result.isConfirmed) return;
  
    try {
      const response = await fetch(`${API_BASE}/exams?id=${id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (result.success) {
        Swal.fire('Deleted!', 'Exam deleted successfully', 'success');
        exams.mutate();
      } else {
        Swal.fire('Error!', result.error || 'Failed to delete exam', 'error');
      }
    } catch (error) {
      Swal.fire('Error!', 'An error occurred while deleting the exam', 'error');
    }
  };
  return (
    <div className="space-y-6">
      <h2 className="font-semibold text-lg bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 bg-clip-text text-transparent">{t('academics.exams')}</h2>
      <div className="flex gap-3 mb-2">
        <select value={filters.term_id} onChange={e=>setFilters({...filters,term_id:e.target.value})} className="px-3 py-2 rounded-xl border border-white/40 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 backdrop-blur text-sm">
          <option value="">{t('academics.term')}</option>
          {terms?.data?.map((t:any)=>(<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
        <select value={filters.class_id} onChange={e=>setFilters({...filters,class_id:e.target.value})} className="px-3 py-2 rounded-xl border border-white/40 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 backdrop-blur text-sm">
          <option value="">{t('academics.class')}</option>
          {classes?.data?.map((c:any)=>(<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
        <button onClick={openModal} className="ml-auto px-4 py-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white rounded-lg shadow-lg hover:shadow-xl transition-transform transform hover:scale-105">Add Exam</button>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/30 dark:border-white/10 shadow-lg">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 text-white">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Class</th>
              <th className="text-left px-4 py-3">Subject</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Start</th>
              <th className="text-left px-4 py-3">End</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {exams.data?.data?.map((r:any)=>(
              <tr key={r.id} className="hover:bg-gray-100 dark:hover:bg-gray-800">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{r.name}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{classes?.data?.find((c:any)=>c.id===r.class_id)?.name||r.class_id}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{subjects?.data?.find((s:any)=>s.id===r.subject_id)?.name||r.subject_id}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.date||'-'}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.start_time||'-'}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.end_time||'-'}</td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={() => deleteExam(r.id)} className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600">Delete</button>
                </td>
              </tr>
            ))}
            {!exams.data || exams.data.data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">No exams found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Transition appear show={isModalOpen} as={React.Fragment}>
        <Dialog as="div" className="relative z-10" onClose={closeModal}>
          <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-md" />
          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex items-center justify-center min-h-full p-4">
              <Dialog.Panel className="w-full max-w-lg p-6 bg-gradient-to-br from-gray-800 via-gray-900 to-black text-white rounded-2xl shadow-2xl backdrop-blur-md">
                <Dialog.Title className="text-xl font-bold text-center mb-4">Add Exam</Dialog.Title>
                <button onClick={closeModal} className="absolute top-4 right-4 p-2 rounded-full bg-gray-700 hover:bg-gray-600">
                  <X className="w-5 h-5 text-white" />
                </button>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label htmlFor="term_id" className="block text-sm font-medium">Term</label>
                    <select id="term_id" value={formData.term_id} onChange={e=>setFormData({...formData,term_id:e.target.value})} className="w-full px-4 py-2 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">Select Term</option>
                      {terms?.data?.map((t:any)=>(<option key={t.id} value={t.id}>{t.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="class_id" className="block text-sm font-medium">Class</label>
                    <select id="class_id" value={formData.class_id} onChange={e=>setFormData({...formData,class_id:e.target.value})} className="w-full px-4 py-2 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">Select Class</option>
                      {classes?.data?.map((c:any)=>(<option key={c.id} value={c.id}>{c.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="subject_id" className="block text-sm font-medium">Subject</label>
                    <select id="subject_id" value={formData.subject_id} onChange={e=>setFormData({...formData,subject_id:e.target.value})} className="w-full px-4 py-2 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">Select Subject</option>
                      {subjects?.data?.map((s:any)=>(<option key={s.id} value={s.id}>{s.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium">Exam Name</label>
                    <input id="name" type="text" value={formData.name} onChange={e=>setFormData({...formData,name:e.target.value})} className="w-full px-4 py-2 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label htmlFor="date" className="block text-sm font-medium">Date</label>
                    <input id="date" type="date" value={formData.date} onChange={e=>setFormData({...formData,date:e.target.value})} className="w-full px-4 py-2 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label htmlFor="start_time" className="block text-sm font-medium">Start Time</label>
                    <input id="start_time" type="time" value={formData.start_time} onChange={e=>setFormData({...formData,start_time:e.target.value})} className="w-full px-4 py-2 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label htmlFor="end_time" className="block text-sm font-medium">End Time</label>
                    <input id="end_time" type="time" value={formData.end_time} onChange={e=>setFormData({...formData,end_time:e.target.value})} className="w-full px-4 py-2 rounded-lg bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" className="px-6 py-2 bg-gradient-to-r from-green-400 to-blue-500 text-white rounded-lg shadow-md hover:shadow-lg transition-transform transform hover:scale-105">Save</button>
                  </div>
                </form>
              </Dialog.Panel>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}

export default ExamsManager;