'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Users, Plus, Search, Trash2, UserPlus, ArrowRightLeft,
  User, Calendar, Crown, Shield
} from 'lucide-react';
import { ToastProvider, useToast } from '@/components/ui/Toast';

interface GroupMember {
  id: number;
  group_id: number;
  student_id: number;
  first_name: string;
  last_name: string;
  admission_no: string;
  avatar?: string;
  joined_at: string;
  role: string;
}

interface AvailableStudent {
  id: number;
  first_name: string;
  last_name: string;
  admission_no: string;
  avatar?: string;
  group_id?: number;
  group_name?: string;
}

interface Group {
  id: number;
  name: string;
  teacher: string;
  studentCount: number;
}

interface GroupMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: Group | null;
  schoolId: number;
  onMembersChanged: () => void;
}

export default function GroupMembersModal({ 
  isOpen, 
  onClose, 
  group, 
  schoolId, 
  onMembersChanged 
}: GroupMembersModalProps) {
  return (
    <ToastProvider>
      <GroupMembersModalContent
        isOpen={isOpen}
        onClose={onClose}
        group={group}
        schoolId={schoolId}
        onMembersChanged={onMembersChanged}
      />
    </ToastProvider>
  );
}

function GroupMembersModalContent({
  isOpen,
  onClose,
  group,
  schoolId,
  onMembersChanged
}: GroupMembersModalProps) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [availableStudents, setAvailableStudents] = useState<AvailableStudent[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'members' | 'add' | 'transfer'>('members');
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [transferFromGroup, setTransferFromGroup] = useState('');
  const [transferToGroup, setTransferToGroup] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen && group) {
      fetchMembers();
      fetchAvailableStudents();
      fetchAllGroups();
    }
  }, [isOpen, group, schoolId]);

  const fetchMembers = async () => {
    if (!group) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/tahfiz/group-members?group_id=${group.id}`);
      const data = await response.json();
      
      if (data.success) {
        setMembers(data.data);
      } else {
        showToast('Failed to fetch group members', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('Failed to fetch group members', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableStudents = async () => {
    try {
      const response = await fetch(`/api/tahfiz/group-members?school_id=${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setAvailableStudents(data.data);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const fetchAllGroups = async () => {
    try {
      const response = await fetch(`/api/tahfiz/groups?school_id=${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setAllGroups(data.data);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleAddStudents = async () => {
    if (selectedStudents.length === 0) {
      showToast('Please select students to add', 'error');
      return;
    }

    try {
      setLoading(true);
      const promises = selectedStudents.map(studentId =>
        fetch('/api/tahfiz/group-members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            group_id: group?.id,
            student_id: studentId,
            role: 'member'
          })
        })
      );

      const responses = await Promise.all(promises);
      const results = await Promise.all(responses.map(r => r.json()));

      const failed = results.filter(r => !r.success);
      if (failed.length === 0) {
        showToast(`${selectedStudents.length} student(s) added successfully`, 'success');
        setSelectedStudents([]);
        fetchMembers();
        fetchAvailableStudents();
        onMembersChanged();
      } else {
        showToast(`${failed.length} student(s) failed to add`, 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('Failed to add students', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (memberId: number, studentName: string) => {
    if (!confirm(`Remove ${studentName} from this group?`)) return;

    try {
      const response = await fetch(`/api/tahfiz/group-members?id=${memberId}`, {
        method: 'DELETE'
      });

      const data = await response.json();
      if (data.success) {
        showToast('Student removed successfully', 'success');
        fetchMembers();
        fetchAvailableStudents();
        onMembersChanged();
      } else {
        showToast(data.message || 'Failed to remove student', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('Failed to remove student', 'error');
    }
  };

  const handleTransferStudent = async (studentId: number, studentName: string) => {
    if (!transferFromGroup || !transferToGroup) {
      showToast('Please select both source and destination groups', 'error');
      return;
    }

    if (transferFromGroup === transferToGroup) {
      showToast('Source and destination groups cannot be the same', 'error');
      return;
    }

    if (!confirm(`Transfer ${studentName} from one group to another?`)) return;

    try {
      setLoading(true);
      const response = await fetch('/api/tahfiz/group-members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          from_group_id: parseInt(transferFromGroup),
          to_group_id: parseInt(transferToGroup)
        })
      });

      const data = await response.json();
      if (data.success) {
        showToast('Student transferred successfully', 'success');
        fetchMembers();
        fetchAvailableStudents();
        onMembersChanged();
        setTransferFromGroup('');
        setTransferToGroup('');
      } else {
        showToast(data.message || 'Failed to transfer student', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      showToast('Failed to transfer student', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'leader':
        return <Crown className="w-4 h-4 text-amber-500" />;
      case 'assistant':
        return <Shield className="w-4 h-4 text-blue-500" />;
      default:
        return <User className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const filteredMembers = members.filter(member =>
    `${member.first_name} ${member.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.admission_no.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAvailableStudents = availableStudents.filter(student =>
    `${student.first_name} ${student.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.admission_no.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!group) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">Manage Group Members</h2>
                  <p className="text-sm text-muted-foreground">{group.name} • {members.length} member{members.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-muted rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border">
              {
              [{
                id: 'members',
                label: 'Current Members',
                icon: Users
              },
              {
                id: 'add',
                label: 'Add Students',
                icon: UserPlus
              },
              {
                id: 'transfer',
                label: 'Transfer Students',
                icon: ArrowRightLeft
              }
            ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 px-6 py-4 text-sm font-medium flex items-center justify-center space-x-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-b-2 border-blue-500 text-blue-600 bg-blue-50'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex flex-col h-[60vh]">
              {/* Search - Fixed at top */}
              <div className="flex-shrink-0 p-6 pb-4 border-b border-slate-100">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <input
                    type="text"
                    placeholder={`Search ${activeTab === 'members' ? 'members' : 'students'}...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                {/* Search Results Count */}
                {searchTerm && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    {activeTab === 'members' 
                      ? `${filteredMembers.length} of ${members.length} members`
                      : `${filteredAvailableStudents.length} of ${availableStudents.length} students`
                    }
                  </div>
                )}
              </div>

              {/* Scrollable Content Area */}
              <div className="flex-1 overflow-hidden">
                <div className="h-full px-6 pb-6">
                  {/* Current Members Tab */}
                  {activeTab === 'members' && (
                    <div className="h-full overflow-y-auto space-y-3 pt-4">
                      {loading ? (
                        <div className="text-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                          <p className="text-muted-foreground mt-2">Loading members...</p>
                        </div>
                      ) : filteredMembers.length === 0 ? (
                        <div className="text-center py-8">
                          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">
                            {searchTerm ? 'No members match your search' : 'No members found'}
                          </p>
                        </div>
                      ) : (
                        filteredMembers.map((member) => (
                          <motion.div
                            key={member.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center justify-between p-4 border border-border rounded-xl hover:bg-muted transition-colors"
                          >
                            <div className="flex items-center space-x-3 flex-1 min-w-0">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0">
                                {member.avatar ? (
                                  <img src={member.avatar} alt={member.first_name} className="w-full h-full object-cover" />
                                ) : (
                                  `${member.first_name.charAt(0)}${member.last_name.charAt(0)}`
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2">
                                  <h3 className="font-semibold text-foreground truncate">
                                    {member.first_name} {member.last_name}
                                  </h3>
                                  {getRoleIcon(member.role)}
                                </div>
                                <p className="text-sm text-muted-foreground truncate">{member.admission_no}</p>
                                <p className="text-xs text-muted-foreground">
                                  Joined {new Date(member.joined_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveMember(member.id, `${member.first_name} ${member.last_name}`)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 ml-2"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </motion.div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Add Students Tab - Updated */}
                  {activeTab === 'add' && (
                    <div className="h-full flex flex-col pt-4">
                      {/* Fixed Header with Actions */}
                      {selectedStudents.length > 0 && (
                        <div className="flex-shrink-0 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <span className="text-blue-700 font-medium">
                                {selectedStudents.length} of {filteredAvailableStudents.length} selected
                              </span>
                              <button
                                onClick={() => setSelectedStudents([])}
                                className="text-sm text-blue-600 hover:text-blue-800 underline"
                              >
                                Clear
                              </button>
                            </div>
                            <button
                              onClick={handleAddStudents}
                              disabled={loading}
                              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center space-x-2"
                            >
                              {loading ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Plus className="w-4 h-4" />
                              )}
                              <span>Add to Group</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Students List */}
                      <div className="flex-1 overflow-y-auto">
                        {filteredAvailableStudents.length === 0 ? (
                          <div className="text-center py-8">
                            <UserPlus className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">
                              {searchTerm ? 'No students match your search' : 'No available students'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {searchTerm ? 'Try adjusting your search terms' : 'All students are already assigned to groups'}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {/* Select All Checkbox */}
                            <div className="flex items-center p-3 bg-muted rounded-lg border sticky top-0 z-10">
                              <input
                                type="checkbox"
                                id="select-all"
                                checked={selectedStudents.length === filteredAvailableStudents.length && filteredAvailableStudents.length > 0}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStudents(filteredAvailableStudents.map(s => s.id));
                                  } else {
                                    setSelectedStudents([]);
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 bg-card border-border rounded focus:ring-blue-500 focus:ring-2"
                              />
                              <label htmlFor="select-all" className="ml-3 text-sm font-medium text-foreground">
                                {selectedStudents.length === filteredAvailableStudents.length && filteredAvailableStudents.length > 0
                                  ? `Deselect all (${filteredAvailableStudents.length})`
                                  : `Select all (${filteredAvailableStudents.length})`
                                }
                              </label>
                            </div>

                            {/* Student List */}
                            {filteredAvailableStudents.map((student, index) => (
                              <div
                                key={student.id}
                                className={`flex items-center p-3 border rounded-lg transition-all hover:bg-muted ${
                                  selectedStudents.includes(student.id)
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-border'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  id={`student-${student.id}`}
                                  checked={selectedStudents.includes(student.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedStudents(prev => [...prev, student.id]);
                                    } else {
                                      setSelectedStudents(prev => prev.filter(id => id !== student.id));
                                    }
                                  }}
                                  className="w-4 h-4 text-blue-600 bg-card border-border rounded focus:ring-blue-500 focus:ring-2"
                                />
                                
                                <label 
                                  htmlFor={`student-${student.id}`}
                                  className="flex items-center space-x-3 ml-3 flex-1 cursor-pointer min-w-0"
                                >
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm overflow-hidden flex-shrink-0">
                                    {student.avatar ? (
                                      <img src={student.avatar} alt={student.first_name} className="w-full h-full object-cover" />
                                    ) : (
                                      `${student.first_name.charAt(0)}${student.last_name.charAt(0)}`
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-foreground truncate">
                                      {student.first_name} {student.last_name}
                                    </h3>
                                    <p className="text-sm text-muted-foreground truncate">{student.admission_no}</p>
                                  </div>
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Transfer Students Tab */}
                  {activeTab === 'transfer' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">From Group</label>
                          <select
                            value={transferFromGroup}
                            onChange={(e) => setTransferFromGroup(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="">Select source group</option>
                            {allGroups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name} ({g.studentCount} members)
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-foreground mb-2">To Group</label>
                          <select
                            value={transferToGroup}
                            onChange={(e) => setTransferToGroup(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="">Select destination group</option>
                            {allGroups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name} ({g.studentCount} members)
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {transferFromGroup && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-medium text-foreground">
                            Select students to transfer:
                          </h3>
                          {/* This would show members of the selected "from" group */}
                          <div className="text-center py-8">
                            <ArrowRightLeft className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground">Select both groups to see transfer options</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end space-x-3 p-6 border-t border-border">
              <button
                onClick={onClose}
                className="px-6 py-2 border border-border text-foreground rounded-lg hover:bg-muted transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
