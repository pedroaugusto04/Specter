'use client';

import * as React from 'react';
import { AlertTriangle, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'destructive' | 'default';
}

export interface AlertOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
}

interface DialogState {
  isOpen: boolean;
  type: 'confirm' | 'alert';
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: 'destructive' | 'default';
  resolve: (value: boolean) => void;
}

interface ModalContextType {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (options: AlertOptions | string) => Promise<void>;
}

const ModalContext = React.createContext<ModalContextType | null>(null);

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [dialogState, setDialogState] = React.useState<DialogState>({
    isOpen: false,
    type: 'confirm',
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    variant: 'default',
    resolve: () => {},
  });

  const confirm = React.useCallback((options: ConfirmOptions | string): Promise<boolean> => {
    return new Promise((resolve) => {
      const opts = typeof options === 'string' ? { message: options } : options;
      setDialogState({
        isOpen: true,
        type: 'confirm',
        title: opts.title ?? 'Confirm Action',
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        cancelLabel: opts.cancelLabel ?? 'Cancel',
        variant: opts.variant ?? 'destructive',
        resolve,
      });
    });
  }, []);

  const alert = React.useCallback((options: AlertOptions | string): Promise<void> => {
    return new Promise((resolve) => {
      const opts = typeof options === 'string' ? { message: options } : options;
      setDialogState({
        isOpen: true,
        type: 'alert',
        title: opts.title ?? 'Notice',
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'OK',
        cancelLabel: '',
        variant: 'default',
        resolve: () => resolve(),
      });
    });
  }, []);

  const handleConfirm = React.useCallback(() => {
    dialogState.resolve(true);
    setDialogState((prev) => ({ ...prev, isOpen: false }));
  }, [dialogState]);

  const handleCancel = React.useCallback(() => {
    dialogState.resolve(false);
    setDialogState((prev) => ({ ...prev, isOpen: false }));
  }, [dialogState]);

  React.useEffect(() => {
    if (!dialogState.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [dialogState.isOpen, handleCancel]);

  return (
    <ModalContext.Provider value={{ confirm, alert }}>
      {children}

      {dialogState.isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 dark:bg-black/75 backdrop-blur-[2px] cursor-pointer"
          role="dialog"
          aria-modal="true"
          onClick={handleCancel}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-card text-card-foreground p-6 shadow-xl cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
                    dialogState.variant === 'destructive'
                      ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-950/50 dark:border-red-900/50 dark:text-red-400'
                      : 'bg-muted border-border text-foreground'
                  }`}
                >
                  {dialogState.variant === 'destructive' ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <Info className="h-4 w-4" />
                  )}
                </div>
                <h3 className="text-sm font-semibold text-foreground leading-snug">
                  {dialogState.title}
                </h3>
              </div>
              <button
                onClick={handleCancel}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
              {dialogState.message}
            </p>

            <div className="mt-6 flex justify-end gap-2">
              {dialogState.type === 'confirm' && (
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  {dialogState.cancelLabel}
                </Button>
              )}
              <Button
                variant={dialogState.variant === 'destructive' ? 'destructive' : 'default'}
                size="sm"
                onClick={handleConfirm}
                autoFocus
              >
                {dialogState.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = React.useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}
