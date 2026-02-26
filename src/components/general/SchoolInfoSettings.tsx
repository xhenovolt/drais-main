"use client";

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { toast } from 'react-hot-toast';
import {
  Save,
  Loader,
  AlertCircle,
  Building2,
  Mail,
  Phone,
  MapPin,
  Users,
  Globe,
  Calendar
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000/api';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface SchoolInfo {
  id?: number;
  school_id?: number;
  school_name: string;
  school_motto?: string;
  school_address?: string;
  school_contact?: string;
  school_email?: string;
  school_logo?: string;
  registration_number?: string;
  website?: string;
  founded_year?: number;
  principal_name?: string;
  principal_email?: string;
  principal_phone?: string;
}

export const SchoolInfoSettings: React.FC = () => {
  const [formData, setFormData] = useState<SchoolInfo>({
    school_name: '',
    school_motto: '',
    school_address: '',
    school_contact: '',
    school_email: '',
    school_logo: '',
    registration_number: '',
    website: '',
    founded_year: undefined,
    principal_name: '',
    principal_email: '',
    principal_phone: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const { data, error, isLoading: isFetching } = useSWR(
    `${API_BASE}/school-info`,
    fetcher,
    { revalidateOnFocus: false }
  );

  // Populate form when data loads
  useEffect(() => {
    if (data?.data) {
      setFormData(data.data);
      setHasChanges(false);
    }
  }, [data]);

  const handleChange = (field: keyof SchoolInfo, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!formData.school_name.trim()) {
      toast.error('School name is required');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/school-info`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error('Failed to save');

      const result = await response.json();
      if (result.success) {
        toast.success('School information updated successfully');
        setHasChanges(false);
      }
    } catch (err) {
      toast.error('Failed to save school information');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 text-red-600 bg-red-50 rounded-lg">
        <AlertCircle className="w-5 h-5" />
        <span>Failed to load school information</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Building2 className="w-6 h-6" />
          School Information
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Manage your school's core identity and contact information
        </p>
      </div>

      {/* Loading State */}
      {isFetching && !data && (
        <div className="flex items-center justify-center py-8">
          <Loader className="w-5 h-5 animate-spin text-blue-600" />
          <span className="ml-2 text-slate-600">Loading school information...</span>
        </div>
      )}

      {/* Form */}
      {data && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Basic Information
            </h3>
            <div className="space-y-4">
              {/* School Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  School Name *
                </label>
                <input
                  type="text"
                  value={formData.school_name}
                  onChange={(e) => handleChange('school_name', e.target.value)}
                  placeholder="Enter school name"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              {/* School Motto */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  School Motto
                </label>
                <input
                  type="text"
                  value={formData.school_motto || ''}
                  onChange={(e) => handleChange('school_motto', e.target.value)}
                  placeholder="e.g., Excellence in Education"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Founded Year */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Founded Year
                </label>
                <input
                  type="number"
                  value={formData.founded_year || ''}
                  onChange={(e) => handleChange('founded_year', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="e.g., 2020"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Contact Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* School Address */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  School Address
                </label>
                <textarea
                  value={formData.school_address || ''}
                  onChange={(e) => handleChange('school_address', e.target.value)}
                  placeholder="Enter full school address"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              {/* School Phone */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Primary Contact
                </label>
                <input
                  type="tel"
                  value={formData.school_contact || ''}
                  onChange={(e) => handleChange('school_contact', e.target.value)}
                  placeholder="e.g., +256 700 000 000"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              {/* School Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  School Email
                </label>
                <input
                  type="email"
                  value={formData.school_email || ''}
                  onChange={(e) => handleChange('school_email', e.target.value)}
                  placeholder="info@school.ug"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Website */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Website
                </label>
                <input
                  type="url"
                  value={formData.website || ''}
                  onChange={(e) => handleChange('website', e.target.value)}
                  placeholder="https://www.school.ug"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Registration Number */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Registration Number
                </label>
                <input
                  type="text"
                  value={formData.registration_number || ''}
                  onChange={(e) => handleChange('registration_number', e.target.value)}
                  placeholder="Official registration/license number"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
          </div>

          {/* Principal Information */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Principal/Headteacher Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Principal Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.principal_name || ''}
                  onChange={(e) => handleChange('principal_name', e.target.value)}
                  placeholder="Principal name"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Principal Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.principal_email || ''}
                  onChange={(e) => handleChange('principal_email', e.target.value)}
                  placeholder="principal@school.ug"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Principal Phone */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.principal_phone || ''}
                  onChange={(e) => handleChange('principal_phone', e.target.value)}
                  placeholder="Principal phone number"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>

              {/* School Logo */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Logo URL/Path
                </label>
                <input
                  type="text"
                  value={formData.school_logo || ''}
                  onChange={(e) => handleChange('school_logo', e.target.value)}
                  placeholder="/logos/school-logo.png"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {hasChanges ? '✱ You have unsaved changes' : 'All changes saved'}
            </p>
            <button
              onClick={handleSave}
              disabled={!hasChanges || isLoading}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
