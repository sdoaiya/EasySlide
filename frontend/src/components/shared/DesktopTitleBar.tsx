const isDesktop = typeof window !== 'undefined' && 'electronAPI' in window;
const logoSrc = `${import.meta.env.BASE_URL}logo-nav.png`;

export function DesktopTitleBar() {
  if (!isDesktop) {
    return null;
  }

  return (
    <div
      className="fixed left-0 right-0 top-0 z-50 flex h-12 items-center border-b border-slate-200/70 bg-white/85 px-4 text-sm text-slate-700 shadow-sm backdrop-blur"
      style={{ WebkitAppRegion: 'drag' }}
    >
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
        <img src={logoSrc} alt="EasySlide" className="h-6 w-6 rounded-md" />
        <span className="font-semibold tracking-wide">EasySlide</span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' }}>
        <button
          type="button"
          onClick={() => window.electronAPI?.minimizeWindow?.()}
          className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
        >
          _
        </button>
        <button
          type="button"
          onClick={() => window.electronAPI?.maximizeWindow?.()}
          className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
        >
          [ ]
        </button>
        <button
          type="button"
          onClick={() => window.electronAPI?.closeWindow?.()}
          className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600"
        >
          X
        </button>
      </div>
    </div>
  );
}
