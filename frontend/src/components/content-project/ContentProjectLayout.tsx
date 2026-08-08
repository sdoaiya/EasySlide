import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ClipboardList, Film, Mic2, Presentation } from 'lucide-react';
import { animate } from 'animejs';
import { Button, ExportTasksPanel, Loading } from '@/components/shared';
import { setLastProjectEntry } from '@/api/endpoints';
import { selectContentWorkspace, selectSpineSummary, useContentProjectStore } from '@/store/useContentProjectStore';
import type { ContentWorkspaceKind } from '@/types';

/**
 * 编辑会话注册（阶段4）：编辑器把自己的 dirty/save 注册到壳层，
 * 模式切换前由壳层做未保存保护（保存 / 丢弃 / 取消）。
 */
export interface ProjectEditorSession {
  key: string;
  dirty: boolean;
  onSave?: () => Promise<void> | void;
}

interface ProjectEditorSessionContextValue {
  registerSession: (session: ProjectEditorSession) => void;
  unregisterSession: (key: string) => void;
}

const ProjectEditorSessionContext = createContext<ProjectEditorSessionContextValue>({
  registerSession: () => undefined,
  unregisterSession: () => undefined,
});

/** 编辑器接入壳层的未保存保护：注册当前 dirty 状态与保存动作。 */
export function useProjectEditorSession(session: ProjectEditorSession): void {
  const { registerSession, unregisterSession } = useContext(ProjectEditorSessionContext);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    registerSession(sessionRef.current);
    return () => unregisterSession(sessionRef.current.key);
  }, [registerSession, unregisterSession, session.key]);
}

const MODE_ICONS = {
  ppt: Presentation,
  video: Film,
  podcast: Mic2,
} as const;

const MODE_PATHS = {
  ppt: (projectId: string) => `/project/${projectId}/ppt`,
  video: (projectId: string) => `/project/${projectId}/video`,
  podcast: (projectId: string) => `/project/${projectId}/podcast`,
} as const;

const PPT_ROUTE_KEY = (projectId: string) => `ppt-last-route:${projectId}`;

/** 离开 PPT 模式时记住所在子页（outline/detail/editor），切回时回到原处。 */
function rememberPptRoute(kind: ContentWorkspaceKind, pathname: string, projectId: string) {
  if (kind !== 'ppt' && pathname.startsWith(`/project/${projectId}/ppt/`)) {
    sessionStorage.setItem(PPT_ROUTE_KEY(projectId), pathname);
  }
}

/** 切到 PPT 时优先回到记忆的子页；无记忆时回默认入口（index → outline）。 */
function resolveModeTarget(kind: ContentWorkspaceKind, projectId: string) {
  if (kind !== 'ppt') return MODE_PATHS[kind](projectId);
  const remembered = sessionStorage.getItem(PPT_ROUTE_KEY(projectId));
  if (remembered && remembered.startsWith(`/project/${projectId}/ppt/`)) return remembered;
  return MODE_PATHS.ppt(projectId);
}

export function ContentProjectLayout() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const contentRef = useRef<HTMLDivElement>(null);
  const { project, loading, error, load, clear } = useContentProjectStore();
  const [sessions, setSessions] = useState<Record<string, ProjectEditorSession>>({});
  const [pendingSwitch, setPendingSwitch] = useState<ContentWorkspaceKind | null>(null);
  const [taskPanelOpen, setTaskPanelOpen] = useState(false);

  const registerSession = useCallback((session: ProjectEditorSession) => {
    setSessions((current) => ({ ...current, [session.key]: session }));
  }, []);
  const unregisterSession = useCallback((key: string) => {
    setSessions((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);
  const sessionContext = useMemo(() => ({ registerSession, unregisterSession }), [registerSession, unregisterSession]);

  useEffect(() => {
    if (projectId) void load(projectId);
    return clear;
  }, [clear, load, projectId]);

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
    if (!['ppt', 'video', 'podcast'].includes(entry)) return;
    void setLastProjectEntry(projectId, entry as ContentWorkspaceKind);
  }, [location.pathname, projectId]);

  const spineSummary = selectSpineSummary(project);
  const projectTitle = spineSummary.topic || project?.project_title || '未命名项目';

  const currentMode = useMemo<ContentWorkspaceKind | null>(() => {
    if (!projectId) return null;
    if (location.pathname.startsWith(`/project/${projectId}/ppt`)) return 'ppt';
    if (location.pathname.startsWith(`/project/${projectId}/video`)) return 'video';
    if (location.pathname.startsWith(`/project/${projectId}/podcast`)) return 'podcast';
    return null;
  }, [location.pathname, projectId]);

  const dirtySession = useMemo(
    () => Object.values(sessions).find((session) => session.dirty) ?? null,
    [sessions],
  );

  const switchMode = useCallback((kind: ContentWorkspaceKind) => {
    if (!projectId) return;
    if (kind === currentMode) return;
    rememberPptRoute(kind, location.pathname, projectId);
    if (dirtySession) {
      setPendingSwitch(kind);
      return;
    }
    navigate(resolveModeTarget(kind, projectId));
  }, [currentMode, dirtySession, location.pathname, navigate, projectId]);

  const confirmSwitch = async (action: 'save' | 'discard' | 'cancel') => {
    const kind = pendingSwitch;
    setPendingSwitch(null);
    if (!kind || !projectId) return;
    if (action === 'cancel') return;
    if (action === 'save' && dirtySession?.onSave) {
      try {
        await dirtySession.onSave();
      } catch {
        return; // 保存失败：停留在当前模式
      }
    }
    navigate(resolveModeTarget(kind, projectId));
  };

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
    <ProjectEditorSessionContext.Provider value={sessionContext}>
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--app-background)] text-[var(--app-text)]">
        {/* 统一项目栏：项目标题、模式切换、任务面板；返回由应用工具架负责。 */}
        <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-3">
          <span className="min-w-0 max-w-[260px] truncate text-sm font-semibold text-[var(--app-text)]" title={projectTitle}>
            {projectTitle}
          </span>
          <nav aria-label="项目模式" className="ml-auto flex items-center gap-1">
            {(['ppt', 'video', 'podcast'] as const).map((kind) => {
              const Icon = MODE_ICONS[kind];
              const workspace = selectContentWorkspace(project, kind);
              const state = workspace?.state;
              const active = currentMode === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => switchMode(kind)}
                  aria-current={active ? 'page' : undefined}
                  data-mode-switch
                  className={`flex h-9 items-center gap-1.5 rounded-[var(--app-radius-control)] px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)] ${active ? 'bg-[var(--app-accent-soft)] font-medium text-[var(--app-accent)]' : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]'}`}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span className="hidden sm:inline">{kind === 'ppt' ? 'PPT' : kind === 'video' ? '视频' : '播客'}</span>
                  {state === 'ready' && <span className="h-1.5 w-1.5 rounded-full bg-[var(--app-success)]" aria-hidden="true" />}
                </button>
              );
            })}
          </nav>
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              icon={<ClipboardList size={16} />}
              onClick={() => setTaskPanelOpen((open) => !open)}
              aria-label="项目任务"
              aria-expanded={taskPanelOpen}
              data-project-task-button
            />
            {taskPanelOpen && (
              <>
                <button type="button" aria-label="关闭任务面板" className="fixed inset-0 z-40 cursor-default" onClick={() => setTaskPanelOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-[380px] max-w-[calc(100vw-16px)]">
                  <ExportTasksPanel projectId={projectId} />
                </div>
              </>
            )}
          </div>
        </header>

        {/* 未保存切换保护 */}
        {pendingSwitch && dirtySession && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-6" role="dialog" aria-modal="true" aria-label="未保存内容">
            <div className="w-full max-w-sm rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow-floating)]">
              <h2 className="text-base font-semibold">当前模式有未保存内容</h2>
              <p className="mt-2 text-sm text-[var(--app-text-secondary)]">切换前请保存、放弃或取消本次修改。</p>
              <div className="mt-5 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => void confirmSwitch('cancel')}>取消</Button>
                <Button size="sm" variant="secondary" onClick={() => void confirmSwitch('discard')}>放弃修改</Button>
                <Button size="sm" onClick={() => void confirmSwitch('save')}>保存并切换</Button>
              </div>
            </div>
          </div>
        )}

        <div ref={contentRef} data-project-route-content className="min-h-0 flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </ProjectEditorSessionContext.Provider>
  );
}
