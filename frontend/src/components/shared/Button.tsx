import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  disabled,
  ...props
}) => {
  const baseStyles = 'relative isolate inline-flex items-center justify-center gap-2 overflow-hidden rounded-[var(--app-radius-control)] border font-semibold transition-[background-color,color,border-color,box-shadow,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent-soft)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--app-surface)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 touch-manipulation';

  const variants = {
    primary: "border-[var(--app-primary-action)] bg-[var(--app-primary-action)] text-[var(--app-surface)] shadow-[var(--app-shadow-control)] hover:border-[var(--app-primary-action-hover)] hover:bg-[var(--app-primary-action-hover)] hover:shadow-[var(--app-shadow-card)]",
    secondary: 'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-[var(--app-shadow-control)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-hover)] hover:shadow-[var(--app-shadow-card)]',
    ghost: 'border-transparent bg-transparent text-[var(--app-text-secondary)] shadow-none hover:border-[var(--app-border-soft)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]',
  };
  
  const sizes = {
    sm: 'h-8 px-3 text-[13px]',
    md: 'h-10 px-4 text-sm',
    lg: 'h-11 px-5 text-[15px]',
  };

  return (
    <button
      className={cn(
        baseStyles,
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      )}
      {!loading && icon && (
        <span className="relative z-[1] shrink-0">{icon}</span>
      )}
      {children}
    </button>
  );
};
