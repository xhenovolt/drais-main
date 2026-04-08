'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Plus, Search, MoreVertical, Eye, Edit, 
  Calendar, Clock, BookOpen, Award, User, X, Trash2
} from 'lucide-react';
import GroupMembersModal from '@/components/tahfiz/GroupMembersModal';
import { useAuth } from '@/contexts/AuthContext';

interface Group {
  id: number;
  name: string;
  teacher: string;
  studentCount: number;
  schedule: string;
  progress: number;
  status: 'active' | 'inactive' | 'completed';
  nextSession: string | null;
  completedSessions: number;
  totalSessions: number;
  notes?: string;
  created_at: string;
}

interface Teacher {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  subject: string;
}

export default function TahfizGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [selectedGroupForMembers, setSelectedGroupForMembers] = useState<Group | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    teacher_id: '',
    schedule: '',
    notes: ''
  });

  const { user } = useAuth();
  const schoolId = user?.schoolId ?? 0; // real session school

  useEffect(() => {
    fetchGroups();
    fetchTeachers();
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('Fetching groups for school ID:', schoolId);
      
      const res = await fetch(`/api/tahfiz/groups?school_id=${schoolId}`);
      console.log('Response status:', res.status);
      
      const data = await res.json();
      console.log('Response data:', data);
      
      if (!res.ok) {
        throw new Error(data.message || 'Failed to fetch groups');
      }
      
      if (data.success) {
        console.log('Groups fetched:', data.data);
        // Ensure proper data structure with defaults
        const processedGroups = (data.data || []).map((group: any) => ({
          ...group,
          progress: group.progress || 0,
          studentCount: group.studentCount || group.member_count || 0,
          completedSessions: group.completedSessions || 0,
          totalSessions: group.totalSessions || 0,
          status: group.status || 'active',
          created_at: group.created_at || new Date().toISOString(),
          teacher: group.teacher_name || group.teacher || 'Unknown Teacher'
        }));
        setGroups(processedGroups);
      } else {
        throw new Error(data.message || 'Failed to fetch groups');
      }
    } catch (err: any) {
      console.error('Error fetching groups:', err);
      setError(err.message);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      console.log('Fetching teachers for school ID:', schoolId); // Debug log
      
      const res = await fetch(`/api/tahfiz/teachers?school_id=${schoolId}`);
      const data = await res.json();
      
      console.log('Teachers response:', data); // Debug log
      
      if (res.ok && data.success) {
        setTeachers(data.data || []); // Ensure it's always an array
      } else {
        console.error('Failed to fetch teachers:', data.message);
        setTeachers([]); // Set empty array on error
      }
    } catch (err) {
      console.error('Failed to fetch teachers:', err);
      setTeachers([]); // Set empty array on error
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/tahfiz/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          ...formData,
          teacher_id: parseInt(formData.teacher_id)
        })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || 'Failed to create group');
      }
      
      if (data.success) {
        // Add the new group to the list
        setGroups(prev => [data.data, ...prev]);
        
        // Reset form and close modal
        setFormData({ name: '', teacher_id: '', schedule: '', notes: '' });
        setShowAddModal(false);
      } else {
        throw new Error(data.message || 'Failed to create group');
      }
      
    } catch (err: any) {
      console.error('Error creating group:', err);
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (!confirm('Are you sure you want to delete this group? This will also remove all members.')) return;

    try {
      const res = await fetch(`/api/tahfiz/groups?id=${groupId}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || 'Failed to delete group');
      }
      
      if (data.success) {
        // Remove the group from the list
        setGroups(prev => prev.filter(group => group.id !== groupId));
      } else {
        throw new Error(data.message || 'Failed to delete group');
      }
    } catch (err: any) {
      console.error('Error deleting group:', err);
      setError(err.message);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      inactive: 'bg-gray-100 text-gray-700 border-gray-200',
      completed: 'bg-blue-100 text-blue-700 border-blue-200'
    };
    return `px-3 py-1 rounded-full text-xs font-medium border ${styles[status as keyof typeof styles]}`;
  };

  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.teacher.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleViewMembers = (group: Group) => {
    setSelectedGroupForMembers(group);
    setShowMembersModal(true);
  };

  const handleMembersChanged = () => {
    fetchGroups(); // Refresh groups to update member counts
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Tahfiz Groups</h1>
            <p className="text-slate-600 mt-1">Manage Tahfiz groups and track collective progress</p>
            {groups.length > 0 && (
              <div className="flex items-center space-x-4 mt-2 text-sm text-slate-500">
                <span>Total: {groups.length}</span>
                <span>Active: {groups.filter(g => g.status === 'active').length}</span>
                <span>Students: {groups.reduce((sum, g) => sum + g.studentCount, 0)}</span>
              </div>
            )}
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowAddModal(true)}
            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Create Group</span>
          </motion.button>
        </div>

        {/* Search */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search groups or teachers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
            />
          </div>
          
          {filteredGroups.length !== groups.length && (
            <div className="mt-4 text-sm text-slate-600">
              Showing {filteredGroups.length} of {groups.length} groups
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {/* Groups Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredGroups.map((group, index) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20 hover:shadow-xl transition-all duration-300 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                        {group.name}
                      </h3>
                      <div className="flex items-center space-x-1 mt-1">
                        <User className="w-3 h-3 text-slate-400" />
                        <span className="text-sm text-slate-500">{group.teacher}</span>
                      </div>
                    </div>
                  </div>
                  <div className="relative group/menu">
                    <button className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                      <MoreVertical className="w-4 h-4 text-slate-400" />
                    </button>
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-2 opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all duration-200 z-10">
                      <button 
                        onClick={() => handleViewMembers(group)}
                        className="flex items-center space-x-2 w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Users className="w-4 h-4" />
                        <span>Manage Members</span>
                      </button>
                      <button className="flex items-center space-x-2 w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 transition-colors">
                        <Eye className="w-4 h-4" />
                        <span>View Details</span>
                      </button>
                      <button className="flex items-center space-x-2 w-full px-4 py-2 text-left text-slate-700 hover:bg-slate-50 transition-colors">
                        <Edit className="w-4 h-4" />
                        <span>Edit Group</span>
                      </button>
                      <button 
                        onClick={() => handleDeleteGroup(group.id)}
                        className="flex items-center space-x-2 w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete Group</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-slate-50 rounded-xl">
                      <div className="text-2xl font-bold text-slate-800">{group.studentCount || 0}</div>
                      <div className="text-xs text-slate-500">Students</div>
                    </div>
                    <div className="text-center p-3 bg-slate-50 rounded-xl">
                      <div className="text-2xl font-bold text-slate-800">{(group.progress || 0).toFixed(0)}%</div>
                      <div className="text-xs text-slate-500">Progress</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">{group.schedule || 'No Schedule'}</span>
                    </div>
                    {group.nextSession && (
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-600">
                          Next: {new Date(group.nextSession).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center space-x-2">
                      <BookOpen className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">
                        {group.completedSessions || 0}/{group.totalSessions || 0} sessions
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={getStatusBadge(group.status || 'active')}>
                      {(group.status || 'active').charAt(0).toUpperCase() + (group.status || 'active').slice(1)}
                    </span>
                    <div className="text-xs text-slate-400">
                      Created {new Date(group.created_at || new Date()).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${group.progress || 0}%` }}
                      transition={{ delay: index * 0.1 + 0.3, duration: 0.8 }}
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full"
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Empty State */}
        {!loading && filteredGroups.length === 0 && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-12 shadow-lg border border-white/20 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">No groups found</h3>
            <p className="text-slate-600 mb-6">
              {groups.length === 0
                ? "Start by creating your first Tahfiz group."
                : "No groups match your current search criteria."
              }
            </p>
            {groups.length === 0 && (
              <motion.button
                onClick={() => setShowAddModal(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2 mx-auto"
              >
                <Plus className="w-5 h-5" />
                <span>Create First Group</span>
              </motion.button>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-lg animate-pulse">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-12 h-12 bg-slate-200 rounded-xl" />
                  <div className="space-y-2">
                    <div className="h-4 bg-slate-200 rounded w-32" />
                    <div className="h-3 bg-slate-200 rounded w-24" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-16 bg-slate-200 rounded-xl" />
                    <div className="h-16 bg-slate-200 rounded-xl" />
                  </div>
                  <div className="h-2 bg-slate-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Group Modal */}
        <AnimatePresence>
          {showAddModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Create New Group</h2>
                    <p className="text-sm text-slate-600">Add a new Tahfiz group</p>
                  </div>
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <form onSubmit={handleCreateGroup} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Group Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="e.g., Halaqah Al-Fajr"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Teacher *</label>
                    <select 
                      value={formData.teacher_id}
                      onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      required
                    >
                      <option value="">Select teacher</option>
                      {teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.first_name} {teacher.last_name} - {teacher.subject}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Schedule</label>
                    <input
                      type="text"
                      value={formData.schedule}
                      onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="e.g., Mon, Wed, Fri - 9:00 AM"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                      placeholder="Additional notes about the group..."
                    />
                  </div>
                  
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creating}
                      className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      {creating ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Creating...</span>
                        </>
                      ) : (
                        <>
                          <Users className="w-4 h-4" />
                          <span>Create Group</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Group Members Modal */}
        <GroupMembersModal
          isOpen={showMembersModal}
          onClose={() => {
            setShowMembersModal(false);
            setSelectedGroupForMembers(null);
          }}
          group={selectedGroupForMembers}
          schoolId={schoolId}
          onMembersChanged={handleMembersChanged}
        />
      </div>
    </div>
  );
}