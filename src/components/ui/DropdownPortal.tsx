import { Fragment, ReactNode } from 'react';
import { Listbox, Transition } from '@headlessui/react';

/**
 * Enhanced dropdown portal for Listbox options
 * Prevents clipping by overflow:hidden containers
 * Uses portal rendering to escape parent constraints
 */
export const DropdownPortal: React.FC<{
  children: ReactNode;
  className?: string;
}> = ({ children, className = '' }) => {
  return (
    <Transition
      as={Fragment}
      leave="transition ease-in duration-100"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
    >
      <Listbox.Options
        className={`
          absolute z-50 mt-1 left-0 right-0 max-h-80 overflow-y-auto 
          rounded-xl border border-white/30 dark:border-white/10 
          bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl 
          p-1 text-sm ring-1 ring-black/5 dark:ring-white/10
          ${className}
        `}
        style={{
          minWidth: '100%',
          maxHeight: '320px',
          position: 'absolute',
          zIndex: 50,
        }}
      >
        {children}
      </Listbox.Options>
    </Transition>
  );
};

export default DropdownPortal;
