import type { CSSProperties } from 'react';
import { Minus, Square, X } from 'lucide-react';
type AppRegionStyle = CSSProperties & { WebkitAppRegion: 'drag' | 'no-drag' };
const isDesktop = typeof window !== 'undefined' && 'electronAPI' in window;
const logoSrc = `${import.meta.env.BASE_URL}logo-nav.png`;

export function DesktopTitleBar() {
  if (!isDesktop) {
    return null;
  }

  return (
    <div data-testid="desktop-title-bar"
      className="fixed left-0 right-0 top-0 z-50 flex h-10 items-center border-b border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-[13px] text-[var(--app-text-secondary)]"
      style={{ WebkitAppRegion: 'drag' } as AppRegionStyle}
    >
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as AppRegionStyle}>
        <img src={logoSrc} alt="EasySlide" className="h-5 w-5 rounded-[var(--app-radius-control)]" />
        <span className="font-semibold text-[var(--app-text)]">EasySlide</span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as AppRegionStyle}>
        <button
          type="button" aria-label="Minimize window" title="Minimize"
          onClick={() => window.electronAPI?.minimizeWindow?.()}
          className="flex h-10 w-11 items-center justify-center text-[var(--app-text-tertiary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--app-accent-soft)]"
        >
          <Minus size={15} aria-hidden="true" />
        </button>
        <button
          type="button" aria-label="Maximize window" title="Maximize"
          onClick={() => window.electronAPI?.maximizeWindow?.()}
          className="flex h-10 w-11 items-center justify-center text-[var(--app-text-tertiary)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--app-accent-soft)]"
        >
          <Square size={12} aria-hidden="true" />
        </button>
        <button
          type="button" aria-label="Close window" title="Close"
          onClick={() => window.electronAPI?.closeWindow?.()}
        className="flex h-10 w-11 items-center justify-center text-[var(--app-text-tertiary)] transition-colors hover:bg-[var(--app-error)] hover:text-[var(--app-on-color)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--app-error-soft)]"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
