import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';

const inspectorDrawerQuery = '(min-width: 1200px) and (max-width: 1279px)';

type WorkspaceShellProps = {
  toolbar: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
  inspector?: ReactNode;
  statusBar: ReactNode;
  hidePanelToggles?: boolean;
};

export function WorkspaceShell({ toolbar, sidebar, children, inspector, statusBar, hidePanelToggles = false }: WorkspaceShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorDrawer, setInspectorDrawer] = useState(() => window.matchMedia(inspectorDrawerQuery).matches);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(inspectorDrawer);

  useEffect(() => {
    const media = window.matchMedia(inspectorDrawerQuery);
    const updateLayout = (event: MediaQueryListEvent) => {
      setInspectorDrawer(event.matches);
      if (event.matches) setInspectorCollapsed(true);
    };

    media.addEventListener('change', updateLayout);
    return () => media.removeEventListener('change', updateLayout);
  }, []);

  useEffect(() => {
    const closeDrawer = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && inspectorDrawer) setInspectorCollapsed(true);
    };
    window.addEventListener('keydown', closeDrawer);
    return () => window.removeEventListener('keydown', closeDrawer);
  }, [inspectorDrawer]);

  const style = {
    gridTemplateColumns: `${sidebarCollapsed ? 'var(--workspace-sidebar-collapsed-width)' : 'var(--workspace-sidebar-width)'} minmax(0, 1fr) ${inspector && !inspectorDrawer ? (inspectorCollapsed ? 'var(--workspace-sidebar-collapsed-width)' : 'var(--workspace-inspector-width)') : '0'}`,
  } satisfies CSSProperties;

  const inspectorLabel = inspectorDrawer
    ? (inspectorCollapsed ? '打开属性栏' : '关闭属性栏')
    : (inspectorCollapsed ? '展开属性栏' : '收起属性栏');

  return (
    <section
      className="workspace-shell relative text-foreground-primary"
      data-inspector-layout={inspectorDrawer ? 'drawer' : 'column'}
      style={style}
    >
      <header className="flex min-w-0 items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface)]/95 px-2 backdrop-blur" style={{ gridArea: 'toolbar' }}>
        {!hidePanelToggles && (
          <button
            type="button"
            aria-label={sidebarCollapsed ? '展开页面栏' : '收起页面栏'}
            title={sidebarCollapsed ? '展开页面栏' : '收起页面栏'}
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] text-foreground-secondary hover:bg-cyan-50 hover:text-cyan-700 dark:hover:bg-background-hover dark:hover:text-cyan-300"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          </button>
        )}
        <div className="min-w-0 flex-1">{toolbar}</div>
        {inspector && !hidePanelToggles && (
          <button
            type="button"
            aria-label={inspectorLabel}
            title={inspectorLabel}
            aria-expanded={!inspectorCollapsed}
            onClick={() => setInspectorCollapsed((collapsed) => !collapsed)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] text-foreground-secondary hover:bg-cyan-50 hover:text-cyan-700 dark:hover:bg-background-hover dark:hover:text-cyan-300"
          >
            {inspectorCollapsed ? <PanelRightOpen size={18} aria-hidden="true" /> : <PanelRightClose size={18} aria-hidden="true" />}
          </button>
        )}
      </header>

      <aside
        aria-label="页面栏"
        data-collapsed={sidebarCollapsed}
        className="min-h-0 overflow-hidden border-r border-[var(--app-border)] bg-[var(--app-surface-muted)]"
        style={{ gridArea: 'sidebar' }}
      >
        {!sidebarCollapsed && <div className="h-full overflow-auto">{sidebar}</div>}
      </aside>

      <main className="min-h-0 min-w-0 overflow-hidden" style={{ gridArea: 'canvas' }}>
        {children}
      </main>

      {inspector && (
        <aside
          aria-label="属性栏"
          data-collapsed={inspectorCollapsed}
          className={`min-h-0 overflow-hidden border-l border-[var(--app-border)] bg-[var(--app-surface)] ${inspectorDrawer ? 'absolute bottom-[var(--workspace-statusbar-height)] right-0 top-[var(--workspace-toolbar-height)] z-20 w-[var(--workspace-inspector-width)] shadow-[var(--app-shadow-soft)]' : ''}`}
          style={{ gridArea: 'inspector', visibility: inspectorDrawer && inspectorCollapsed ? 'hidden' : undefined }}
        >
          {!inspectorCollapsed && <div className="h-full overflow-auto">{inspector}</div>}
        </aside>
      )}

      <footer className="min-w-0 border-t border-[var(--app-border)] bg-[var(--app-surface)]/95" style={{ gridArea: 'status' }}>
        {statusBar}
      </footer>
    </section>
  );
}
