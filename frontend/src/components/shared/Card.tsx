import React from 'react';
import { cn } from '@/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  hoverable = false,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        'rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow-card)]',
        hoverable && 'cursor-pointer transition-[background-color,border-color,box-shadow] duration-150 hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-hover)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

