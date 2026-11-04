'use client';

import type { UserDto } from '@/lib/api';
import { LogOut, Radio, ShieldCheck, User } from 'lucide-react';
import * as React from 'react';

export interface UserAvatarMenuProps {
  user: UserDto;
  onOpenProfile: () => void;
  onOpenIntegrations?: () => void;
  onLogout: () => void | Promise<void>;
}

export function UserAvatarMenu({
  user,
  onOpenProfile,
  onOpenIntegrations,
  onLogout,
}: UserAvatarMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // Close on click outside
  React.useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const displayName = user.name?.trim() || user.email.split('@')[0];

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {/* Default User Avatar Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="User account menu"
        className="group relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted/60 text-foreground transition-all duration-150 hover:border-foreground/30 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="sr-only">Open user menu</span>
        {/* Default User Logo / Avatar */}
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-background/80 shadow-sm transition-transform duration-150 group-hover:scale-105">
          <User className="h-4 w-4 text-foreground/80 group-hover:text-foreground" />
        </div>
        {/* Active Session Indicator Dot */}
        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          tabIndex={-1}
          className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border border-border bg-card p-1 text-card-foreground shadow-xl ring-1 ring-black/5 dark:ring-white/5 backdrop-blur-md z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          {/* User Info Header */}
          <div className="border-b border-border/60 px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/80 bg-muted text-foreground">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-semibold text-foreground">
                    {displayName}
                  </span>
                  <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-500" />
                </div>
                <p
                  className="truncate text-[11px] font-mono text-muted-foreground"
                  title={user.email}
                >
                  {user.email}
                </p>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onOpenProfile();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Profile</span>
            </button>
            {onOpenIntegrations && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onOpenIntegrations();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <Radio className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Integrations</span>
              </button>
            )}
          </div>

          <div className="border-t border-border/60 py-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                void onLogout();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
