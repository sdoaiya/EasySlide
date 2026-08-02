import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, Mic2, Presentation, Sparkles, Wand2 } from 'lucide-react';
import { Button, Loading } from '@/components/shared';
import { useContentProjectStore } from '@/store/useContentProjectStore';
import { useWorkspaceGenerationStore } from '@/store/useWorkspaceGenerationStore';
import { WorkspaceVersionHistory } from './WorkspaceVersionHistory';
import { VideoWorkspace } from './VideoWorkspace';
import { PodcastWorkspace } from './PodcastWorkspace';
import { PptToVideoWizard } from './PptToVideoWizard';
import type { ContentWorkspaceKind } from '@/types';

const details = {
  ppt: { label: 'PPT', icon: Presentation, description: '组织页面结构、视觉叙事与演示成稿。', generateLabel: '生成内容结构' },
  video: { label: '视频', icon: Film, description: '以场景时间线组织画面、旁白、字幕与音频。', generateLabel: '直接生成视频候选' },
  podcast: { label: '播客', icon: Mic2, description: '以节目片段组织角色、声音、混音与逐字稿。', generateLabel: '直接生成节目候选' },
} as const;

const activeStatuses = new Set(['PENDING', 'RUNNING', 'PAUSED', 'PUBLISHING']);

export function WorkspaceEntryPage({ kind }: { kind: ContentWorkspaceKind }) {
  const navigate = useNavigate();
  const { project, load } = useContentProjectStore();
  const { runs, loadRuns, createRun, error } = useWorkspaceGenerationStore();
  const projectId = project?.project_id;
  const workspace = project?.workspaces.find((item) => item.kind === kind);
  const detail = details[kind];
  const Icon = detail.icon;
  const uninitialized = !workspace || workspace.state === 'uninitialized';
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const kindRuns = runs.filter((run) => run.target_workspace_kind === kind);
  const activeRun = kindRuns.find((run) => activeStatuses.has(run.status));
  const reviewRun = kindRuns.find((run) => run.status === 'REVIEW_READY' || run.status === 'STALE');

  useEffect(() => {
    if (!projectId) return;
    void loadRuns(projectId);
    const timer = window.setInterval(() => {
      const state = useWorkspaceGenerationStore.getState();
      const active = state.runs.some((run) => run.target_workspace_kind === kind && activeStatuses.has(run.status));
      if (active) void state.loadRuns(projectId);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [kind, loadRuns, projectId]);

  if (!project) return <Loading fullscreen message="正在读取工作区" />;

  const editor = (() => {
    if (!uninitialized && kind === 'video' && workspace && Array.isArray(workspace.document?.scenes)) {
      return (
        <VideoWorkspace
          projectId={project.project_id}
          spineRevision={project.spine.revision}
          workspace={workspace}
          onChanged={() => void useContentProjectStore.getState().load(project.project_id)}
        />
      );
    }
    if (!uninitialized && kind === 'podcast' && workspace && Array.isArray(workspace.document?.segments)) {
      return (
        <PodcastWorkspace
          projectId={project.project_id}
          spineRevision={project.spine.revision}
          workspace={workspace}
          onChanged={() => void useContentProjectStore.getState().load(project.project_id)}
        />
      );
    }
    return null;
  })();
  if (editor) {
    // 正式版本与新候选并存：默认保留正式编辑器，顶部提供候选入口（阶段5）
    return (
      <div className="flex h-full min-h-0 flex-col">
        {reviewRun && (
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--app-accent-soft)] bg-[var(--app-accent-soft)] px-4 py-2">
            <Sparkles size={14} className="shrink-0 text-[var(--app-accent)]" aria-hidden="true" />
            <p className="min-w-0 flex-1 truncate text-xs text-[var(--app-accent)]">
              {reviewRun.stale ? '候选可能已过期' : '有 1 个待审查候选'}
            </p>
            <Button size="sm" variant="secondary" onClick={() => navigate(`/project/${project.project_id}/${kind}/review/${reviewRun.run_id}`)}>
              审查候选
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1">{editor}</div>
      </div>
    );
  }

  const startDirectGeneration = async () => {
    if (kind === 'ppt') return;
    setBusy(true);
    setMessage('');
    const run = await createRun(project.project_id, {
      targetWorkspaceKind: kind,
      sourceKind: 'brief',
      mode: 'direct',
      operation: 'generate',
      options: { target_duration_seconds: kind === 'video' ? 120 : 600 },
    });
    if (run?.run_id) {
      navigate(`/project/${project.project_id}/${kind}/review/${run.run_id}`);
    } else {
      setMessage(error || '创建生成运行失败');
    }
    setBusy(false);
  };

  return (
    <main className="flex h-full items-center justify-center overflow-auto p-8">
      <section className="w-full max-w-xl border-y border-[var(--app-border)] py-10 text-center">
        <Icon className="mx-auto text-[var(--app-text-tertiary)]" size={28} aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold">{detail.label} 工作区</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--app-text-secondary)]">{detail.description}</p>

        {uninitialized ? (
          <>
            {activeRun && (
              <div className="mx-auto mt-5 max-w-md rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-4 text-left">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">正在生成{detail.label}候选</p>
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/project/${project.project_id}/${kind}/review/${activeRun.run_id}`)}>查看进度</Button>
                </div>
                <p className="mt-2 text-xs text-[var(--app-text-tertiary)]">长任务进入任务中心，刷新后仍可恢复。</p>
              </div>
            )}

            {!activeRun && reviewRun && (
              <div className="mx-auto mt-5 max-w-md rounded-[var(--app-radius-card)] border border-[var(--app-accent)]/40 bg-[var(--app-surface)] p-4 text-left">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">有 1 个待审查候选</p>
                  <Button size="sm" icon={<Sparkles size={14} />} onClick={() => navigate(`/project/${project.project_id}/${kind}/review/${reviewRun.run_id}`)}>审查候选</Button>
                </div>
                {reviewRun.stale && <p className="mt-2 text-xs text-[var(--app-warning)]">源内容已变化，候选可能过期。</p>}
              </div>
            )}

            {!activeRun && !reviewRun && (
              <>
                <p className="mt-5 text-xs text-[var(--app-text-tertiary)]">当前工作区尚未初始化，不会产生模型、图片或语音调用。</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {(kind === 'video' || kind === 'podcast') && (
                    <Button size="sm" variant="secondary" icon={<Wand2 size={15} />} onClick={() => setWizardOpen(true)}>从 PPT 转换</Button>
                  )}
                  <Button size="sm" loading={busy} icon={<Sparkles size={15} />} onClick={() => void startDirectGeneration()}>
                    {detail.generateLabel}
                  </Button>
                </div>
                {message && <p role="alert" className="mt-3 text-xs text-[var(--app-error)]">{message}</p>}
              </>
            )}
          </>
        ) : (
          <>
            <p className="mt-5 text-sm text-[var(--app-text-secondary)]">状态：{workspace.state} · 修订 {workspace.revision}</p>
            {reviewRun && (
              <Button size="sm" variant="secondary" className="mt-4" onClick={() => navigate(`/project/${project.project_id}/${kind}/review/${reviewRun.run_id}`)}>
                有 1 个待审查候选
              </Button>
            )}
            <div className="mt-4 flex justify-center">
              <WorkspaceVersionHistory
                projectId={project.project_id}
                kind={kind}
                revision={workspace.revision}
                onRestored={() => void useContentProjectStore.getState().load(project.project_id)}
              />
            </div>
          </>
        )}
      </section>

      <PptToVideoWizard
        projectId={project.project_id}
        isOpen={wizardOpen && (kind === 'video' || kind === 'podcast')}
        targetKind={kind === 'podcast' ? 'podcast' : 'video'}
        onClose={() => setWizardOpen(false)}
        onCreated={() => void load(project.project_id)}
      />
    </main>
  );
}
