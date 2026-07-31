import { useEffect, useRef, type ReactNode } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { animate } from 'animejs';
import { Home } from './pages/Home';
import { History } from './pages/History';
import { OutlineEditor } from './pages/OutlineEditor';
import { DetailEditor } from './pages/DetailEditor';
import { SlidePreview } from './pages/SlidePreview';
import { SettingsPage } from './pages/Settings';
import { TaskCenter } from './pages/TaskCenter';
import { useProjectStore } from './store/useProjectStore';
import { useContentProjectStore } from './store/useContentProjectStore';
import { useToast, AccessCodeGuard, AppTopNav, DesktopTitleBar, ExportTasksPanel } from './components/shared';
import { ContentProjectLayout } from './components/content-project/ContentProjectLayout';
import { ContentSpinePage } from './components/content-project/ContentSpinePage';
import { WorkspaceEntryPage } from './components/content-project/WorkspaceEntryPage';
import { WorkspaceProjectRailContext } from './components/workspace/WorkspaceShell';

const isDesktop = typeof window !== 'undefined' && 'electronAPI' in window;

function ProtectedRoute({ children }: { children: ReactNode }) {
  return <AccessCodeGuard>{children}</AccessCodeGuard>;
}

function WorkspaceLayout() {
  const location = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof window.matchMedia !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const transition = animate(content, {
      opacity: { from: 0.72, to: 1 },
      duration: 180,
      ease: 'outCubic',
    });

    return () => {
      transition.pause();
    };
  }, [location.pathname]);

  return (
    <WorkspaceProjectRailContext.Provider value={location.pathname.startsWith('/project/')}>
      <AppTopNav />
      {!location.pathname.startsWith('/project/') && location.pathname !== '/tasks' && (
        <ExportTasksPanel className="fixed right-4 top-4 z-[100] w-[min(380px,calc(100vw-2rem))]" />
      )}
      <div ref={contentRef} tabIndex={0} aria-label="工作区内容" data-workspace-content className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]">
        <Outlet />
      </div>
    </WorkspaceProjectRailContext.Provider>
  );
}

export function LegacyProjectRedirect({ stage }: { stage: 'outline' | 'detail' | 'editor' }) {
  const { projectId } = useParams();
  const location = useLocation();
  return <Navigate to={`/project/${projectId}/ppt/${stage}${location.search}${location.hash}`} state={location.state} replace />;
}

export function PptWorkspaceRoute() {
  const project = useContentProjectStore((state) => state.project);
  const ppt = project?.workspaces.find((workspace) => workspace.kind === 'ppt');
  return !ppt || ppt.state === 'uninitialized'
    ? <WorkspaceEntryPage kind="ppt" />
    : <Outlet />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      {['/landing', '/privacy', '/terms', '/cookies', '/app'].map((path) => (
        <Route key={path} path={path} element={<Navigate to="/home" replace />} />
      ))}
      <Route element={<ProtectedRoute><WorkspaceLayout /></ProtectedRoute>}>
        <Route path="/create" element={<Home showNavigation={false} />} />
        <Route path="/home" element={<History showNavigation={false} />} />
        <Route path="/history" element={<History showNavigation={false} />} />
        <Route path="/settings" element={<SettingsPage showNavigation={false} />} />
        <Route path="/tasks" element={<TaskCenter />} />
        <Route element={<ContentProjectLayout />}>
          <Route path="/project/:projectId/spine" element={<ContentSpinePage />} />
          <Route path="/project/:projectId/ppt" element={<PptWorkspaceRoute />}>
            <Route index element={<Navigate to="outline" replace />} />
            <Route path="outline" element={<OutlineEditor />} />
            <Route path="detail" element={<DetailEditor />} />
            <Route path="editor" element={<SlidePreview />} />
          </Route>
          <Route path="/project/:projectId/video" element={<WorkspaceEntryPage kind="video" />} />
          <Route path="/project/:projectId/podcast" element={<WorkspaceEntryPage kind="podcast" />} />
        </Route>
      </Route>
      <Route path="/project/:projectId/outline" element={<LegacyProjectRedirect stage="outline" />} />
      <Route path="/project/:projectId/detail" element={<LegacyProjectRedirect stage="detail" />} />
      <Route path="/project/:projectId/preview" element={<LegacyProjectRedirect stage="editor" />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

function App() {
  const { currentProject, syncProject, error, setError } = useProjectStore();
  const { show, ToastContainer } = useToast();

  // 恢复项目状态
  useEffect(() => {
    const savedProjectId = localStorage.getItem('currentProjectId');
    if (savedProjectId && !currentProject) {
      syncProject();
    }
  }, [currentProject, syncProject]);

  // 显示全局错误
  useEffect(() => {
    if (error) {
      show({ message: error, type: 'error' });
      setError(null);
    }
  }, [error, setError, show]);

  const router = isDesktop
    ? <HashRouter><AppRoutes /></HashRouter>
    : <BrowserRouter><AppRoutes /></BrowserRouter>;

  return (
    <>
      <DesktopTitleBar />
      <div style={isDesktop ? { paddingTop: '2.5rem' } : undefined}>
        {router}
      </div>
      <ToastContainer />
    </>
  );
}

export default App;

