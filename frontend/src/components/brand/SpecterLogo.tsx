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
    sm: { icon: 'h-6 w-6', text: 'text-sm' },
    md: { icon: 'h-7 w-7', text: 'text-sm font-semibold tracking-tight' },
    lg: { icon: 'h-8 w-8', text: 'text-base font-semibold tracking-tight' },
  };

  const currentSize = sizeMap[size];

  return (
    <div className={cn('flex items-center gap-2.5 select-none', className)}>
      {/* Monochromatic Solid 'S' Mark */}
      <div className={cn(
        'relative flex items-center justify-center rounded-lg bg-zinc-950 border border-zinc-800 shadow-xs overflow-hidden shrink-0',
        currentSize.icon
      )}>
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full p-1"
        >
          <path
            d="M21 9.5H12.5C10.567 9.5 9 11.067 9 13C9 14.933 10.567 16.5 12.5 16.5H19.5C21.433 16.5 23 18.067 23 20C23 21.933 21.433 23.5 19.5 23.5H11"
            stroke="#FFFFFF"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {showWordmark && (
        <span className={cn('text-zinc-100', currentSize.text)}>
          Specter
        </span>
      )}
    </div>
  );
}
