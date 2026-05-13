import { create } from 'zustand';
import { generateId } from '@/lib/id';
import { hapticError, hapticSuccess, haptic } from '@/lib/haptic';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, variant?: ToastVariant) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, variant = 'success') => {
    const toast: Toast = { id: generateId(), message, variant };
    set({ toasts: [...get().toasts, toast] });
    if (variant === 'error') hapticError();
    else if (variant === 'success') hapticSuccess();
    else haptic('light');
    setTimeout(() => {
      set({ toasts: get().toasts.filter((t) => t.id !== toast.id) });
    }, 3000);
  },
  dismiss: (id) => {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
