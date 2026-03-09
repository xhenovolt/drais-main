'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function SchoolSelectionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [schools, setSchools] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'select' | 'create'>('select');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    curriculum: 'Kenya',
    timezone: 'Africa/Nairobi',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch schools user can join
    fetchAvailableSchools();
  }, []);

  const fetchAvailableSchools = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/schools/available');
      if (response.ok) {
        const data = await response.json();
        setSchools(data.schools || []);
      }
    } catch (err) {
      console.error('Error fetching schools:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSchool = async (schoolId: number) => {
    try {
      setIsLoading(true);
      setError('');
      const response = await fetch('/api/schools/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school_id: schoolId }),
      });

      if (response.ok) {
        router.push('/dashboard');
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to select school');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      setError('');

      if (!formData.name.trim()) {
        setError('School name is required');
        return;
      }

      const response = await fetch('/api/schools/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push('/dashboard');
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to create school');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Welcome, {user?.first_name}!</h1>
          <h2 className="text-xl font-semibold text-indigo-100">Select or Create Your School</h2>
        </div>

        {/* Card */}
        <div className="bg-white rounded-lg shadow-xl p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => { setActiveTab('select'); setError(''); }}
              className={`px-6 py-3 font-medium transition ${
                activeTab === 'select'
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Select Existing School
            </button>
            <button
              onClick={() => { setActiveTab('create'); setError(''); }}
              className={`px-6 py-3 font-medium transition ${
                activeTab === 'create'
                  ? 'border-b-2 border-indigo-600 text-indigo-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Create New School
            </button>
          </div>

          {/* Select School Tab */}
          {activeTab === 'select' && (
            <div>
              {isLoading ? (
                <p className="text-center text-gray-600">Loading schools...</p>
              ) : schools.length > 0 ? (
                <div className="space-y-3">
                  {schools.map(school => (
                    <button
                      key={school.id}
                      onClick={() => handleSelectSchool(school.id)}
                      disabled={isLoading}
                      className="w-full p-4 border border-gray-300 rounded-lg hover:border-indigo-600 hover:bg-indigo-50 transition text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <h3 className="font-semibold text-gray-900">{school.name}</h3>
                      <p className="text-sm text-gray-600 mt-1">{school.country || 'Kenya'}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-600 py-8">
                  No schools available. Create a new one to get started.
                </p>
              )}
            </div>
          )}

          {/* Create School Tab */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateSchool} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  School Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="ABC School"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone (Optional)
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+254700000000"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Curriculum
                </label>
                <select
                  name="curriculum"
                  value={formData.curriculum}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                >
                  <option value="Kenya">Kenya Curriculum</option>
                  <option value="Uganda">Uganda Curriculum</option>
                  <option value="Tanzania">Tanzania Curriculum</option>
                  <option value="International">International Baccalaureate</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Timezone
                </label>
                <select
                  name="timezone"
                  value={formData.timezone}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                >
                  <option value="Africa/Nairobi">Africa/Nairobi (Kenya)</option>
                  <option value="Africa/Kampala">Africa/Kampala (Uganda)</option>
                  <option value="Africa/Dar_es_Salaam">Africa/Dar_es_Salaam (Tanzania)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 mt-6"
              >
                {isLoading ? 'Creating School...' : 'Create School'}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-indigo-100 text-xs mt-8">
          You can manage multiple schools from your user profile
        </p>
      </div>
    </div>
  );
}
