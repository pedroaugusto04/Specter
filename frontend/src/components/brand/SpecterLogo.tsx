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
    sm: { icon: 'h-6 w-6 rounded-md', text: 'text-sm' },
    md: { icon: 'h-8 w-8 rounded-lg', text: 'text-base' },
    lg: { icon: 'h-10 w-10 rounded-lg', text: 'text-lg' },
  };

  const currentSize = sizeMap[size];

  return (
    <div className={cn('flex items-center gap-2.5 select-none', className)}>
      {/* Minimalist Viewfinder / Target Brandmark */}
      <div
        className={cn(
          'relative flex items-center justify-center bg-zinc-950 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-950 shrink-0 shadow-xs',
          currentSize.icon
        )}
      >
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full p-1"
        >
          <path
            d="M8 13V8.5C8 8.22386 8.22386 8 8.5 8H13"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M19 8H23.5C23.7761 8 24 8.22386 24 8.5V13"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 19V23.5C8 23.7761 8.22386 24 8.5 24H13"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M19 24H23.5C23.7761 24 24 23.7761 24 23.5V19"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="16" cy="16" r="2.5" fill="currentColor" />
        </svg>
      </div>

      {/* Brand Name */}
      {showWordmark && (
        <span
          className={cn(
            'font-semibold tracking-tight text-foreground',
            currentSize.text
          )}
        >
          Specter
        </span>
      )}
    </div>
  );
}
