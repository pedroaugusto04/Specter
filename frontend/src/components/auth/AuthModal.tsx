'use client';

import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import type { UserDto } from '@/lib/api';
import { AuthForm } from './AuthForm';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (user: UserDto) => void;
}

export function AuthModal({ isOpen, onClose, onAuthenticated }: AuthModalProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Account"
      maxWidthClass="max-w-md"
    >
      <AuthForm
        onSuccess={(user) => {
          onAuthenticated(user);
          onClose();
        }}
      />
    </Dialog>
  );
}
