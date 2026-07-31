import React from 'react';
import { cn } from '@/utils';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const TextareaComponent = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  error,
  className,
  ...props
}, ref) => {
  return (
    <div className="w-full">
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-[var(--app-text-secondary)]">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        className={cn(
          'min-h-[120px] w-full resize-y rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[color-mix(in_oklab,var(--app-surface),transparent_4%)] px-3 py-2.5 text-sm text-[var(--app-text)]',
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
});

TextareaComponent.displayName = 'Textarea';

// 使用 memo 包装，避免父组件频繁重渲染时影响输入框
export const Textarea = React.memo(TextareaComponent);

