'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

export interface PaginationControlsProps {
  page: number;
  totalPages: number;
  totalItems?: number;
  pageSize?: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newPageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
  itemLabel?: string;
}

export function PaginationControls({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  className,
  itemLabel = 'items',
}: PaginationControlsProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);

  const canGoPrevious = safePage > 1;
  const canGoNext = safePage < safeTotalPages;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs font-mono text-muted-foreground',
        className
      )}
    >
      <div className="flex items-center gap-2">
        {typeof totalItems === 'number' && (
          <span>
            Total: <strong className="text-foreground">{totalItems}</strong> {itemLabel}
          </span>
        )}
        {onPageSizeChange && pageSize && (
          <div className="flex items-center gap-1.5 ml-2">
            <span>Show</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Items per page"
              className="h-7 rounded border border-border bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 ml-auto">
        <span className="mr-2">
          Page <strong className="text-foreground">{safePage}</strong> of{' '}
          <strong className="text-foreground">{safeTotalPages}</strong>
        </span>

        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(1)}
          disabled={!canGoPrevious}
          title="First page"
          aria-label="Go to first page"
          className="h-7 w-7"
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(safePage - 1)}
          disabled={!canGoPrevious}
          title="Previous page"
          aria-label="Go to previous page"
          className="h-7 w-7"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(safePage + 1)}
          disabled={!canGoNext}
          title="Next page"
          aria-label="Go to next page"
          className="h-7 w-7"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(safeTotalPages)}
          disabled={!canGoNext}
          title="Last page"
          aria-label="Go to last page"
          className="h-7 w-7"
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
