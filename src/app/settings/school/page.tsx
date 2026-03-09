"use client";
import React, { useState, useEffect } from 'react';
import { School, Save, Loader2, Upload, RefreshCw, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSchoolConfig } from '@/hooks/useSchoolConfig';

interface SchoolFormData {
  name: string;
  shortName: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  principalName: string;
  motto: string;
  logo: string;
  poBox: string;
  centerNo: string;
  registrationNo: string;
  arabicName: string;
  arabicAddress: string;
  schoolType: string;
  foundedYear: string;
}

export default function SchoolSettingsPage() {
  const { school, refresh, isLoading: configLoading } = useSchoolConfig();
  const [form, setForm] = useState<SchoolFormData>({
    name: '', shortName: '', address: '', city: '', country: 'Uganda',
    phone: '', email: '', website: '', principalName: '', motto: '',
    logo: '/uploads/logo.png', poBox: '', centerNo: '', registrationNo: '',
    arabicName: '', arabicAddress: '', schoolType: '', foundedYear: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Populate form when school config loads
  useEffect(() => {
    if (school && school.name !== 'School') {
      setForm({
        name: school.name || '',
        shortName: school.shortName || '',
        address: school.address || '',
        city: school.city || school.district || '',
        country: school.country || 'Uganda',
        phone: school.phone || '',
        email: school.email || '',
        website: school.website || '',
        principalName: school.principalName || '',
        motto: school.motto || '',
        logo: school.logo || '/uploads/logo.png',
        poBox: school.poBox || '',
        centerNo: school.centerNo || '',
        registrationNo: school.registrationNo || '',
        arabicName: school.arabicName || '',
        arabicAddress: school.arabicAddress || '',
        schoolType: school.schoolType || '',
        foundedYear: school.foundedYear ? String(school.foundedYear) : '',
      });
    }
  }, [school]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/school-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: 1,
          name: form.name,
          shortName: form.shortName,
          address: form.address,
          city: form.city,
          country: form.country,
          phone: form.phone,
          email: form.email,
          website: form.website,
          principal_name: form.principalName,
          motto: form.motto,
          logo: form.logo,
          po_box: form.poBox,
          center_no: form.centerNo,
          registration_no: form.registrationNo,
          arabic_name: form.arabicName,
          arabic_address: form.arabicAddress,
          school_type: form.schoolType,
          founded_year: form.foundedYear ? parseInt(form.foundedYear) : null,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast.success('School settings saved successfully!');
        setSaved(true);
        // Refresh all consumers of useSchoolConfig
        await refresh();
      } else {
        toast.error(result.error || 'Failed to save settings');
      }
    } catch (err) {
      toast.error('Network error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  if (configLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-500">Loading school configuration...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <School className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">School Identity Settings</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Manage your school&apos;s name, contact, and branding — changes apply system-wide</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refresh()}
            className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            title="Refresh from database"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Form Sections */}
      <div className="space-y-6">
        {/* Basic Info */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>School Name *</label>
              <input name="name" value={form.name} onChange={handleChange} className={inputClass} placeholder="e.g. ABC Secondary School" />
            </div>
            <div>
              <label className={labelClass}>Short Name / Code</label>
              <input name="shortName" value={form.shortName} onChange={handleChange} className={inputClass} placeholder="e.g. ABCSS" />
            </div>
            <div>
              <label className={labelClass}>School Type</label>
              <select name="schoolType" value={form.schoolType} onChange={handleChange} className={inputClass}>
                <option value="">Select type</option>
                <option value="Primary">Primary</option>
                <option value="Secondary">Secondary</option>
                <option value="Tertiary">Tertiary</option>
                <option value="Vocational">Vocational</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Founded Year</label>
              <input name="foundedYear" type="number" value={form.foundedYear} onChange={handleChange} className={inputClass} placeholder="e.g. 2005" />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Motto</label>
              <input name="motto" value={form.motto} onChange={handleChange} className={inputClass} placeholder="School motto" />
            </div>
          </div>
        </section>

        {/* Contact */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Contact & Location</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={labelClass}>Address</label>
              <textarea name="address" value={form.address} onChange={handleChange} className={inputClass} rows={2} placeholder="Physical address" />
            </div>
            <div>
              <label className={labelClass}>City / District</label>
              <input name="city" value={form.city} onChange={handleChange} className={inputClass} placeholder="e.g. Kampala" />
            </div>
            <div>
              <label className={labelClass}>Country</label>
              <input name="country" value={form.country} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input name="phone" value={form.phone} onChange={handleChange} className={inputClass} placeholder="+256 700 000 000" />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} className={inputClass} placeholder="info@school.ac.ug" />
            </div>
            <div>
              <label className={labelClass}>Website</label>
              <input name="website" value={form.website} onChange={handleChange} className={inputClass} placeholder="https://school.ac.ug" />
            </div>
            <div>
              <label className={labelClass}>P.O. Box</label>
              <input name="poBox" value={form.poBox} onChange={handleChange} className={inputClass} placeholder="P.O. Box 123, City" />
            </div>
          </div>
        </section>

        {/* Administration */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Administration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Principal / Headteacher Name</label>
              <input name="principalName" value={form.principalName} onChange={handleChange} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>UNEB Centre Number</label>
              <input name="centerNo" value={form.centerNo} onChange={handleChange} className={inputClass} placeholder="Centre No: TBD" />
            </div>
            <div>
              <label className={labelClass}>Registration Number</label>
              <input name="registrationNo" value={form.registrationNo} onChange={handleChange} className={inputClass} placeholder="Reg no: TBD" />
            </div>
          </div>
        </section>

        {/* Branding */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Branding & Logo</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Logo URL</label>
              <div className="flex items-center gap-3">
                <input name="logo" value={form.logo} onChange={handleChange} className={inputClass} placeholder="/uploads/logo.png" />
                {form.logo && (
                  <img src={form.logo} alt="School logo" className="w-12 h-12 object-contain rounded border border-gray-200 dark:border-gray-600" />
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Arabic (Bilingual) */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Arabic / Bilingual</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Arabic Name</label>
              <input name="arabicName" value={form.arabicName} onChange={handleChange} className={inputClass} dir="rtl" />
            </div>
            <div>
              <label className={labelClass}>Arabic Address</label>
              <input name="arabicAddress" value={form.arabicAddress} onChange={handleChange} className={inputClass} dir="rtl" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
