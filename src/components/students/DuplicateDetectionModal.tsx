import React, { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { AlertTriangle, Check, X, User } from 'lucide-react';
import { toast } from 'react-hot-toast';
import clsx from 'clsx';

interface DuplicateStudent {
  id: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  gender?: string;
  photo_url?: string;
  class_name?: string;
  admission_date?: string;
  status?: string;
}

interface DuplicateDetectionModalProps {
  open: boolean;
  duplicates: DuplicateStudent[];
  newStudent: {
    first_name: string;
    last_name: string;
    class_name?: string;
  };
  onMerge: (primaryId: number, secondaryId: number) => Promise<void>;
  onContinue: () => void;
  onCancel: () => void;
}

export const DuplicateDetectionModal: React.FC<DuplicateDetectionModalProps> = ({
  open,
  duplicates,
  newStudent,
  onMerge,
  onContinue,
  onCancel,
}) => {
  const [selectedDuplicate, setSelectedDuplicate] = useState<number | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleMerge = async () => {
    if (!selectedDuplicate) {
      toast.error('Please select a record to merge with');
      return;
    }

    setIsMerging(true);
    try {
      await onMerge(selectedDuplicate, -1); // -1 indicates new student
      toast.success('Records merged successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to merge records');
    } finally {
      setIsMerging(false);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'suspended':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'on_leave':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  return (
    <Transition show={open} as={React.Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onCancel}>
        <Transition.Child
          as={React.Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="relative w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-6 space-y-6 border border-gray-200 dark:border-slate-700">
                {/* Header */}
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/30">
                    <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                      ⚠️ Possible Duplicate Detected
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      We found {duplicates.length} existing learner(s) with the same name. 
                      This helps prevent accidental duplicates in your system.
                    </p>
                  </div>
                  <button
                    onClick={onCancel}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>

                {/* New Student Card */}
                <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2">NEW LEARNER</p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                      {newStudent.first_name?.[0]}{newStudent.last_name?.[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {newStudent.first_name} {newStudent.last_name}
                      </p>
                      {newStudent.class_name && (
                        <p className="text-xs text-gray-600 dark:text-gray-400">{newStudent.class_name}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Existing Students - Select One to Merge */}
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Click a record below to merge or continue as separate
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {duplicates.map((dup) => (
                      <button
                        key={dup.id}
                        onClick={() => setSelectedDuplicate(dup.id)}
                        className={clsx(
                          'w-full p-4 rounded-xl border-2 transition-all text-left',
                          selectedDuplicate === dup.id
                            ? 'border-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-900/20'
                            : 'border-gray-200 dark:border-slate-700 hover:border-fuchsia-300 dark:hover:border-fuchsia-700 bg-white dark:bg-slate-800'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {selectedDuplicate === dup.id && (
                            <div className="mt-1">
                              <Check className="w-5 h-5 text-fuchsia-600 dark:text-fuchsia-400" />
                            </div>
                          )}
                          {dup.photo_url ? (
                            <img
                              src={dup.photo_url}
                              alt={`${dup.first_name} ${dup.last_name}`}
                              className="w-10 h-10 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                              {dup.first_name?.[0]}{dup.last_name?.[0]}
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-gray-900 dark:text-white">
                                {dup.first_name} {dup.last_name}
                              </p>
                              {dup.status && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(dup.status)}`}>
                                  {dup.status}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-600 dark:text-gray-400">
                              <span>Adm: {dup.admission_no}</span>
                              {dup.class_name && <span className="text-blue-600 dark:text-blue-400">• {dup.class_name}</span>}
                              {dup.admission_date && (
                                <span>• {new Date(dup.admission_date).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Don't Show Again Checkbox */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dontShowAgain}
                    onChange={(e) => setDontShowAgain(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-fuchsia-600 focus:ring-fuchsia-500"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Don't show this warning again for this combination
                  </span>
                </label>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-slate-700">
                  <button
                    onClick={onCancel}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onContinue}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-700 dark:bg-slate-700 text-white hover:bg-gray-800 dark:hover:bg-slate-600 transition-colors"
                  >
                    Continue as Separate
                  </button>
                  <button
                    onClick={handleMerge}
                    disabled={!selectedDuplicate || isMerging}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isMerging ? 'Merging...' : 'Merge Selected'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default DuplicateDetectionModal;
