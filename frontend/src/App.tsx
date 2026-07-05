import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from './pages/Home';
import { History } from './pages/History';
import { OutlineEditor } from './pages/OutlineEditor';
import { DetailEditor } from './pages/DetailEditor';
import { SlidePreview } from './pages/SlidePreview';
import { SettingsPage } from './pages/Settings';
import { useProjectStore } from './store/useProjectStore';
import { useToast, AccessCodeGuard, DesktopTitleBar } from './components/shared';

const isDesktop = typeof window !== 'undefined' && 'electronAPI' in window;

function ProtectedRoute({ children }: { children: ReactNode }) {
  return <AccessCodeGuard>{children}</AccessCodeGuard>;
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

  const router = isDesktop ? (
    <HashRouter>
      <Routes>
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/landing" element={<Navigate to="/app" replace />} />
        <Route path="/privacy" element={<Navigate to="/app" replace />} />
        <Route path="/terms" element={<Navigate to="/app" replace />} />
        <Route path="/cookies" element={<Navigate to="/app" replace />} />
        <Route path="/app" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/create" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/project/:projectId/outline" element={<ProtectedRoute><OutlineEditor /></ProtectedRoute>} />
        <Route path="/project/:projectId/detail" element={<ProtectedRoute><DetailEditor /></ProtectedRoute>} />
        <Route path="/project/:projectId/preview" element={<ProtectedRoute><SlidePreview /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </HashRouter>
  ) : (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/landing" element={<Navigate to="/app" replace />} />
        <Route path="/privacy" element={<Navigate to="/app" replace />} />
        <Route path="/terms" element={<Navigate to="/app" replace />} />
        <Route path="/cookies" element={<Navigate to="/app" replace />} />
        <Route path="/app" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/create" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/project/:projectId/outline" element={<ProtectedRoute><OutlineEditor /></ProtectedRoute>} />
        <Route path="/project/:projectId/detail" element={<ProtectedRoute><DetailEditor /></ProtectedRoute>} />
        <Route path="/project/:projectId/preview" element={<ProtectedRoute><SlidePreview /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  );

  return (
    <>
      <DesktopTitleBar />
      <div style={isDesktop ? { paddingTop: '3rem' } : undefined}>
        {router}
      </div>
      <ToastContainer />
    </>
  );
}

export default App;

