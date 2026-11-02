import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'outline';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variantClasses: Record<NonNullable<BadgeProps['variant']>, string> = {
    default: 'bg-primary text-primary-foreground border border-transparent',
    success:
      'bg-zinc-900 text-zinc-50 border border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100',
    warning:
      'bg-zinc-100 text-zinc-800 border border-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700',
    destructive:
      'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900/60',
    secondary: 'bg-muted text-muted-foreground border border-border',
    outline: 'border border-border text-foreground bg-transparent',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-mono font-medium tracking-tight',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
