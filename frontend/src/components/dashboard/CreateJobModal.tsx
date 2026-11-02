'use client';

import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { CreateJobForm } from './CreateJobForm';

export interface CreateJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateJobModal({ isOpen, onClose, onCreated }: CreateJobModalProps) {
  const [isDirty, setIsDirty] = React.useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      setIsDirty(false);
    }
  }, [isOpen]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      isDirty={isDirty}
      title="New Monitor"
      description="Configure target website URL, extraction instructions, and check interval."
      confirmTitle="Discard Unsaved Changes?"
      confirmMessage="You have unsaved changes. Closing now will discard your input. Are you sure you want to close?"
    >
      <CreateJobForm
        isModal
        onCreated={() => {
          setIsDirty(false);
          onClose();
          onCreated();
        }}
        onCancel={onClose}
        onDirtyChange={setIsDirty}
      />
    </Dialog>
  );
}
