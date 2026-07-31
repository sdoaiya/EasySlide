import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { animate } from 'animejs';
import { ExportTasksPanel, Loading } from '@/components/shared';
import { setLastProjectEntry } from '@/api/endpoints';
import { SyncReviewSheet } from './SyncReviewSheet';
import { useContentProjectStore } from '@/store/useContentProjectStore';
import type { ContentWorkspaceKind } from '@/types';

export function ContentProjectLayout() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const { project, loading, error, load, clear } = useContentProjectStore();

  useEffect(() => {
    if (projectId) void load(projectId);
    return clear;
  }, [clear, load, projectId]);

  useEffect(() => {
    const openSync = () => setSyncOpen(true);
    window.addEventListener('content-project:open-sync', openSync);
    return () => window.removeEventListener('content-project:open-sync', openSync);
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const transition = animate(content, {
      opacity: { from: 0.76, to: 1 },
      duration: 180,
      ease: 'outCubic',
    });
    return () => {
      transition.pause();
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!projectId) return;
    const entry = location.pathname.split('/')[3];
    if (!['spine', 'ppt', 'video', 'podcast'].includes(entry)) return;
    void setLastProjectEntry(projectId, entry as 'spine' | ContentWorkspaceKind);
  }, [location.pathname, projectId]);

  if (loading && !project) return <Loading fullscreen message="正在打开内容项目" />;
  if (error || !projectId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-background)]">
        <button type="button" onClick={() => navigate('/home')} className="text-sm text-[var(--app-accent)]">
          {error || '项目不存在'}，返回首页
        </button>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 min-w-0 overflow-hidden bg-[var(--app-background)] text-[var(--app-text)]">
      <div ref={contentRef} data-project-route-content className="h-full min-h-0 min-w-0 overflow-hidden">
        <Outlet />
      </div>
      <ExportTasksPanel projectId={projectId} className="fixed right-4 top-4 z-[100] w-[min(380px,calc(100vw-2rem))]" />
      <SyncReviewSheet
        projectId={projectId}
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        onChanged={() => void load(projectId)}
      />
    </div>
  );
}
