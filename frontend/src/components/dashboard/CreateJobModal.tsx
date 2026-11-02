'use client';

import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import type { UserDto } from '@/lib/api';
import { CreateJobForm } from './CreateJobForm';

export interface CreateJobModalProps {
  isOpen: boolean;
  user?: UserDto | null;
  onAuthenticated?: (user: UserDto) => void;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateJobModal({
  isOpen,
  user,
  onAuthenticated,
  onClose,
  onCreated,
}: CreateJobModalProps) {
  const [isDirty, setIsDirty] = React.useState(false);
  const [step, setStep] = React.useState<'form' | 'auth'>('form');

  React.useEffect(() => {
    if (!isOpen) {
      setIsDirty(false);
      setStep('form');
    }
  }, [isOpen]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      isDirty={isDirty}
      title={step === 'auth' ? 'Sign in to activate monitor' : 'New Monitor'}
      description={
        step === 'auth'
          ? undefined
          : 'Configure target website URL, extraction instructions, and check interval.'
      }
      maxWidthClass={step === 'auth' ? 'max-w-md' : 'max-w-2xl sm:max-w-3xl'}
      confirmTitle="Discard Unsaved Changes?"
      confirmMessage="You have unsaved changes. Closing now will discard your input. Are you sure you want to close?"
    >
      <CreateJobForm
        isModal
        user={user}
        onAuthenticated={onAuthenticated}
        onStepChange={setStep}
        onCreated={() => {
          setIsDirty(false);
          setStep('form');
          onClose();
          onCreated();
        }}
        onCancel={onClose}
        onDirtyChange={setIsDirty}
      />
    </Dialog>
  );
}
