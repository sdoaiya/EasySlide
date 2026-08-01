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
import { LandingPage } from './pages/Landing';
import { useProjectStore } from './store/useProjectStore';
import { useContentProjectStore } from './store/useContentProjectStore';
import { useToast, AccessCodeGuard, AppTopNav, DesktopTitleBar, Loading } from './components/shared';
import { ContentProjectLayout } from './components/content-project/ContentProjectLayout';
import { WorkspaceEntryPage } from './components/content-project/WorkspaceEntryPage';

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
    <>
      <AppTopNav />
      <div ref={contentRef} tabIndex={0} aria-label="工作区内容" data-workspace-content className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]">
        <Outlet />
      </div>
    </>
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

/**
 * 旧内容主线 URL 兼容：/project/:id/spine 按最近访问的目标工作区跳转。
 * 历史值 last_workspace === 'spine' 时按已创建工作区优先级解析，优先 PPT。
 */
export function SpineLegacyRedirect() {
  const { projectId } = useParams();
  const project = useContentProjectStore((state) => state.project);
  const workspaceEntries = (project?.workspaces || []).filter((workspace) => workspace.state !== 'uninitialized');
  if (!project) return <Loading fullscreen message="正在打开项目" />;
  const last = project.last_workspace;
  const target =
    last === 'video' || last === 'podcast'
      ? last
      : last === 'ppt'
        ? 'ppt/outline'
        : workspaceEntries[0]?.kind === 'video'
          ? 'video'
          : workspaceEntries[0]?.kind === 'podcast'
            ? 'podcast'
            : 'ppt/outline';
  return <Navigate to={`/project/${projectId}/${target}`} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/landing" element={<LandingPage />} />
      {['/privacy', '/terms', '/cookies', '/app'].map((path) => (
        <Route key={path} path={path} element={<Navigate to="/home" replace />} />
      ))}
      <Route element={<ProtectedRoute><WorkspaceLayout /></ProtectedRoute>}>
        <Route path="/create" element={<Home showNavigation={false} />} />
        <Route path="/home" element={<History showNavigation={false} />} />
        <Route path="/history" element={<History showNavigation={false} />} />
        <Route path="/settings" element={<SettingsPage showNavigation={false} />} />
        <Route path="/tasks" element={<TaskCenter />} />
        <Route element={<ContentProjectLayout />}>
          <Route path="/project/:projectId/spine" element={<SpineLegacyRedirect />} />
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

