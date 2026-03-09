"use client";
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Phone, MessageSquare, Edit2, Trash2, Mail, MapPin, Briefcase } from 'lucide-react';
import { toast } from 'react-hot-toast';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import EditContactModal from './EditContactModal';
import SMSComposerModal from './SMSComposerModal';

interface ContactsListModalProps {
  open: boolean;
  onClose: () => void;
  studentId?: string;
  studentName?: string;
}

const ContactsListModal: React.FC<ContactsListModalProps> = ({ open, onClose, studentId, studentName }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingContact, setEditingContact] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSMSModal, setShowSMSModal] = useState(false);
  const [selectedContactForSMS, setSelectedContactForSMS] = useState<any>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Fetch contacts for this student
  const { data: contactsData, mutate } = useSWR(
    studentId ? `/api/students/contacts?student_id=${studentId}` : null,
    fetcher
  );

  const contacts = contactsData?.data || [];

  // Filter and search contacts
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const query = searchQuery.toLowerCase();
    return contacts.filter((contact: any) => 
      contact.contact_phone?.toLowerCase().includes(query) ||
      contact.contact_first_name?.toLowerCase().includes(query) ||
      contact.contact_last_name?.toLowerCase().includes(query) ||
      contact.relationship?.toLowerCase().includes(query)
    );
  }, [searchQuery, contacts]);

  const handleEdit = (contact: any) => {
    setEditingContact(contact);
    setShowEditModal(true);
  };

  const handleDelete = async (contactId: string) => {
    if (!confirm('Delete this contact?')) return;

    setDeleting(contactId);
    try {
      const response = await fetch(`/api/students/contacts/${contactId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success('Contact deleted');
        mutate();
      } else {
        toast.error('Failed to delete contact');
      }
    } catch (err) {
      toast.error('Error deleting contact');
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  const handleCall = (phoneNumber: string, contactName: string) => {
    // Open phone dialer
    window.location.href = `tel:${phoneNumber}`;
    toast.success(`Opening dialer for ${contactName}`);
  };

  const handleSMS = (contact: any) => {
    setSelectedContactForSMS(contact);
    setShowSMSModal(true);
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    setEditingContact(null);
    mutate();
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Contacts
              </h2>
              {studentName && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  for {studentName}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, phone, or relationship..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white text-sm"
              />
            </div>
          </div>

          {/* Contacts List */}
          <div className="overflow-y-auto flex-1">
            {filteredContacts.length === 0 ? (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                <Phone className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {searchQuery.trim() ? 'No contacts match your search' : 'No contacts added yet'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                <AnimatePresence>
                  {filteredContacts.map((contact: any) => (
                    <motion.div
                      key={contact.contact_id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {/* Contact Name and Phone */}
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                              <Phone className="w-5 h-5 text-blue-600 dark:text-blue-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 dark:text-white truncate">
                                {contact.contact_first_name} {contact.contact_last_name}
                              </p>
                              <p className="text-sm text-blue-600 dark:text-blue-400 font-mono">
                                {contact.contact_phone}
                              </p>
                            </div>
                            {contact.is_primary && (
                              <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-medium rounded">
                                Primary
                              </span>
                            )}
                          </div>

                          {/* Contact Details */}
                          <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 ml-12">
                            {contact.relationship && (
                              <p className="flex items-center gap-1">
                                <span className="text-gray-400">•</span> {contact.relationship}
                              </p>
                            )}
                            {contact.contact_type && (
                              <p className="flex items-center gap-1">
                                <Briefcase className="w-3 h-3" /> {contact.contact_type}
                              </p>
                            )}
                            {contact.contact_email && (
                              <p className="flex items-center gap-1">
                                <Mail className="w-3 h-3" /> {contact.contact_email}
                              </p>
                            )}
                            {contact.contact_address && (
                              <p className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {contact.contact_address}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleCall(contact.contact_phone, contact.contact_first_name)}
                            className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                            title="Call"
                          >
                            <Phone className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleSMS(contact)}
                            className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                            title="Send SMS"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(contact)}
                            className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(contact.contact_id)}
                            disabled={deleting === contact.contact_id}
                            className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
            <button
              onClick={onClose}
              className="w-full py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors font-medium text-sm"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>

      {/* Edit Contact Modal */}
      <EditContactModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        contact={editingContact}
        onSuccess={handleEditSuccess}
      />

      {/* SMS Composer Modal */}
      <SMSComposerModal
        open={showSMSModal}
        onClose={() => setShowSMSModal(false)}
        contact={selectedContactForSMS}
      />
    </>
  );
};

export default ContactsListModal;
