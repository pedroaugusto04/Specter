import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SpecterLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
}

export function SpecterLogo({
  size = 'md',
  showWordmark = true,
  className,
}: SpecterLogoProps) {
  const sizeMap = {
    sm: { icon: 'h-6 w-6 rounded-md', text: 'text-sm', badge: 'text-[10px]' },
    md: { icon: 'h-7 w-7 rounded-md', text: 'text-[15px]', badge: 'text-[10px]' },
    lg: { icon: 'h-9 w-9 rounded-lg', text: 'text-lg', badge: 'text-xs' },
  };

  const currentSize = sizeMap[size];

  return (
    <div className={cn('flex items-center gap-2.5 select-none', className)}>
      {/* Minimalist Monochrome Brandmark */}
      <div
        className={cn(
          'relative flex items-center justify-center bg-zinc-950 text-zinc-50 dark:bg-zinc-900 dark:border dark:border-zinc-800 shrink-0',
          currentSize.icon
        )}
      >
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full p-0.5"
        >
          <path
            d="M21.5 9.5H12.5C10.567 9.5 9 11.067 9 13C9 14.933 10.567 16.5 12.5 16.5H19.5C21.433 16.5 23 18.067 23 20C23 21.933 21.433 23.5 19.5 23.5H10.5"
            stroke="currentColor"
            strokeWidth="2.75"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
          <rect x="20" y="8" width="3" height="3" fill="currentColor" />
          <rect x="9" y="22" width="3" height="3" fill="currentColor" />
        </svg>
      </div>

      {/* Brand Name & Version */}
      {showWordmark && (
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'font-semibold tracking-tight text-foreground',
              currentSize.text
            )}
          >
            Specter
          </span>
          <span
            className={cn(
              'rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono font-medium text-muted-foreground leading-none',
              currentSize.badge
            )}
          >
            1.0
          </span>
        </div>
      )}
    </div>
  );
}
