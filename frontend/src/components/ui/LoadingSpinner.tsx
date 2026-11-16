import * as React from 'react';
import { cn } from '@/lib/utils';

export interface LoadingSpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}

export function LoadingSpinner({ className, size = 'xs', ...props }: LoadingSpinnerProps) {
  const sizeClasses = {
    xs: 'h-2.5 w-2.5',
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('animate-spin shrink-0 text-current', sizeClasses[size], className)}
      {...props}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.75"
      />
      <path
        className="opacity-90"
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
      />
    </svg>
  );
}
