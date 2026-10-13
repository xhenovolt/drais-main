"use client";
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, MessageSquare, Phone, Send } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { toast } from 'react-hot-toast';
import { mutate as globalMutate } from 'swr';

interface SMSComposerModalProps {
  open: boolean;
  onClose: () => void;
  contact?: any;
}

const SMSComposerModal: React.FC<SMSComposerModalProps> = ({ open, onClose, contact }) => {
  const { t, rich, digits } = useI18n();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [maxChars] = useState(160);

  const handleSendSMS = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) {
      toast.error(t('students.contacts.smsForm.empty'));
      return;
    }

    if (!contact?.contact_phone) {
      toast.error(t('students.contacts.smsForm.noPhone'));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: contact.contact_phone,
          message: message,
          recipient_name: `${contact.contact_first_name} ${contact.contact_last_name}`.trim()
        })
      });

      if (response.ok) {
        const data = await response.json();
        toast.success(t('students.contacts.smsForm.sentTo', { name: contact.contact_first_name }));
        globalMutate('/api/sms/quota');
        setSentCount(sentCount + 1);
        setMessage('');
        
        // Auto-close after 2 seconds
        setTimeout(() => {
          onClose();
          setSentCount(0);
        }, 2000);
      } else {
        const error = await response.json();
        toast.error(error.error || t('students.contacts.smsForm.failed'));
      }
    } catch (err) {
      toast.error(t('students.contacts.smsForm.error'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!open || !contact) return null;

  const charCount = message.length;
  const smsCount = Math.ceil(charCount / maxChars) || 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              {t('students.contacts.sendSms')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Recipient Info */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 space-y-3">
          <div className="bg-purple-50 dark:bg-slate-700 p-4 rounded-lg flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-200 dark:bg-purple-900 flex items-center justify-center">
              <Phone className="w-5 h-5 text-purple-600 dark:text-purple-300" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('students.contacts.smsForm.sendingTo')}</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {contact.contact_first_name} {contact.contact_last_name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {digits(contact.contact_phone)}
              </p>
            </div>
          </div>
        </div>

        {/* Message Composer */}
        <form onSubmit={handleSendSMS} className="p-6 space-y-4">
          {/* Message Box */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('students.contacts.smsForm.message')}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, maxChars * 3))} // Allow ~3 SMS
              placeholder={t('students.contacts.smsForm.placeholder')}
              maxLength={maxChars * 3}
              rows={5}
              autoFocus
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-slate-700 dark:text-white resize-none"
            />
            
            {/* Character Count */}
            <div className="mt-2 flex items-center justify-between text-xs">
              <div className="text-gray-600 dark:text-gray-400">
                <span className={charCount > maxChars * 2 ? 'text-orange-600 dark:text-orange-400 font-medium' : ''}>
                  {digits(charCount)}
                </span>
                <span className="text-gray-500"> / {digits(maxChars * 3)}</span>
              </div>
              <div className="text-gray-700 dark:text-gray-300 font-medium">
                {rich('students.contacts.smsForm.smsCount', { count: <span className={smsCount > 1 ? 'text-blue-600 dark:text-blue-400' : ''}>{digits(smsCount)}</span> })}
              </div>
            </div>
          </div>

          {/* Predefined Templates */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase">
              {t('students.contacts.smsForm.templates')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMessage(t('students.contacts.smsForm.tpl.updateText'))}
                className="px-3 py-2 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                {t('students.contacts.smsForm.tpl.update')}
              </button>
              <button
                type="button"
                onClick={() => setMessage(t('students.contacts.smsForm.tpl.feesText'))}
                className="px-3 py-2 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                {t('students.contacts.smsForm.tpl.fees')}
              </button>
              <button
                type="button"
                onClick={() => setMessage(t('students.contacts.smsForm.tpl.greetingText'))}
                className="px-3 py-2 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                {t('students.contacts.smsForm.tpl.greeting')}
              </button>
              <button
                type="button"
                onClick={() => setMessage(t('students.contacts.smsForm.tpl.congratsText'))}
                className="px-3 py-2 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                {t('students.contacts.smsForm.tpl.congrats')}
              </button>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
            >
              {t('students.contacts.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || !message.trim()}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 font-medium text-sm flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {loading ? t('students.contacts.smsForm.sending') : t('students.contacts.sendSms')}
            </button>
          </div>

          {/* Note */}
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            {t('students.contacts.smsForm.note')}
          </p>
        </form>
      </motion.div>
    </div>
  );
};

export default SMSComposerModal;
