import { type CSSProperties, useEffect, useState } from 'react';

type UpdateInfo = {
  version: string;
  url: string;
  notes?: string;
};

type AppRegionStyle = CSSProperties & {
  WebkitAppRegion?: 'drag' | 'no-drag';
};

const isDesktop = typeof window !== 'undefined' && 'electronAPI' in window;
const noDragStyle: AppRegionStyle = { WebkitAppRegion: 'no-drag' };

export function UpdateChecker() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!isDesktop || !window.electronAPI?.checkForUpdates) {
      return;
    }

    const timer = window.setTimeout(() => {
      window.electronAPI?.checkForUpdates().then(setUpdate).catch(() => setUpdate(null));
    }, 5000);

    return () => window.clearTimeout(timer);
  }, []);

  if (!isDesktop || !update || hidden) {
    return null;
  }

  return (
    <div
      className="fixed right-4 top-16 z-50 max-w-sm rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 text-sm text-[var(--app-text)] shadow-[var(--app-shadow-floating)]"
      style={noDragStyle}
    >
      <div className="font-semibold text-[var(--app-warning)]">发现新版本 v{update.version}</div>
      <div className="mt-1 line-clamp-2 text-xs text-[var(--app-text-secondary)]">
        可前往发布页下载最新桌面版。
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.electronAPI?.openExternal?.(update.url)}
          className="rounded-[var(--app-radius-control)] bg-[var(--app-primary-action)] px-3 py-1 text-xs font-medium text-[var(--app-surface)] hover:bg-[var(--app-primary-action-hover)]"
        >
          去下载
        </button>
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="rounded-[var(--app-radius-control)] px-3 py-1 text-xs font-medium text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]"
        >
          稍后
        </button>
      </div>
    </div>
  );
}
