import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'outline';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variantClasses: Record<NonNullable<BadgeProps['variant']>, string> = {
    default: 'bg-primary text-primary-foreground',
    success: 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60',
    warning: 'bg-amber-950/60 text-amber-400 border border-amber-800/60',
    destructive: 'bg-red-950/60 text-red-400 border border-red-800/60',
    secondary: 'bg-muted text-muted-foreground border border-border',
    outline: 'border border-border text-foreground',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
