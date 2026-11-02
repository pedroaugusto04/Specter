import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  error?: string | null;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="flex items-center gap-1 text-xs font-medium text-foreground"
        >
          <span>{label}</span>
          {required && (
            <span className="text-red-400 font-semibold" title="Required field" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      {children}

      {error ? (
        <p
          id={htmlFor ? `${htmlFor}-error` : undefined}
          role="alert"
          aria-live="polite"
          className="flex items-start gap-1.5 pt-0.5 text-xs font-medium text-red-400 animate-in fade-in-50 duration-200"
        >
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-red-400" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <div
          id={htmlFor ? `${htmlFor}-hint` : undefined}
          className="text-[11px] text-muted-foreground"
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}
