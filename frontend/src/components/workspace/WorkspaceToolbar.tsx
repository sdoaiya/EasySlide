import type { CSSProperties, ReactNode } from 'react';

type WorkspaceToolbarProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function WorkspaceToolbar({ children, className = '', style }: WorkspaceToolbarProps) {
  return (
    <header style={style} className={`flex h-[var(--workspace-toolbar-height)] min-w-0 shrink-0 items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-2 shadow-[0_1px_0_rgba(255,255,255,0.65)_inset] ${className}`}>
      {children}
    </header>
  );
}
