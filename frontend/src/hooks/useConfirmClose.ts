'use client';

import * as React from 'react';
import { useModal } from '@/components/ui/modal-dialog';

export interface UseConfirmCloseOptions {
  isOpen: boolean;
  onClose: () => void;
  isDirty?: boolean;
  confirmTitle?: string;
  confirmMessage?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function useConfirmClose({
  isOpen,
  onClose,
  isDirty = false,
  confirmTitle = 'Unsaved Changes',
  confirmMessage = 'You have unsaved changes in this form. Are you sure you want to discard them and close?',
  confirmLabel = 'Discard Changes',
  cancelLabel = 'Keep Editing',
}: UseConfirmCloseOptions) {
  const modal = useModal();

  const requestClose = React.useCallback(async (): Promise<boolean> => {
    if (!isDirty) {
      onClose();
      return true;
    }

    const shouldClose = await modal.confirm({
      title: confirmTitle,
      message: confirmMessage,
      confirmLabel,
      cancelLabel,
      variant: 'destructive',
    });

    if (shouldClose) {
      onClose();
      return true;
    }

    return false;
  }, [isDirty, onClose, modal, confirmTitle, confirmMessage, confirmLabel, cancelLabel]);

  const onBackdropClick = React.useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        void requestClose();
      }
    },
    [requestClose]
  );

  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void requestClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, requestClose]);

  return {
    requestClose,
    onBackdropClick,
  };
}
