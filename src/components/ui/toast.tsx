'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ToastVariant = 'info' | 'success' | 'error';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  action?: ToastAction;
}

interface ToastContextValue {
  show: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_ICON: Record<ToastVariant, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
};

// Ikon membawa makna finansial/status — warnanya semantik, bukan dekoratif.
const VARIANT_ICON_CLASS: Record<ToastVariant, string> = {
  info: 'text-brand',
  success: 'text-positive',
  error: 'text-negative',
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast harus dipakai di dalam <ToastProvider>');
  return ctx;
}

/**
 * Radix Toast — region live (`aria-live`) bawaan, mendukung urungkan lewat
 * `action`. Mengambang di atas bottom nav (`z-50`, dijaga oleh caller lewat
 * `--safe-b`).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((toast) => {
          const Icon = VARIANT_ICON[toast.variant];
          return (
            <ToastPrimitive.Root
              key={toast.id}
              duration={5000}
              // error → assertive (interupsi), lainnya → polite. Docs/07
              // §15 "Region live".
              type={toast.variant === 'error' ? 'foreground' : 'background'}
              onOpenChange={(open) => !open && dismiss(toast.id)}
              className={cn(
                'material-glass rounded-card shadow-float flex items-start gap-3 p-4',
                'data-[state=open]:animate-none data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]',
              )}
            >
              <Icon
                className={cn('mt-0.5 size-5 shrink-0', VARIANT_ICON_CLASS[toast.variant])}
                aria-hidden="true"
              />
              <div className="flex-1">
                <ToastPrimitive.Title className="text-text text-sm font-semibold">
                  {toast.title}
                </ToastPrimitive.Title>
                {toast.description && (
                  <ToastPrimitive.Description className="text-text-muted text-sm">
                    {toast.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              {toast.action && (
                <ToastPrimitive.Action altText={toast.action.label} asChild>
                  <button
                    type="button"
                    onClick={toast.action.onClick}
                    // text-brand-readable, bukan text-brand mentah — teks
                    // asli (bukan ikon) di atas material-glass yang pada
                    // dasarnya solid surface, lihat globals.css.
                    className="pressable rounded-inner text-brand-readable h-11 shrink-0 px-2 text-sm font-semibold"
                  >
                    {toast.action.label}
                  </button>
                </ToastPrimitive.Action>
              )}
              <ToastPrimitive.Close
                aria-label="Tutup notifikasi"
                className="pressable text-text-muted -m-2 flex size-11 shrink-0 items-center justify-center rounded-full"
              >
                <X className="size-4" aria-hidden="true" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="safe-bottom fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 p-4 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
