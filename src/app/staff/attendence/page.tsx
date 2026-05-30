"use client";
import React, { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';

const StaffAttendance = () => {
  const { t } = useI18n();
  const [formData, setFormData] = useState({ staff_id: '', date: '', status: '', notes: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/staff/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (data.success) {
        alert('Attendance recorded successfully!');
        setFormData({ staff_id: '', date: '', status: '', notes: '' });
      } else {
        alert('Failed to record attendance.');
      }
    } catch (error) {
      console.error('Failed to record attendance:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">{`${t('people.staff')} — ${t('academic.attendance')}`}</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-2">{t('fields.staffId')}</label>
          <input
            type="text"
            name="staff_id"
            value={formData.staff_id}
            onChange={handleChange}
            className="border border-gray-300 px-4 py-2 w-full"
            required
          />
        </div>
        <div>
          <label className="block mb-2">{t('common.date')}</label>
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            className="border border-gray-300 px-4 py-2 w-full"
            required
          />
        </div>
        <div>
          <label className="block mb-2">{t('common.status')}</label>
          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="border border-gray-300 px-4 py-2 w-full"
            required
          >
            <option value="">{t('common.select')}</option>
            <option value="present">{t('academic.attendance')}</option>
            <option value="absent">{t('academic.daysAbsent')}</option>
          </select>
        </div>
        <div>
          <label className="block mb-2">{t('academic.remarks')}</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            className="border border-gray-300 px-4 py-2 w-full"
          ></textarea>
        </div>
        <button type="submit" className="bg-blue-500 text-white px-4 py-2">{t('actions.submit')}</button>
      </form>
    </div>
  );
};

export default StaffAttendance;