import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Film, Link2, RefreshCw, Save } from 'lucide-react';
import { Button, Textarea } from '@/components/shared';
import { MaterialSelector } from '@/components/shared/MaterialSelector';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { WorkspaceStatusBar } from '@/components/workspace/WorkspaceStatusBar';
import { exportVideoWorkspace, getProject, handoffVideoWorkspaceFrames, updateContentWorkspace, type Material } from '@/api/endpoints';
import { getImageUrl } from '@/api/client';
import { useExportTasksStore } from '@/store/useExportTasksStore';
import type { ProjectWorkspace } from '@/types';
import { WorkspaceVersionHistory } from './WorkspaceVersionHistory';
import { useProjectEditorSession } from './ContentProjectLayout';

type VideoScene = {
  scene_id: string;
  title: string;
  visual: { kind: string; source_ref: string | null };
  narration: { mode: 'single' | 'dialogue'; text: string; segments: unknown[] };
  subtitles: { enabled: boolean; text: string };
  duration_ms: number;
  transition: 'cut' | 'fade' | 'dissolve' | 'slide';
  animation: { intensity: 'none' | 'subtle' | 'balanced' | 'expressive'; cues: unknown[] };
  audio_cues: unknown[];
};

type VideoDocument = {
  schema_version: 1;
  title: string;
  aspect_ratio: '16:9' | '9:16' | '1:1';
  scenes: VideoScene[];
};

type ProofStatus = 'PENDING' | 'PROCESSING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | null;

const actionError = (cause: any) => cause?.response?.status === 429
  ? '服务请求过于频繁，请稍后重试。'
  : cause?.response?.data?.error?.message || cause?.message || '操作失败，请稍后重试。';

const VideoSceneRailItem = memo(function VideoSceneRailItem({
  scene,
  index,
  selected,
  onSelect,
}: {
  scene: VideoScene;
  index: number;
  selected: boolean;
  onSelect: (sceneId: string) => void;
}) {
  const renderCount = useRef(0);
  renderCount.current += 1;
  return (
    <button
      key={scene.scene_id}
      type="button"
      data-testid={`video-scene-rail-${scene.scene_id}`}
      data-render-count={import.meta.env.MODE === 'test' ? renderCount.current : undefined}
      onClick={() => onSelect(scene.scene_id)}
      className={`w-full rounded-[var(--app-radius-control)] border px-3 py-2 text-left ${selected ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)]' : 'border-transparent hover:bg-[var(--app-surface-hover)]'}`}
    >
      <span className="text-[11px] text-[var(--app-text-tertiary)]">场景 {index + 1}</span>
      <span className="mt-0.5 block truncate text-sm font-medium">{scene.title}</span>
    </button>
  );
});

export function VideoWorkspace({
  projectId,
  workspace,
  onChanged,
}: {
  projectId: string;
  spineRevision: number;
  workspace: ProjectWorkspace;
  onChanged: () => void;
}) {
  const [document, setDocument] = useState<VideoDocument>(
    workspace.document as VideoDocument,
  );
  const [selectedId, setSelectedId] = useState(
    (workspace.document as VideoDocument).scenes[0]?.scene_id || '',
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'sync' | 'export' | 'frames' | null>(null);
  const [message, setMessage] = useState('');
  const [proofTaskId, setProofTaskId] = useState<string | null>(null);
  const [materialTarget, setMaterialTarget] = useState<'visual' | 'audio' | null>(null);
  const { tasks, addTask, pollTask } = useExportTasksStore();

  useEffect(() => {
    const next = workspace.document as VideoDocument;
    setDocument(next);
    setSelectedId((current) => (
      next.scenes.some((scene) => scene.scene_id === current)
        ? current
        : next.scenes[0]?.scene_id || ''
    ));
    setDirty(false);
    setProofTaskId(null);
  }, [workspace.document, workspace.revision]);

  const proofTask = useMemo(() => {
    const currentVersionTasks = tasks.filter((task) => (
      task.projectId === projectId
      && task.type === 'video'
      && task.progress?.render_profile === 'proof'
      && task.progress?.workspace_version_id === workspace.current_version_id
    ));
    if (proofTaskId) {
      return currentVersionTasks.find((task) => task.taskId === proofTaskId) || null;
    }
    return currentVersionTasks[0] || null;
  }, [projectId, proofTaskId, tasks, workspace.current_version_id]);
  const proofStatus = (proofTask?.status || null) as ProofStatus;

  const selected = useMemo(
    () => document.scenes.find((scene) => scene.scene_id === selectedId),
    [document.scenes, selectedId],
  );
  const displayTitle = selected?.title?.trim() || document.title?.trim() || '未命名视频';

  const updateSelected = (patch: Partial<VideoScene>) => {
    setDocument((current) => ({
      ...current,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      scenes: current.scenes.map((scene) => (
        scene.scene_id === selectedId ? { ...scene, ...patch } : scene
      )),
    }));
    setDirty(true);
    setMessage('');
  };

  const handleMaterialSelect = (materials: Material[]) => {
    const material = materials[0];
    if (!selected || !material) return;
    if (materialTarget === 'visual') {
      updateSelected({
        visual: {
          ...selected.visual,
          kind: material.media_kind === 'video' ? 'video' : 'material',
          source_ref: material.url,
        },
      });
    } else if (materialTarget === 'audio') {
      updateSelected({
        audio_cues: [
          ...selected.audio_cues,
          {
            cue_id: `cue.${Date.now()}`,
            kind: 'sfx',
            asset_ref: material.url,
            offset_ms: 0,
            gain_db: 0,
          },
        ],
      });
    }
    setMaterialTarget(null);
  };

  const save = async () => {
    setBusy('save');
    setMessage('');
    try {
      await updateContentWorkspace(
        projectId,
        'video',
        workspace.revision,
        document as unknown as Record<string, unknown>,
        workspace.settings,
      );
      setDirty(false);
      setMessage('已保存新版本');
      onChanged();
    } catch (cause: any) {
      setMessage(actionError(cause));
    } finally {
      setBusy(null);
    }
  };
  useProjectEditorSession({ key: 'video-session', dirty, onSave: save });

  const exportVideo = async (renderProfile: 'proof' | 'final') => {
    setBusy('export');
    setMessage('');
    try {
      const response = await exportVideoWorkspace(projectId, {
        renderProfile,
        sourceProofTaskId: renderProfile === 'final' ? proofTask?.taskId || undefined : undefined,
      });
      const taskId = response.data?.task_id || '';
      if (!taskId) throw new Error('导出任务创建失败');
      const taskKey = `video-export-${taskId}`;
      addTask({
        id: taskKey,
        taskId,
        projectId,
        type: 'video',
        status: 'PENDING',
        progress: {
          total: 100,
          completed: 0,
          percent: 0,
          current_step: renderProfile === 'proof' ? '等待生成预览' : '等待高清渲染',
          render_profile: renderProfile,
          source_proof_task_id: renderProfile === 'final' ? proofTask?.taskId : undefined,
          workspace_version_id: workspace.current_version_id ?? undefined,
        },
      });
      if (renderProfile === 'proof') {
        setProofTaskId(taskId);
        setMessage(`已提交预览任务 ${taskId}，正在等待完成`.trim());
      } else {
        setMessage(`已提交高清导出任务 ${taskId}`.trim());
      }
      void pollTask(taskKey, projectId, taskId);
    } catch (cause: any) {
      setMessage(actionError(cause));
    } finally {
      setBusy(null);
    }
  };

  const syncPptFrames = async () => {
    if (workspace.source_kind !== 'ppt') return;
    setBusy('frames');
    setMessage('');
    try {
      const response = await getProject(projectId);
      const pages = response.data?.pages || [];
      const pageById = new Map(pages.map((page) => [page.page_id, page]));
      const scenes = document.scenes.filter((scene) => (
        ['page', 'native_scene'].includes(scene.visual.kind) && Boolean(scene.visual.source_ref)
      ));
      if (!scenes.length) throw new Error('当前视频没有可交接的 PPT 页面');
      const pageIds = scenes.map((scene) => scene.visual.source_ref as string);
      const frames: Blob[][] = [];
      const missing: string[] = [];
      for (const pageId of pageIds) {
        const page = pageById.get(pageId);
        const imagePath = page?.generated_image_url || page?.generated_image_path;
        if (!imagePath) {
          missing.push(pageId);
          continue;
        }
        const imageResponse = await fetch(getImageUrl(imagePath));
        if (!imageResponse.ok) {
          missing.push(pageId);
          continue;
        }
        const blob = await imageResponse.blob();
        if (!blob.type.startsWith('image/')) {
          missing.push(pageId);
          continue;
        }
        frames.push([blob]);
      }
      if (missing.length) {
        throw new Error(`PPT 页面缺少可交接的静态画面：${missing.join('、')}。原生页面请先在 PPT 编辑器导出或捕获阶段帧。`);
      }
      await handoffVideoWorkspaceFrames(projectId, frames, pageIds);
      setMessage(`已同步 ${frames.length} 页 PPT 静态阶段帧`);
      onChanged();
    } catch (cause: any) {
      setMessage(actionError(cause));
    } finally {
      setBusy(null);
    }
  };

  const sceneRail = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-3 pb-2 text-xs font-medium text-[var(--app-text-tertiary)]">场景 · {document.scenes.length}</div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {document.scenes.map((scene, index) => (
          <VideoSceneRailItem
            key={scene.scene_id}
            scene={scene}
            index={index}
            selected={selectedId === scene.scene_id}
            onSelect={setSelectedId}
          />
        ))}
      </div>
    </div>
  );

  return (
    <WorkspaceShell
      className="h-full"
      inspectorWidth="320px"
      toolbar={(
        <div className="flex h-full min-w-0 items-center gap-3">
          <Film size={17} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0 truncate text-sm font-semibold" title={displayTitle}>{displayTitle}</span>
          <span className="shrink-0 text-xs text-[var(--app-text-tertiary)]">R{workspace.revision}</span>
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button className="whitespace-nowrap" size="sm" variant="secondary" icon={<Download size={15} />} title="生成低清预览，用于检查画面和节奏" disabled={dirty || busy !== null} loading={busy === 'export'} onClick={() => void exportVideo('proof')}>
              生成预览
            </Button>
            {workspace.source_kind === 'ppt' && (
              <Button size="sm" variant="secondary" icon={<RefreshCw size={15} />} title="同步可访问的 PPT 静态画面；动态阶段帧请在 PPT 编辑器捕获" disabled={dirty || busy !== null} loading={busy === 'frames'} onClick={() => void syncPptFrames()}>
                同步 PPT 阶段帧
              </Button>
            )}
            <Button size="sm" variant="secondary" icon={<Download size={15} />} disabled={dirty || busy !== null || proofStatus !== 'COMPLETED'} loading={busy === 'export'} onClick={() => void exportVideo('final')}>
              导出高清
            </Button>
            <Button size="sm" icon={<Save size={15} />} disabled={!dirty || busy !== null} loading={busy === 'save'} onClick={() => void save()}>
              保存版本
            </Button>
          </div>
        </div>
      )}
      sidebar={sceneRail}
      inspector={selected ? (
        <div className="space-y-4 p-4">
          <div>
            <label htmlFor="video-scene-title" className="mb-1.5 block text-xs font-medium">场景标题</label>
            <input id="video-scene-title" value={selected.title} onChange={(event) => updateSelected({ title: event.target.value })} className="h-9 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-sm" />
          </div>
          <div className="rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3 text-xs text-[var(--app-text-secondary)]">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">画面素材：{selected.visual.source_ref || '未选择'}</span>
              <Button size="sm" variant="secondary" icon={<Link2 size={14} />} onClick={() => setMaterialTarget('visual')}>选择</Button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span>音频素材：{selected.audio_cues.length} 个</span>
              <Button size="sm" variant="secondary" icon={<Link2 size={14} />} onClick={() => setMaterialTarget('audio')}>添加</Button>
            </div>
          </div>
          <div>
            <label htmlFor="video-scene-narration" className="mb-1.5 block text-xs font-medium">旁白</label>
            <Textarea id="video-scene-narration" value={selected.narration.text} onChange={(event) => updateSelected({ narration: { ...selected.narration, text: event.target.value } })} rows={7} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium">时长（毫秒）
              <input type="number" min={100} step={100} value={selected.duration_ms} onChange={(event) => updateSelected({ duration_ms: Number(event.target.value) })} className="mt-1.5 h-9 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-sm" />
            </label>
            <label className="text-xs font-medium">转场
              <select value={selected.transition} onChange={(event) => updateSelected({ transition: event.target.value as VideoScene['transition'] })} className="mt-1.5 h-9 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm">
                <option value="cut">直接切换</option>
                <option value="fade">淡入淡出</option>
                <option value="dissolve">溶解</option>
                <option value="slide">滑动</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium">
            <input type="checkbox" checked={selected.subtitles.enabled} onChange={(event) => updateSelected({ subtitles: { ...selected.subtitles, enabled: event.target.checked } })} />
            启用字幕
          </label>
          <WorkspaceVersionHistory projectId={projectId} kind="video" revision={workspace.revision} onRestored={onChanged} />
        </div>
      ) : null}
      statusBar={<WorkspaceStatusBar>{proofStatus === 'COMPLETED' ? '预览已完成，可导出高清' : proofStatus === 'FAILED' ? '预览导出失败，请查看任务中心' : message || `${document.aspect_ratio} · ${dirty ? '有未保存修改' : '已保存'}`}</WorkspaceStatusBar>}
    >
      <div className="flex h-full min-h-0 items-center justify-center overflow-auto bg-[var(--app-canvas)] p-6">
        {selected ? (
          <article className="flex aspect-video w-full max-w-4xl flex-col justify-between overflow-hidden rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] p-8 shadow-[var(--app-shadow-card)]">
            {proofTask?.status === 'COMPLETED' && proofTask.downloadUrl ? (
              <video className="h-full w-full rounded-[var(--app-radius-control)] bg-black object-contain" controls src={getImageUrl(proofTask.downloadUrl)} aria-label="视频预览" />
            ) : (
              <>
                <div className="text-xs text-[var(--app-text-tertiary)]">{selected.visual.kind} · {selected.visual.source_ref || '待生成画面'}</div>
                <div>
                  <h1 className="text-3xl font-semibold">{selected.title}</h1>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--app-text-secondary)]">{selected.narration.text}</p>
                </div>
                <div className="text-xs text-[var(--app-text-tertiary)]">{selected.duration_ms}ms · {selected.transition} · {selected.animation.intensity}</div>
              </>
            )}
          </article>
        ) : (
          <p className="text-sm text-[var(--app-text-secondary)]">暂无场景</p>
        )}
      </div>
      <MaterialSelector
        projectId={projectId}
        isOpen={materialTarget !== null}
        onClose={() => setMaterialTarget(null)}
        onSelect={handleMaterialSelect}
        multiple={false}
        maxSelection={1}
        mediaKindFilter={materialTarget === 'audio' ? ['audio'] : ['image', 'video']}
      />
    </WorkspaceShell>
  );
}
