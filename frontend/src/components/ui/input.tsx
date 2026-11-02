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
        'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground disabled:cursor-not-allowed disabled:opacity-50',
        hasError &&
          'border-red-600 text-foreground placeholder:text-muted-foreground focus-visible:border-red-600 focus-visible:ring-red-600/20 bg-red-50/40 dark:border-red-500/80 dark:bg-red-950/20',
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
        'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground disabled:cursor-not-allowed disabled:opacity-50',
        hasError &&
          'border-red-600 text-foreground placeholder:text-muted-foreground focus-visible:border-red-600 focus-visible:ring-red-600/20 bg-red-50/40 dark:border-red-500/80 dark:bg-red-950/20',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
