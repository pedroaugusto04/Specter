import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, hasError, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={hasError ? true : props['aria-invalid']}
      className={cn(
        'flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:cursor-not-allowed disabled:opacity-50',
        hasError &&
          'border-red-400 text-red-950 placeholder:text-red-300 focus-visible:border-red-500 focus-visible:ring-red-500/30 bg-red-50/20',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  hasError?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, hasError, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={hasError ? true : props['aria-invalid']}
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:cursor-not-allowed disabled:opacity-50',
        hasError &&
          'border-red-400 text-red-950 placeholder:text-red-300 focus-visible:border-red-500 focus-visible:ring-red-500/30 bg-red-50/20',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
