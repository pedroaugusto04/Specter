'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { ApiError, api, type UserDto } from '@/lib/api';

export interface AuthFormProps {
  initialEmail?: string;
  defaultMode?: 'login' | 'register';
  onSuccess: (user: UserDto) => void | Promise<void>;
  onGoogleBeforeRedirect?: () => void;
  onBack?: () => void;
}

export function AuthForm({
  initialEmail = '',
  defaultMode = 'login',
  onSuccess,
  onGoogleBeforeRedirect,
  onBack,
}: AuthFormProps) {
  const [mode, setMode] = React.useState<'login' | 'register'>(defaultMode);
  const [email, setEmail] = React.useState(initialEmail);
  const [password, setPassword] = React.useState('');
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<{ email?: string; password?: string; terms?: string }>({});
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initialEmail && !email) {
      setEmail(initialEmail);
    }
  }, [initialEmail, email]);

  const handleGoogleLogin = () => {
    if (mode === 'register' && !termsAccepted) {
      setFieldErrors((prev) => ({
        ...prev,
        terms: 'You must agree to the Terms of Service and Privacy Policy to create an account.',
      }));
      return;
    }
    onGoogleBeforeRedirect?.();
    window.location.href = api.getGoogleAuthUrl();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    setFieldErrors({});

    const trimmedEmail = email.trim();
    const errors: { email?: string; password?: string; terms?: string } = {};

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = 'Enter a valid email address.';
    }
    if (mode === 'register' && password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    } else if (!password) {
      errors.password = 'Enter your password.';
    }

    if (mode === 'register' && !termsAccepted) {
      errors.terms = 'You must agree to the Terms of Service and Privacy Policy.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    try {
      const user =
        mode === 'register'
          ? await api.register({ email: trimmedEmail, password })
          : await api.login({ email: trimmedEmail, password });
      await onSuccess(user);
    } catch (err) {
      if (err instanceof ApiError) {
        if (Object.keys(err.fieldErrors).length > 0) {
          setFieldErrors((prev) => ({ ...prev, ...err.fieldErrors }));
          return;
        }
        setGlobalError(err.message);
      } else if (err instanceof Error) {
        setGlobalError(err.message);
      } else {
        setGlobalError('Authentication failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode Switcher */}
      <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted/50 p-1">
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setFieldErrors({});
            setGlobalError(null);
          }}
          className={`rounded py-1.5 text-xs sm:text-sm font-medium transition-colors ${
            mode === 'login'
              ? 'bg-card text-foreground shadow-2xs border border-border/80'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setFieldErrors({});
            setGlobalError(null);
          }}
          className={`rounded py-1.5 text-xs sm:text-sm font-medium transition-colors ${
            mode === 'register'
              ? 'bg-card text-foreground shadow-2xs border border-border/80'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Create Account
        </button>
      </div>

      {/* Google OAuth Button */}
      <Button
        type="button"
        variant="outline"
        className="w-full h-10 text-sm font-medium gap-2.5"
        onClick={handleGoogleLogin}
        disabled={loading || (mode === 'register' && !termsAccepted)}
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        <span>Continue with Google</span>
      </Button>

      {mode === 'register' && !termsAccepted && (
        <p className="text-[11px] text-muted-foreground text-center">
          Please accept the terms and privacy policy below before continuing with Google.
        </p>
      )}

      <div className="relative flex items-center py-1">
        <div className="grow border-t border-border" />
        <span className="mx-3 shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          or
        </span>
        <div className="grow border-t border-border" />
      </div>

      {/* Email & Password Form */}
      <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
        <FormField label="Email" htmlFor="auth-email" required error={fieldErrors.email}>
          <Input
            id="auth-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            hasError={Boolean(fieldErrors.email)}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
            }}
          />
        </FormField>

        <FormField label="Password" htmlFor="auth-password" required error={fieldErrors.password}>
          <Input
            id="auth-password"
            type="password"
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            placeholder={mode === 'register' ? 'Min. 8 characters' : '••••••••'}
            value={password}
            hasError={Boolean(fieldErrors.password)}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
            }}
          />
        </FormField>

        {mode === 'register' && (
          <div className="space-y-1.5 pt-1">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                id="terms-checkbox"
                checked={termsAccepted}
                onChange={(e) => {
                  setTermsAccepted(e.target.checked);
                  if (fieldErrors.terms) {
                    setFieldErrors((prev) => ({ ...prev, terms: undefined }));
                  }
                }}
                className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary shrink-0"
              />
              <span className="text-xs text-muted-foreground leading-snug">
                I agree to the{' '}
                <Link
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline hover:text-primary transition-colors"
                >
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground underline hover:text-primary transition-colors"
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
            {fieldErrors.terms && (
              <p className="text-[11px] text-red-600 dark:text-red-400 pl-6.5">
                {fieldErrors.terms}
              </p>
            )}
          </div>
        )}

        {globalError && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            {globalError}
          </div>
        )}

        <div className="flex items-center justify-between gap-2.5 pt-2">
          {onBack ? (
            <Button
              type="button"
              variant="ghost"
              className="h-10 px-3 text-xs sm:text-sm gap-1.5"
              onClick={onBack}
              disabled={loading}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </Button>
          ) : (
            <div />
          )}

          <Button
            type="submit"
            className="h-10 px-5 text-sm ml-auto"
            disabled={loading || (mode === 'register' && !termsAccepted)}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{mode === 'register' ? 'Create Account' : 'Sign In'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
