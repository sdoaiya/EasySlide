import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Pause, Play, RefreshCw, Rocket, Sparkles, Square, XCircle } from 'lucide-react';
import { Button, Loading, Textarea } from '@/components/shared';
import { WorkspaceStatusBar } from '@/components/workspace/WorkspaceStatusBar';
import { useWorkspaceGenerationStore } from '@/store/useWorkspaceGenerationStore';
import { useContentProjectStore } from '@/store/useContentProjectStore';
import type { WorkspaceGenerationRun } from '@/types';

const OPERATION_LABELS: Record<string, string> = {
  generate: '生成',
  polish: '润色',
  shorten: '精简',
  expand: '扩写',
  regenerate: '重写',
};

type ReviewItem = {
  id: string;
  title: string;
  text: string;
  meta: string;
};

function extractItems(run: WorkspaceGenerationRun): ReviewItem[] {
  const candidate = run.candidate || {};
  const scenes = candidate.scenes || [];
  const segments = candidate.segments || [];
  return (scenes.length ? scenes : segments).map((item: any, index: number) => ({
    id: String(item.scene_id || item.segment_id || `item.${index + 1}`),
    title: String(item.title || (item.speaker_id ? `片段 ${index + 1}` : `场景 ${index + 1}`)),
    text: String((item.narration?.text ?? item.text) || ''),
    meta: item.visual?.source_ref
      ? `源页面 ${item.visual.source_ref} · R${item.visual.source_revision ?? '?'}`
      : item.source_ref
        ? `源 ${item.source_ref}`
        : item.speaker_id
          ? `角色 ${item.speaker_id}`
          : '',
  }));
}

export function WorkspaceGenerationReview({ projectId, runId }: { projectId: string; runId: string }) {
  const navigate = useNavigate();
  const { getRun, controlRun, publishRun, optimizeRun, error } = useWorkspaceGenerationStore();
  const [run, setRun] = useState<WorkspaceGenerationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'publish' | 'optimize' | 'control' | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [operation, setOperation] = useState<'polish' | 'shorten' | 'expand' | 'regenerate'>('polish');
  const [instruction, setInstruction] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const next = await getRun(projectId, runId);
    if (next) {
      setRun(next);
      if (next.status === 'REVIEW_READY') {
        setSelectedIds((current) => current.size ? current : new Set());
      }
    }
    setLoading(false);
  }, [getRun, projectId, runId]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      const status = useWorkspaceGenerationStore.getState().runs.find((item) => item.run_id === runId)?.status;
      if (['PENDING', 'RUNNING', 'PAUSED', 'PUBLISHING'].includes(status || '')) {
        void refresh();
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [refresh, runId]);

  const items = useMemo(() => (run ? extractItems(run) : []), [run]);
  const targetKind = run?.target_workspace_kind || 'video';
  const status = run?.status;
  const stale = Boolean(run?.stale);
  const running = status === 'PENDING' || status === 'RUNNING';
  const reviewable = status === 'REVIEW_READY' || status === 'STALE';
  const kindLabel = run?.target_workspace_kind === 'podcast' ? '播客' : '视频';

  const handleControl = async (action: 'pause' | 'resume' | 'cancel' | 'retry') => {
    setBusy('control');
    setMessage('');
    await controlRun(projectId, runId, action);
    await refresh();
    setBusy(null);
  };

  const handlePublish = async () => {
    setBusy('publish');
    setMessage('');
    const published = await publishRun(projectId, runId);
    if (published?.status === 'PUBLISHED') {
      setMessage('已发布为新版本');
      await useContentProjectStore.getState().load(projectId);
      navigate(`/project/${projectId}/${targetKind}`);
    } else {
      setMessage(useWorkspaceGenerationStore.getState().error || '发布失败，请稍后重试');
    }
    setBusy(null);
  };

  const handleOptimize = async () => {
    const targetIds = selectedIds.size
      ? items.filter((item) => selectedIds.has(item.id)).map((item) => item.id)
      : items.map((item) => item.id);
    if (!targetIds.length) return;
    setBusy('optimize');
    setMessage('');
    const child = await optimizeRun(projectId, runId, {
      itemIds: targetIds,
      operation,
      instruction,
    });
    if (child?.run_id) {
      navigate(`/project/${projectId}/${targetKind}/review/${child.run_id}`);
    } else {
      setMessage(useWorkspaceGenerationStore.getState().error || '优化任务创建失败');
    }
    setBusy(null);
  };

  const toggleItem = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) return <Loading fullscreen message="正在读取生成运行" />;
  if (!run) {
    return (
      <main className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="text-sm text-[var(--app-text-secondary)]">{error || '生成运行不存在或已被删除'}</p>
          <Button size="sm" variant="secondary" className="mt-4" onClick={() => navigate(`/project/${projectId}/${targetKind}`)}>返回工作区</Button>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--app-background)]">
      <header className="flex min-h-14 items-center justify-between gap-4 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{kindLabel}候选 · {OPERATION_LABELS[run.operation] || run.operation}</h2>
          <p className="truncate text-xs text-[var(--app-text-tertiary)]">
            {run.source_kind === 'ppt' ? '来源：PPT 页面' : '来源：项目简报'} · 运行 {run.run_id.slice(0, 8)}
            {run.parent_run_id ? ` · 由 ${run.parent_run_id.slice(0, 8)} 优化而来` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {running && (
            <>
              <Button size="sm" variant="secondary" icon={<Pause size={14} />} loading={busy === 'control'} onClick={() => void handleControl('pause')}>暂停</Button>
              <Button size="sm" variant="ghost" icon={<Square size={14} />} disabled={busy === 'control'} onClick={() => void handleControl('cancel')}>取消</Button>
            </>
          )}
          {status === 'PAUSED' && (
            <Button size="sm" variant="secondary" icon={<Play size={14} />} loading={busy === 'control'} onClick={() => void handleControl('resume')}>继续</Button>
          )}
          {status === 'FAILED' && (
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={busy === 'control'} onClick={() => void handleControl('retry')}>重试</Button>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {running && (
          <div className="mx-auto max-w-2xl py-10 text-center" role="status" aria-live="polite">
            <Sparkles size={26} className="mx-auto animate-pulse text-[var(--app-accent)]" aria-hidden="true" />
            <p className="mt-4 text-sm font-medium">正在生成 {kindLabel}候选</p>
            <p className="mt-2 text-xs text-[var(--app-text-tertiary)]">长任务进入任务中心，刷新页面后仍可恢复。</p>
          </div>
        )}

        {status === 'PAUSED' && (
          <div className="mx-auto max-w-2xl py-10 text-center">
            <Pause size={24} className="mx-auto text-[var(--app-text-tertiary)]" aria-hidden="true" />
            <p className="mt-4 text-sm">生成已暂停，可继续或取消。</p>
          </div>
        )}

        {status === 'FAILED' && (
          <div className="mx-auto max-w-2xl py-10 text-center">
            <XCircle size={24} className="mx-auto text-[var(--app-error)]" aria-hidden="true" />
            <p className="mt-4 text-sm font-medium">生成失败</p>
            <p className="mt-2 text-xs text-[var(--app-text-secondary)]">{run.error_message || run.error_code || '未知错误'}</p>
            <Button size="sm" variant="secondary" className="mt-5" onClick={() => void handleControl('retry')}>重试</Button>
          </div>
        )}

        {reviewable && (
          <div className="mx-auto max-w-4xl space-y-4">
            {stale && (
              <div role="alert" className="flex items-start gap-3 rounded-[var(--app-radius-card)] border border-[var(--app-warning)]/40 bg-[var(--app-surface)] p-4">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--app-warning)]" aria-hidden="true" />
                <div className="text-sm">
                  <p className="font-medium">源 PPT 已变化</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--app-text-secondary)]">候选内容来自冻结快照，不受影响；发布前请确认是否仍要使用本候选。</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--app-text-tertiary)]">
                共 {items.length} 项 · 已选 {selectedIds.size} 项
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" icon={<Rocket size={14} />} loading={busy === 'publish'} onClick={() => void handlePublish()}>
                  发布为正式版本
                </Button>
              </div>
            </div>

            <div className="rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
              <p className="text-xs font-medium text-[var(--app-text-secondary)]">批量优化（AI 只生成新候选，不覆盖本候选）</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  aria-label="优化操作"
                  value={operation}
                  onChange={(event) => setOperation(event.target.value as typeof operation)}
                  className="h-9 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm"
                >
                  <option value="polish">润色</option>
                  <option value="shorten">精简</option>
                  <option value="expand">扩写</option>
                  <option value="regenerate">重写</option>
                </select>
                <Textarea
                  aria-label="优化要求"
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  placeholder="例如：更口语化，保留所有数字与结论"
                  className="h-9 min-h-9 flex-1 resize-y text-sm"
                />
                <Button size="sm" icon={<Sparkles size={14} />} loading={busy === 'optimize'} onClick={() => void handleOptimize()}>
                  {selectedIds.size ? `优化所选 ${selectedIds.size} 项` : '优化全部'}
                </Button>
              </div>
            </div>

            <ul className="space-y-2" aria-label="候选列表">
              {items.map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={selectedIds.has(item.id)}
                    onClick={() => toggleItem(item.id)}
                    className={`w-full rounded-[var(--app-radius-card)] border bg-[var(--app-surface)] p-4 text-left transition-colors ${selectedIds.has(item.id) ? 'border-[var(--app-accent)] shadow-[var(--app-shadow-control)]' : 'border-[var(--app-border)] hover:bg-[var(--app-surface-hover)]'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{index + 1}. {item.title}</p>
                        {item.meta && <p className="mt-0.5 truncate text-[11px] text-[var(--app-text-tertiary)]">{item.meta}</p>}
                      </div>
                      {selectedIds.has(item.id) && <CheckCircle2 size={16} className="shrink-0 text-[var(--app-accent)]" aria-label="已选择" />}
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-[var(--app-text-secondary)]">{item.text || '（无旁白文本）'}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {status === 'PUBLISHED' && (
          <div className="mx-auto max-w-2xl py-10 text-center">
            <CheckCircle2 size={26} className="mx-auto text-[var(--app-success)]" aria-hidden="true" />
            <p className="mt-4 text-sm font-medium">已发布，正在进入工作区…</p>
          </div>
        )}
      </div>

      <footer>
        <WorkspaceStatusBar>
          {message || (stale && reviewable ? '候选已过期提示：源已变化' : status === 'REVIEW_READY' ? '候选已就绪，可选择部分或全部发布' : `状态：${status}`)}
        </WorkspaceStatusBar>
      </footer>
    </div>
  );
}
