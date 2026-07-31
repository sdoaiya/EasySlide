import React from 'react';
import { cn } from '@/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className,
  id,
  ...props
}) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-[var(--app-text-secondary)]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'h-10 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[color-mix(in_oklab,var(--app-surface),transparent_4%)] px-3 text-sm text-[var(--app-text)]',
          'outline-none transition-[border-color,background-color] duration-150 focus-visible:border-[var(--app-accent)] focus-visible:bg-[var(--app-surface)]',
          'placeholder:text-[var(--app-text-tertiary)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface)]',
          error && 'border-[var(--app-error)] focus-visible:border-[var(--app-error)]',
          className
        )}
        {...props}
      />
      {error && (
        <p className="mt-1 text-xs text-[var(--app-error)]">{error}</p>
      )}
    </div>
  );
};

