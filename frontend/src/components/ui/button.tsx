import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
      default:
        'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm disabled:opacity-50',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50',
      outline:
        'border border-border bg-card hover:bg-muted text-foreground hover:text-foreground disabled:bg-muted/40 disabled:text-muted-foreground disabled:border-border',
      destructive:
        'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm disabled:opacity-50',
      ghost: 'hover:bg-muted hover:text-foreground text-muted-foreground',
    };

    const sizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
      default: 'h-9 px-4 py-2 text-sm',
      sm: 'h-8 rounded-md px-3 text-xs',
      lg: 'h-10 rounded-md px-6 text-sm',
      icon: 'h-8 w-8',
    };

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:shadow-none disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
