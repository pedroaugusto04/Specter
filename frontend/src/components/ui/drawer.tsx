'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirmClose } from '@/hooks/useConfirmClose';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isDirty?: boolean;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
  confirmTitle?: string;
  confirmMessage?: string;
}

export function Drawer({
  isOpen,
  onClose,
  isDirty = false,
  title,
  description,
  children,
  footer,
  widthClass = 'w-full max-w-full sm:max-w-2xl lg:max-w-3xl',
  confirmTitle,
  confirmMessage,
}: DrawerProps) {
  const { requestClose, onBackdropClick } = useConfirmClose({
    isOpen,
    onClose,
    isDirty,
    confirmTitle,
    confirmMessage,
  });

  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 dark:bg-black/70 backdrop-blur-[2px]"
      onClick={onBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`flex h-full w-full ${widthClass} flex-col border-l border-border bg-card text-card-foreground shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <div className="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6 sm:py-4.5">
            <div className="min-w-0 pr-4">
              {title && (
                <div className="text-base sm:text-lg font-semibold text-foreground font-mono truncate">
                  {title}
                </div>
              )}
              {description && (
                <div className="mt-1 text-xs sm:text-sm text-muted-foreground">{description}</div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => void requestClose()}
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">{children}</div>

        {footer && (
          <div className="border-t border-border bg-muted/30 px-5 py-3.5 sm:px-6 sm:py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
