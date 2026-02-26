"use client";
import React, { useEffect, useState } from 'react';
import ExamsManager from '@/components/academics/ExamsManager';

export default function ExamsPage() {
  return (
    <div className="p-4 md:p-8">
      <ExamsManager />
    </div>
  );
}