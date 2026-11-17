'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Globe, Search, X } from 'lucide-react';
import { cn, getAllIanaTimezones, getBrowserTimezone, type TimezoneOption } from '@/lib/utils';

export interface TimezoneSelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function TimezoneSelect({
  id,
  value,
  onChange,
  disabled = false,
  className,
}: TimezoneSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const browserTz = React.useMemo(() => getBrowserTimezone(), []);
  const allTimezones = React.useMemo(() => getAllIanaTimezones(), []);

  const currentOption = React.useMemo(() => {
    return allTimezones.find((t) => t.value === value) ?? {
      value,
      label: value,
      offset: '',
      city: value,
    };
  }, [allTimezones, value]);

  const filteredOptions = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allTimezones;
    return allTimezones.filter(
      (t) =>
        t.value.toLowerCase().includes(q) ||
        t.label.toLowerCase().includes(q) ||
        t.city.toLowerCase().includes(q) ||
        t.offset.toLowerCase().includes(q)
    );
  }, [allTimezones, searchQuery]);

  // Focus search input when dropdown opens
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Close dropdown on outside click or escape
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (tz: string) => {
    onChange(tz);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3.5 py-2 text-sm text-foreground transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:border-foreground focus-visible:ring-1 focus-visible:ring-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex items-center gap-2.5 truncate text-left font-mono text-xs sm:text-sm">
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{currentOption.label}</span>
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground opacity-60" />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full min-w-[300px] sm:min-w-[380px] rounded-lg border border-border bg-card p-2.5 text-card-foreground shadow-2xl ring-1 ring-black/5 dark:ring-white/5 animate-in fade-in-0 zoom-in-95">
          {/* Search Header */}
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by city, region, or GMT offset..."
              className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-8 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Quick Action: Browser Timezone */}
          {browserTz && (
            <div className="mb-2 border-b border-border/80 pb-1.5">
              <button
                type="button"
                onClick={() => handleSelect(browserTz)}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <span>Use browser timezone</span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{browserTz}</span>
              </button>
            </div>
          )}

          {/* Timezone List */}
          <div role="listbox" className="max-h-60 overflow-y-auto space-y-0.5 pr-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No timezones found matching &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              filteredOptions.map((item) => {
                const isSelected = item.value === value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(item.value)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-xs sm:text-sm text-left transition-colors font-mono',
                      isSelected
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <span className="truncate pr-2">{item.label}</span>
                    {isSelected && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
