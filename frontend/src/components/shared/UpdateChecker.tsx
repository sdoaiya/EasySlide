import { useEffect, useState } from 'react';

type UpdateInfo = {
  version: string;
  url: string;
  notes?: string;
};

const isDesktop = typeof window !== 'undefined' && 'electronAPI' in window;

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
      className="fixed right-4 top-16 z-50 max-w-sm rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm text-amber-950 shadow-xl backdrop-blur"
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      <div className="font-semibold">发现新版本 v{update.version}</div>
      <div className="mt-1 line-clamp-2 text-xs text-amber-900/80">
        可前往发布页下载最新桌面版。
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.electronAPI?.openExternal?.(update.url)}
          className="rounded-full bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
        >
          去下载
        </button>
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="rounded-full px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
        >
          稍后
        </button>
      </div>
    </div>
  );
}
