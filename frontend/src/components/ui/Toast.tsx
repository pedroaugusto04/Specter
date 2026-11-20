'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastType = 'warning' | 'error' | 'info' | 'success';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = React.useCallback(
    (toast: Omit<ToastMessage, 'id'>, autoDismissMs = 8000) => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev, { id, ...toast }]);
      if (autoDismissMs > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, autoDismissMs);
      }
      return id;
    },
    []
  );

  return { toasts, addToast, removeToast };
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <aside
      aria-label="Notifications"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-md w-full px-4 sm:px-0 pointer-events-none"
    >
      {toasts.map((toast) => {
        const isWarning = toast.type === 'warning';
        const isError = toast.type === 'error';
        const isSuccess = toast.type === 'success';

        return (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg backdrop-blur-md transition-all duration-200',
              isWarning && 'border-amber-500/30 bg-card text-foreground',
              isError && 'border-red-500/30 bg-card text-foreground',
              isSuccess && 'border-emerald-500/30 bg-card text-foreground',
              !isWarning && !isError && !isSuccess && 'border-border bg-card text-foreground'
            )}
          >
            {isWarning && <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />}
            {isError && <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />}
            {isSuccess && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />}
            {!isWarning && !isError && !isSuccess && (
              <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            )}

            <div className="flex-1 space-y-1 min-w-0">
              {toast.title && (
                <p
                  className={cn(
                    'text-xs font-mono font-medium uppercase tracking-wider',
                    isWarning && 'text-amber-500',
                    isError && 'text-red-500',
                    isSuccess && 'text-emerald-500',
                    !isWarning && !isError && !isSuccess && 'text-muted-foreground'
                  )}
                >
                  {toast.title}
                </p>
              )}
              <p className="text-sm leading-relaxed text-foreground">{toast.message}</p>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1 rounded cursor-pointer transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </aside>
  );
}
