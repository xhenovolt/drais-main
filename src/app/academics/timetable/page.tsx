'use client';

import React from 'react';
import TimetableGrid from '@/components/timetable/TimetableGrid';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const TimetablePage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <ToastContainer position="top-right" autoClose={3000} />
      <TimetableGrid />
    </div>
  );
};

export default TimetablePage;

