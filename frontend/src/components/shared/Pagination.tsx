import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  pageSizeLabel?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20],
  pageSizeLabel = '/ page',
}) => {
  // When only page size selector is needed (totalPages <= 1), still render if onPageSizeChange is provided
  if (totalPages <= 1 && !onPageSizeChange) return null;

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    // Show all pages when total is small enough
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis')[] = [1];

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    if (start > 2) pages.push('ellipsis');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('ellipsis');

    pages.push(totalPages);
    return pages;
  };

  const buttonBase =
    'flex items-center justify-center rounded-[var(--app-radius-control)] transition-[background-color,color,border-color,box-shadow] duration-150 select-none';
  const btnSize = 'w-9 h-9 text-sm';

  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="Pagination">
      {/* Previous */}
      <button
        className={cn(buttonBase, btnSize, 'text-[var(--app-text-tertiary)]', {
          'hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] cursor-pointer': currentPage > 1,
          'opacity-30 cursor-not-allowed': currentPage <= 1,
        })}
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft size={18} />
      </button>

      {/* Page numbers */}
      {getPageNumbers().map((page, idx) =>
        page === 'ellipsis' ? (
          <span
            key={`ellipsis-${idx}`}
            className="flex h-9 w-9 select-none items-center justify-center text-sm text-[var(--app-text-tertiary)]"
          >
            ...
          </span>
        ) : (
          <button
            key={page}
            className={cn(buttonBase, btnSize, 'font-medium', {
              'bg-[var(--app-primary-action)] text-[var(--app-surface)] shadow-[var(--app-shadow-control)]': page === currentPage,
              'text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]':
                page !== currentPage,
            })}
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? 'page' : undefined}
          >
            {page}
          </button>
        )
      )}

      {/* Next */}
      <button
        className={cn(buttonBase, btnSize, 'text-[var(--app-text-tertiary)]', {
          'hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] cursor-pointer': currentPage < totalPages,
          'opacity-30 cursor-not-allowed': currentPage >= totalPages,
        })}
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight size={18} />
      </button>

      {/* Page size selector */}
      {onPageSizeChange && (
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="ml-3 h-9 cursor-pointer rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm text-[var(--app-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>{size} {pageSizeLabel}</option>
          ))}
        </select>
      )}
    </nav>
  );
};
