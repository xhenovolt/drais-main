"use client";
import React, { useState, useEffect, useRef } from 'react';
import { School, Save, Loader2, Upload, RefreshCw, CheckCircle, ImagePlus, X } from 'lucide-react';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';
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
  arabicPhone: string;
  arabicPoBox: string;
  arabicCenterNo: string;
  arabicRegistrationNo: string;
  arabicMotto: string;
  schoolType: string;
  foundedYear: string;
}

export default function SchoolSettingsPage() {
  const { school, refresh, isLoading: configLoading } = useSchoolConfig();
  const [form, setForm] = useState<SchoolFormData>({
    name: '', shortName: '', address: '', city: '', country: 'Uganda',
    phone: '', email: '', website: '', principalName: '', motto: '',
    logo: '/uploads/logo.png', poBox: '', centerNo: '', registrationNo: '',
    arabicName: '', arabicAddress: '', arabicPhone: '', arabicPoBox: '', arabicCenterNo: '', arabicRegistrationNo: '', arabicMotto: '',
    schoolType: '', foundedYear: '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'drais/logos');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setForm(prev => ({ ...prev, logo: data.url }));
      setSaved(false);
      showToast('success', 'Logo uploaded — click Save to apply');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to upload logo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
        arabicPhone: school.arabicPhone || '',
        arabicPoBox: school.arabicPoBox || '',
        arabicCenterNo: school.arabicCenterNo || '',
        arabicRegistrationNo: school.arabicRegistrationNo || '',
        arabicMotto: school.arabicMotto || '',
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
      await apiFetch('/api/school-config', {
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
          arabic_phone: form.arabicPhone,
          arabic_po_box: form.arabicPoBox,
          arabic_center_no: form.arabicCenterNo,
          arabic_registration_no: form.arabicRegistrationNo,
          arabic_motto: form.arabicMotto,
          school_type: form.schoolType,
          founded_year: form.foundedYear ? parseInt(form.foundedYear) : null,
        }),
        successMessage: 'School settings saved successfully!',
      });
      setSaved(true);
      await refresh();
    } catch (err) {
      // apiFetch already showed error toast
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
          <div className="flex items-start gap-6">
            {/* Logo preview */}
            <div className="flex-shrink-0">
              {form.logo && form.logo !== '/uploads/logo.png' ? (
                <div className="relative group">
                  <img src={form.logo} alt="School logo" className="w-28 h-28 object-contain rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white" />
                  <button
                    type="button"
                    onClick={() => { setForm(prev => ({ ...prev, logo: '' })); setSaved(false); }}
                    className="absolute -top-2 -right-2 p-1 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-28 h-28 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                  <ImagePlus className="w-8 h-8 text-gray-400" />
                </div>
              )}
            </div>
            {/* Upload controls */}
            <div className="flex-1 space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">Upload your school logo. Supported: JPEG, PNG, WebP, SVG. Max 5MB.</p>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Uploading...' : 'Upload Logo'}
              </button>
              {form.logo && form.logo.includes('cloudinary') && (
                <p className="text-xs text-green-600 dark:text-green-400 truncate max-w-md">✓ Hosted on Cloudinary</p>
              )}
            </div>
          </div>
        </section>

        {/* Arabic (Bilingual) */}
        <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Arabic / Bilingual</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">These translations appear on the Arabic side of bilingual reports. Leave blank to fall back to the English values.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Arabic Name (اسم المدرسة)</label>
              <input name="arabicName" value={form.arabicName} onChange={handleChange} className={inputClass} dir="rtl" placeholder="مدرسة ..." />
            </div>
            <div>
              <label className={labelClass}>Arabic Address (العنوان)</label>
              <input name="arabicAddress" value={form.arabicAddress} onChange={handleChange} className={inputClass} dir="rtl" placeholder="العنوان بالعربية" />
            </div>
            <div>
              <label className={labelClass}>Arabic Phone (هاتف)</label>
              <input name="arabicPhone" value={form.arabicPhone} onChange={handleChange} className={inputClass} dir="ltr" placeholder="e.g. +256 700 123 456" />
            </div>
            <div>
              <label className={labelClass}>Arabic P.O. Box (صندوق البريد)</label>
              <input name="arabicPoBox" value={form.arabicPoBox} onChange={handleChange} className={inputClass} dir="rtl" placeholder="صندوق البريد" />
            </div>
            <div>
              <label className={labelClass}>Arabic UNEB Center No (رقم مركز يونيب)</label>
              <input name="arabicCenterNo" value={form.arabicCenterNo} onChange={handleChange} className={inputClass} dir="ltr" placeholder="e.g. TBD" />
            </div>
            <div>
              <label className={labelClass}>Arabic Registration No (رقم التسجيل)</label>
              <input name="arabicRegistrationNo" value={form.arabicRegistrationNo} onChange={handleChange} className={inputClass} dir="ltr" placeholder="e.g. IBB-2015-001234" />
            </div>
            <div>
              <label className={labelClass}>Arabic Motto (الشعار)</label>
              <input name="arabicMotto" value={form.arabicMotto} onChange={handleChange} className={inputClass} dir="rtl" placeholder="الشعار بالعربية" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
