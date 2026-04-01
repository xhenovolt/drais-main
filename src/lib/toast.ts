/**
 * src/lib/toast.ts
 * Centralized toast notification system using SweetAlert2.
 * Every user-facing action MUST produce visible feedback through this API.
 */
import Swal from 'sweetalert2';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export function showToast(type: ToastType, message: string) {
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: type,
    title: message,
    showConfirmButton: false,
    timer: type === 'error' ? 4000 : 2500,
    timerProgressBar: true,
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
  confirmText = 'Yes, proceed'
): Promise<boolean> {
  const result = await Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: confirmText,
  });
  return result.isConfirmed;
}
