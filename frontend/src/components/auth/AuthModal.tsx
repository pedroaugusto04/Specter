'use client';

import { Dialog } from '@/components/ui/dialog';
import type { UserDto } from '@/lib/api';
import { AuthForm } from './AuthForm';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (user: UserDto) => void;
  initialError?: string;
}

export function AuthModal({
  isOpen,
  onClose,
  onAuthenticated,
  initialError,
}: AuthModalProps) {
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Account" maxWidthClass="max-w-md">
      <AuthForm
        initialError={initialError}
        onSuccess={(user) => {
          onAuthenticated(user);
          onClose();
        }}
      />
    </Dialog>
  );
}
