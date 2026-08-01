import { useEffect } from 'react';
import { Film, Mic2, Presentation } from 'lucide-react';
import { Button, Loading } from '@/components/shared';
import { useContentProjectStore } from '@/store/useContentProjectStore';
import { WorkspaceVersionHistory } from './WorkspaceVersionHistory';
import { VideoWorkspace } from './VideoWorkspace';
import { PodcastWorkspace } from './PodcastWorkspace';
import type { ContentWorkspaceKind } from '@/types';

const details = {
  ppt: { label: 'PPT', icon: Presentation, description: '组织页面结构、视觉叙事与演示成稿。', initializeLabel: '生成内容结构' },
  video: { label: '视频', icon: Film, description: '以场景时间线组织画面、旁白、字幕与音频。', initializeLabel: '生成脚本结构' },
  podcast: { label: '播客', icon: Mic2, description: '以节目片段组织角色、声音、混音与逐字稿。', initializeLabel: '生成节目结构' },
} as const;

export function WorkspaceEntryPage({ kind }: { kind: ContentWorkspaceKind }) {
  const { project, loading, initializeWorkspace } = useContentProjectStore();
  const projectId = project?.project_id;
  const workspace = project?.workspaces.find((item) => item.kind === kind);
  const detail = details[kind];
  const Icon = detail.icon;
  const uninitialized = !workspace || workspace.state === 'uninitialized';
  const initializing = uninitialized && ['QUEUED', 'INITIALIZING'].includes(String(workspace?.stage || '').toUpperCase());
  const failed = uninitialized && String(workspace?.stage || '').toUpperCase() === 'FAILED';

  useEffect(() => {
    if (!projectId || !initializing) return;
    const timer = window.setInterval(() => {
      void useContentProjectStore.getState().load(projectId);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [initializing, projectId]);

  if (!project) return <Loading fullscreen message="正在读取工作区" />;

  if (
    !uninitialized
    && kind === 'video'
    && workspace
    && Array.isArray(workspace.document?.scenes)
  ) {
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
    return <PodcastWorkspace projectId={project.project_id} spineRevision={project.spine.revision} workspace={workspace} onChanged={() => void useContentProjectStore.getState().load(project.project_id)} />;
  }

  return (
    <main className="flex h-full items-center justify-center overflow-auto p-8">
      <section className="w-full max-w-xl border-y border-[var(--app-border)] py-10 text-center">
        <Icon className="mx-auto text-[var(--app-text-tertiary)]" size={28} aria-hidden="true" />
        <h1 className="mt-4 text-xl font-semibold">{detail.label} 工作区</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--app-text-secondary)]">{detail.description}</p>
        {uninitialized ? (
          <>
            {initializing ? (
              <>
                <p className="mt-5 text-sm font-medium text-[var(--app-text)]">正在准备{detail.label}工作区</p>
                <p className="mt-2 text-xs text-[var(--app-text-secondary)]">正在生成第一版可编辑结构，完成后会自动进入工作区。</p>
                <div className="mx-auto mt-5 h-2 max-w-xs overflow-hidden rounded-full bg-[var(--app-surface-hover)]"><div className="h-full w-1/2 animate-pulse bg-[var(--app-accent)]" /></div>
              </>
            ) : (
              <>
                <p className="mt-5 text-xs text-[var(--app-text-tertiary)]">{failed ? '上次准备失败，可重新开始。' : '当前工作区尚未初始化，不会产生模型、图片或语音调用。'}</p>
                <div className="mt-5 flex justify-center gap-2">
                  <Button size="sm" loading={loading} onClick={() => void initializeWorkspace(kind)}>
                    {failed ? '重试准备' : detail.initializeLabel}
                  </Button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <p className="mt-5 text-sm text-[var(--app-text-secondary)]">状态：{workspace.state} · 修订 {workspace.revision}</p>
            <WorkspaceVersionHistory
              projectId={project.project_id}
              kind={kind}
              revision={workspace.revision}
              onRestored={() => void useContentProjectStore.getState().load(project.project_id)}
            />
          </>
        )}
      </section>
    </main>
  );
}
