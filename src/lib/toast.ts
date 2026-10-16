/**
 * src/lib/toast.ts
 * Centralized toast notification system using SweetAlert2.
 * Every user-facing action MUST produce visible feedback through this API.
 */
import Swal from 'sweetalert2';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

/** The interface language as the I18nProvider set it on <html> (no React needed here). */
export const uiIsArabic = (): boolean => typeof document !== 'undefined' && document.documentElement.lang === 'ar';
/** Text with no Arabic letters but some Latin ones — i.e. an English sentence. */
export const isEnglishText = (s: unknown): boolean => typeof s === 'string' && /[A-Za-z]/.test(s) && !/[\u0600-\u06FF]/.test(s);

export function showToast(type: ToastType, message: string) {
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: type,
    title: message,
    showConfirmButton: false,
    timer: type === 'error' ? 4000 : 2500,
    timerProgressBar: true,
    closeButtonAriaLabel: uiIsArabic() ? 'إغلاق هذه النافذة' : 'Close this dialog',
    didOpen: (toast) => {
      toast.onmouseenter = Swal.stopTimer;
      toast.onmouseleave = Swal.resumeTimer;
    },
  });
}

/** Confirmation dialog before destructive actions */
export async function confirmAction(
  title: string,
  text: string,
  confirmText?: string
): Promise<boolean> {
  const ar = uiIsArabic();
  const result = await Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: confirmText ?? (ar ? 'نعم، متابعة' : 'Yes, proceed'),
    cancelButtonText: ar ? 'إلغاء' : 'Cancel',
    closeButtonAriaLabel: ar ? 'إغلاق هذه النافذة' : 'Close this dialog',
  });
  return result.isConfirmed;
}
