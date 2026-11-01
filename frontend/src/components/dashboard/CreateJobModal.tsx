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

  // Reset dirty flag whenever modal closes
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
      title="New Autonomous Monitor"
      description="Configure target website URL, AI extraction instructions, and monitoring interval."
      confirmTitle="Discard Unsaved Changes?"
      confirmMessage="You have filled in parts of this new monitor form. Closing now will discard your input. Are you sure you want to close?"
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
