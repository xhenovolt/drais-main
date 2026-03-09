"use client";
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, MessageSquare, Phone, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface SMSComposerModalProps {
  open: boolean;
  onClose: () => void;
  contact?: any;
}

const SMSComposerModal: React.FC<SMSComposerModalProps> = ({ open, onClose, contact }) => {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [maxChars] = useState(160);

  const handleSendSMS = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) {
      toast.error('Message cannot be empty');
      return;
    }

    if (!contact?.contact_phone) {
      toast.error('No phone number available');
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
        toast.success(`✓ SMS sent to ${contact.contact_first_name}`);
        setSentCount(sentCount + 1);
        setMessage('');
        
        // Auto-close after 2 seconds
        setTimeout(() => {
          onClose();
          setSentCount(0);
        }, 2000);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to send SMS');
      }
    } catch (err) {
      toast.error('Error sending SMS');
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
              Send SMS
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
              <p className="text-sm text-gray-600 dark:text-gray-400">Sending to</p>
              <p className="font-semibold text-gray-900 dark:text-white">
                {contact.contact_first_name} {contact.contact_last_name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {contact.contact_phone}
              </p>
            </div>
          </div>
        </div>

        {/* Message Composer */}
        <form onSubmit={handleSendSMS} className="p-6 space-y-4">
          {/* Message Box */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, maxChars * 3))} // Allow ~3 SMS
              placeholder="Type your message here..."
              maxLength={maxChars * 3}
              rows={5}
              autoFocus
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-slate-700 dark:text-white resize-none"
            />
            
            {/* Character Count */}
            <div className="mt-2 flex items-center justify-between text-xs">
              <div className="text-gray-600 dark:text-gray-400">
                <span className={charCount > maxChars * 2 ? 'text-orange-600 dark:text-orange-400 font-medium' : ''}>
                  {charCount}
                </span>
                <span className="text-gray-500"> / {maxChars * 3}</span>
              </div>
              <div className="text-gray-700 dark:text-gray-300 font-medium">
                SMS: <span className={smsCount > 1 ? 'text-blue-600 dark:text-blue-400' : ''}>{smsCount}</span>
              </div>
            </div>
          </div>

          {/* Predefined Templates */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase">
              Quick Templates
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMessage("Hi, this is a message from the school regarding your ward's status.")}
                className="px-3 py-2 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                School Update
              </button>
              <button
                type="button"
                onClick={() => setMessage("Your ward has pending payments. Please contact the school office for details.")}
                className="px-3 py-2 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                Fees Reminder
              </button>
              <button
                type="button"
                onClick={() => setMessage("Greetings! How are you doing today?")}
                className="px-3 py-2 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                Greeting
              </button>
              <button
                type="button"
                onClick={() => setMessage("Your child has achieved excellent results. Well done!")}
                className="px-3 py-2 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                Congratulations
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
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !message.trim()}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 font-medium text-sm flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {loading ? 'Sending...' : 'Send SMS'}
            </button>
          </div>

          {/* Note */}
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Messages are sent via AFRICASTALKING. Standard SMS rates may apply.
          </p>
        </form>
      </motion.div>
    </div>
  );
};

export default SMSComposerModal;
