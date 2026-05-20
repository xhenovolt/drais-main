"use client";
import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Loader, ArrowLeft, Save, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface PositionOption {
  id: number;
  name: string;
  code: string;
  category: 'academic' | 'admin' | 'finance' | 'support' | 'spiritual';
  isTeaching: boolean;
}
interface DepartmentOption { id: number; name: string }
interface ManagerOption {
  id: number;
  first_name: string;
  last_name: string;
  position: string | null;
  position_name: string | null;
  department_name: string | null;
}

export default function StaffEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const { data, error, isLoading, mutate } = useSWR(
    id && /^\d+$/.test(id) ? `/api/staff/${id}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  // Phase B/C support — pull the positions catalog, departments, and the
  // pool of other staff (for the manager dropdown). The current staff
  // record is excluded so a person cannot select themselves as their
  // own manager.
  const { data: positionsResp } = useSWR<{ positions: PositionOption[] }>(
    '/api/admin/positions',
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: departmentsResp } = useSWR<{ data?: DepartmentOption[]; rows?: DepartmentOption[] }>(
    '/api/departments/list',
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: managersResp } = useSWR<{ data: ManagerOption[] }>(
    id ? `/api/staff/list?active=1&exclude_id=${id}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const positions   = positionsResp?.positions ?? [];
  const departments = departmentsResp?.data ?? departmentsResp?.rows ?? [];
  const managers    = managersResp?.data ?? [];

  // Group positions by category for the optgrouped dropdown.
  const positionsByCategory = useMemo(() => {
    const groups: Record<string, PositionOption[]> = {};
    for (const p of positions) {
      (groups[p.category] ??= []).push(p);
    }
    return groups;
  }, [positions]);

  const [formData, setFormData] = useState<any>({});

  // Populate form when data loads
  React.useEffect(() => {
    if (data?.success && data?.data) {
      setFormData(data.data);
    }
  }, [data]);

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.first_name?.trim() || !formData.last_name?.trim()) {
      toast.error('First name and last name are required');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/staff/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: formData.first_name,
          last_name: formData.last_name,
          other_name: formData.other_name,
          gender: formData.gender,
          date_of_birth: formData.date_of_birth,
          national_id: formData.national_id,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          // Phase B/C — write the FKs. The legacy `position` text column is
          // dual-written by the API based on position_id so legacy reads
          // keep working until Phase I.
          position_id:   formData.position_id   || null,
          department_id: formData.department_id || null,
          manager_id:    formData.manager_id    || null,
          employment_type: formData.employment_type,
          hire_date:    formData.hire_date,
          status:       formData.status,
          qualification: formData.qualification,
          experience_years: formData.experience_years,
          salary:       formData.salary,
          bank_name:    formData.bank_name,
          bank_account_no: formData.bank_account_no,
          nssf_no:      formData.nssf_no,
          tin_no:       formData.tin_no,
        })
      });

      if (response.ok) {
        toast.success('Staff member updated successfully');
        router.push(`/staff/${id}`);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to update staff member');
      }
    } catch (err: any) {
      toast.error('Error updating staff member');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!id || !/^\d+$/.test(id)) {
    return (
      <div className="p-8 flex flex-col items-center gap-3 text-center">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm text-slate-500">Invalid staff ID in URL.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center gap-3">
        <Loader className="w-5 h-5 text-indigo-500 animate-spin" />
        <p className="text-sm text-slate-500">Loading staff profile…</p>
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="p-8 flex flex-col items-center gap-3 text-center">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Failed to load staff member</p>
      </div>
    );
  }

  return (
    <div className="py-6 px-4 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Edit Staff Member</h1>
          <p className="text-sm text-slate-500 mt-1">Update staff information</p>
        </div>
        <Link
          href={`/staff/${id}`}
          className="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Close"
        >
          <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
        </Link>
      </div>

      {/* Form */}
      <div className="space-y-6 bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
        {/* Personal Information */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-2">
            Personal Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                First Name *
              </label>
              <input
                type="text"
                value={formData.first_name || ''}
                onChange={(e) => handleInputChange('first_name', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="First name"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Last Name *
              </label>
              <input
                type="text"
                value={formData.last_name || ''}
                onChange={(e) => handleInputChange('last_name', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Last name"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Other Names
              </label>
              <input
                type="text"
                value={formData.other_name || ''}
                onChange={(e) => handleInputChange('other_name', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Other names"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Gender
              </label>
              <select
                value={formData.gender || ''}
                onChange={(e) => handleInputChange('gender', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select gender</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Date of Birth
              </label>
              <input
                type="date"
                value={formData.date_of_birth?.split('T')[0] || ''}
                onChange={(e) => handleInputChange('date_of_birth', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                National ID
              </label>
              <input
                type="text"
                value={formData.national_id || ''}
                onChange={(e) => handleInputChange('national_id', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="National ID"
              />
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-2">
            Contact Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Email address"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone || ''}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Phone number"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Address
              </label>
              <input
                type="text"
                value={formData.address || ''}
                onChange={(e) => handleInputChange('address', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Address"
              />
            </div>
          </div>
        </div>

        {/* Professional Information */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-2">
            Professional Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Position *
              </label>
              <select
                value={formData.position_id || ''}
                onChange={(e) => handleInputChange('position_id', e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select a position…</option>
                {(['academic', 'spiritual', 'admin', 'finance', 'support'] as const).map(cat => {
                  const opts = positionsByCategory[cat] ?? [];
                  if (opts.length === 0) return null;
                  return (
                    <optgroup
                      key={cat}
                      label={cat.charAt(0).toUpperCase() + cat.slice(1)}
                    >
                      {opts.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.isTeaching ? ' · teaching' : ''}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                Sourced from the school positions catalog. Add new positions via Admin → Positions.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Department
              </label>
              <select
                value={formData.department_id || ''}
                onChange={(e) => handleInputChange('department_id', e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— No department —</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Reports To (Manager)
              </label>
              <select
                value={formData.manager_id || ''}
                onChange={(e) => handleInputChange('manager_id', e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— No manager (top of hierarchy) —</option>
                {managers.map(m => {
                  const title = m.position_name || m.position || '';
                  const dept  = m.department_name ? ` · ${m.department_name}` : '';
                  return (
                    <option key={m.id} value={m.id}>
                      {m.first_name} {m.last_name}{title ? ` — ${title}` : ''}{dept}
                    </option>
                  );
                })}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                The person this staff member reports to. Builds the org hierarchy.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Hire Date
              </label>
              <input
                type="date"
                value={formData.hire_date?.split('T')[0] || ''}
                onChange={(e) => handleInputChange('hire_date', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Employment Type
              </label>
              <select
                value={formData.employment_type || ''}
                onChange={(e) => handleInputChange('employment_type', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select employment type</option>
                <option value="permanent">Permanent</option>
                <option value="contract">Contract</option>
                <option value="volunteer">Volunteer</option>
                <option value="part-time">Part-time</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Status
              </label>
              <select
                value={formData.status || 'active'}
                onChange={(e) => handleInputChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Qualification
              </label>
              <input
                type="text"
                value={formData.qualification || ''}
                onChange={(e) => handleInputChange('qualification', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Qualification"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Years of Experience
              </label>
              <input
                type="number"
                min="0"
                value={formData.experience_years || ''}
                onChange={(e) => handleInputChange('experience_years', e.target.value ? parseInt(e.target.value) : '')}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Years"
              />
            </div>
          </div>
        </div>

        {/* Financial Information */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-2">
            Financial Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Salary
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.salary || ''}
                onChange={(e) => handleInputChange('salary', e.target.value ? parseFloat(e.target.value) : '')}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Salary"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Bank Name
              </label>
              <input
                type="text"
                value={formData.bank_name || ''}
                onChange={(e) => handleInputChange('bank_name', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Bank name"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Bank Account Number
              </label>
              <input
                type="text"
                value={formData.bank_account_no || ''}
                onChange={(e) => handleInputChange('bank_account_no', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Bank account number"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                NSSF Number
              </label>
              <input
                type="text"
                value={formData.nssf_no || ''}
                onChange={(e) => handleInputChange('nssf_no', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="NSSF number"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                TIN Number
              </label>
              <input
                type="text"
                value={formData.tin_no || ''}
                onChange={(e) => handleInputChange('tin_no', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="TIN number"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Link
          href={`/staff/${id}`}
          className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
        >
          <X className="w-4 h-4" />
          Cancel
        </Link>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white transition-colors flex items-center gap-2"
        >
          {saving ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Changes
            </>
          )}
        </button>
      </div>
    </div>
  );
}
