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
    sm: { icon: 'h-6 w-6', text: 'text-sm', badge: 'text-[9px]' },
    md: { icon: 'h-8 w-8', text: 'text-base', badge: 'text-[10px]' },
    lg: { icon: 'h-10 w-10', text: 'text-xl', badge: 'text-xs' },
  };

  const currentSize = sizeMap[size];

  return (
    <div className={cn('flex items-center gap-3 select-none', className)}>
      {/* Stealth Radar "S" Brandmark */}
      <div className="relative group">
        {/* Subtle ambient glow behind logo */}
        <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-cyan-500/20 via-indigo-500/20 to-purple-500/20 blur-xs opacity-75 group-hover:opacity-100 transition duration-300" />
        
        <div className={cn(
          'relative flex items-center justify-center rounded-xl bg-zinc-950 border border-white/10 shadow-inner overflow-hidden',
          currentSize.icon
        )}>
          <svg
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-full w-full p-1"
          >
            <defs>
              <linearGradient id="specter-s-grad" x1="6" y1="6" x2="26" y2="26" gradientUnits="userSpaceOnUse">
                <stop stopColor="#38BDF8" />
                <stop offset="0.45" stopColor="#6366F1" />
                <stop offset="1" stopColor="#A855F7" />
              </linearGradient>
              <linearGradient id="specter-scan" x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
                <stop stopColor="white" stopOpacity="0.08" />
                <stop offset="1" stopColor="white" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Background radar sweep grid line */}
            <path d="M4 16H28" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="2 2" />

            {/* Continuous stealth aerodynamic 'S' */}
            <path
              d="M22 8.5H13C10.2386 8.5 8 10.7386 8 13.5C8 16.2614 10.2386 18.5 13 18.5H19C21.7614 18.5 24 20.7386 24 23.5C24 26.2614 21.7614 28.5 19 28.5H10"
              stroke="url(#specter-s-grad)"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Radar scanner tip points */}
            <circle cx="22" cy="8.5" r="1.5" fill="#38BDF8" />
            <circle cx="10" cy="28.5" r="1.5" fill="#A855F7" />

            {/* Subtle gloss overlay */}
            <rect width="32" height="16" fill="url(#specter-scan)" />
          </svg>
        </div>
      </div>

      {/* Brand Name & Badge */}
      {showWordmark && (
        <div className="flex items-center gap-2">
          <span className={cn('font-semibold tracking-tight text-zinc-100', currentSize.text)}>
            Specter
          </span>
          <span className={cn(
            'rounded-full bg-zinc-900 border border-white/[0.08] px-2 py-0.5 font-mono font-medium tracking-wide text-zinc-400',
            currentSize.badge
          )}>
            v1.0
          </span>
        </div>
      )}
    </div>
  );
}
