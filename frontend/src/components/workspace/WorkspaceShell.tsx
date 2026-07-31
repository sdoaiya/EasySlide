import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useProjectRailTarget } from '@/components/content-project/useProjectRailTarget';
import { WorkspaceToolbar } from './WorkspaceToolbar';

const inspectorDrawerQuery = '(max-width: 1279px)';

export const WorkspaceProjectRailContext = createContext(false);

type WorkspaceShellProps = {
  toolbar: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
  inspector?: ReactNode;
  statusBar?: ReactNode;
  hidePanelToggles?: boolean;
  hideSidebarToggle?: boolean;
  presenting?: boolean;
  sidebarWidth?: string;
  inspectorWidth?: string;
  hideStatusBar?: boolean;
  hideToolbar?: boolean;
  softBorders?: boolean;
  className?: string;
};

export function WorkspaceShell({ toolbar, sidebar, children, inspector, statusBar, hidePanelToggles = false, hideSidebarToggle = false, presenting = false, sidebarWidth = 'var(--workspace-sidebar-width)', inspectorWidth = 'var(--workspace-inspector-width)', hideStatusBar = false, hideToolbar = false, softBorders = false, className = '' }: WorkspaceShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorDrawer, setInspectorDrawer] = useState(() => window.matchMedia(inspectorDrawerQuery).matches);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(inspectorDrawer);
  const projectRailTarget = useProjectRailTarget();
  const workspaceProvidesProjectRail = useContext(WorkspaceProjectRailContext);
  const usesProjectRail = Boolean(projectRailTarget) || workspaceProvidesProjectRail;

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

  // Keep the canvas as the only flexible track. The inspector scrolls internally,
  // so long fields must never participate in sizing the middle column.
  const style = {
    gridTemplateRows: presenting ? 'minmax(0, 1fr)' : `${hideToolbar ? '' : 'var(--workspace-toolbar-height) '}minmax(0, 1fr)`,
    gridTemplateAreas: presenting
      ? '"canvas"'
      : `${hideToolbar ? '' : '"toolbar toolbar toolbar" '}"sidebar canvas inspector"`,
    gridTemplateColumns: presenting
      ? 'minmax(0, 1fr)'
      : `minmax(0, ${usesProjectRail ? '0' : sidebarCollapsed ? 'var(--workspace-sidebar-collapsed-width)' : sidebarWidth}) minmax(0, 1fr) minmax(0, ${inspector && !inspectorDrawer ? (inspectorCollapsed ? 'var(--workspace-sidebar-collapsed-width)' : inspectorWidth) : '0'})`,
  } satisfies CSSProperties;

  const inspectorLabel = inspectorDrawer
    ? (inspectorCollapsed ? '打开属性栏' : '关闭属性栏')
    : (inspectorCollapsed ? '展开属性栏' : '收起属性栏');

  return (
    <section
      className={`workspace-shell relative min-w-0 text-[var(--app-text)] ${className}`}
      data-inspector-layout={inspectorDrawer ? 'drawer' : 'column'}
      data-presenting={presenting ? 'true' : 'false'}
      style={style}
    >
      {!hideToolbar && <WorkspaceToolbar style={{ gridArea: 'toolbar', display: presenting ? 'none' : undefined }}>
        {!hidePanelToggles && !hideSidebarToggle && (
          <button
            type="button"
            aria-label={sidebarCollapsed ? '展开页面栏' : '收起页面栏'}
            title={sidebarCollapsed ? '展开页面栏' : '收起页面栏'}
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
          >
            {inspectorCollapsed ? <PanelRightOpen size={18} aria-hidden="true" /> : <PanelRightClose size={18} aria-hidden="true" />}
          </button>
        )}
      </WorkspaceToolbar>}

      <aside
        aria-label="页面栏"
        data-collapsed={sidebarCollapsed}
        className={`min-h-0 overflow-hidden bg-[var(--app-surface)] ${softBorders ? 'shadow-[inset_-1px_0_0_rgba(60,60,67,0.16)]' : 'border-r border-[var(--app-border)]'}`}
        style={{ gridArea: 'sidebar', display: presenting || usesProjectRail ? 'none' : undefined }}
      >
        {!sidebarCollapsed && <div className="h-full overflow-auto pb-[var(--workspace-statusbar-height)]">{sidebar}</div>}
      </aside>
      {projectRailTarget && !presenting && createPortal(
        <aside aria-label="页面栏" data-collapsed={sidebarCollapsed} className="h-full min-h-0 overflow-hidden">
          {!sidebarCollapsed && <div className="h-full min-h-0 overflow-auto">{sidebar}</div>}
        </aside>,
        projectRailTarget,
      )}

      <main
        className="min-h-0 min-w-0 w-full overflow-hidden"
        style={{
          gridArea: 'canvas',
          paddingBottom: !hideStatusBar && !presenting ? 'var(--workspace-statusbar-height)' : undefined,
        }}
      >
        {children}
      </main>

      {inspector && (
        <aside
          aria-label="属性栏"
          data-collapsed={inspectorCollapsed}
          className={`min-h-0 min-w-0 overflow-x-hidden overflow-y-hidden bg-[var(--app-surface)] ${softBorders ? 'shadow-[inset_1px_0_0_rgba(52,73,105,0.12)]' : 'border-l border-[var(--app-border)]'} ${inspectorDrawer ? 'absolute right-0 z-20 shadow-[var(--app-shadow-soft)]' : 'w-full'}`}
          style={{ gridArea: inspectorDrawer ? undefined : 'inspector', display: presenting ? 'none' : undefined, visibility: inspectorDrawer ? (inspectorCollapsed ? 'hidden' : 'visible') : undefined, width: inspectorDrawer ? '304px' : undefined, top: inspectorDrawer ? (hideToolbar ? 0 : 'var(--workspace-toolbar-height)') : undefined, bottom: inspectorDrawer ? 'var(--workspace-statusbar-height)' : undefined }}
        >
          {!inspectorCollapsed && <div className="h-full min-w-0 overflow-x-hidden overflow-y-auto pb-[var(--workspace-statusbar-height)]">{inspector}</div>}
        </aside>
      )}

      {!hideStatusBar && <footer role="contentinfo" className="workspace-status-bar flex min-w-0 items-center border-t border-[var(--app-border)] bg-[var(--app-surface)] shadow-[0_1px_0_rgba(255,255,255,0.72)_inset]" style={{ display: presenting ? 'none' : undefined }}>
        {hideToolbar && !hidePanelToggles && !hideSidebarToggle && (
          <button type="button" aria-label={sidebarCollapsed ? '展开页面栏' : '收起页面栏'} title={sidebarCollapsed ? '展开页面栏' : '收起页面栏'} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} className="flex h-8 w-9 shrink-0 items-center justify-center text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]">
            {sidebarCollapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
          </button>
        )}
        <div className="h-full min-w-0 flex-1">{statusBar}</div>
        {hideToolbar && inspector && !hidePanelToggles && (
          <button type="button" aria-label={inspectorLabel} title={inspectorLabel} aria-expanded={!inspectorCollapsed} onClick={() => setInspectorCollapsed((collapsed) => !collapsed)} className="flex h-8 w-9 shrink-0 items-center justify-center text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]">
            {inspectorCollapsed ? <PanelRightOpen size={16} aria-hidden="true" /> : <PanelRightClose size={16} aria-hidden="true" />}
          </button>
        )}
      </footer>}
    </section>
  );
}
