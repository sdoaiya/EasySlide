import type { ReactNode } from 'react';

type WorkspaceStatusBarProps = {
  children: ReactNode;
  className?: string;
};

export function WorkspaceStatusBar({ children, className = '' }: WorkspaceStatusBarProps) {
  return (
    <div className={`flex h-full min-w-0 items-center px-3 text-xs text-foreground-secondary ${className}`}>
      {children}
    </div>
  );
}
