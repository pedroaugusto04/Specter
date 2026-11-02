'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConfirmClose } from '@/hooks/useConfirmClose';

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
  widthClass = 'max-w-3xl',
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

  React.useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 dark:bg-black/70 backdrop-blur-[2px]"
      onClick={onBackdropClick}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`flex h-full w-full ${widthClass} flex-col border-l border-border bg-card text-card-foreground shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <div className="flex items-start justify-between border-b border-border px-6 py-4">
            <div className="min-w-0 pr-4">
              {title && (
                <div className="text-sm font-semibold text-foreground font-mono truncate">{title}</div>
              )}
              {description && (
                <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => void requestClose()}
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">{children}</div>

        {footer && (
          <div className="border-t border-border bg-muted/30 px-6 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
