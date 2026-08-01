import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film } from 'lucide-react';
import { Button } from '@/components/shared';
import { getProject } from '@/api/endpoints';
import { useWorkspaceGenerationStore } from '@/store/useWorkspaceGenerationStore';
import { useContentProjectStore, selectContentWorkspace } from '@/store/useContentProjectStore';
import type { Page } from '@/types';

/**
 * PPT → 视频转换向导（重构计划 §6.2 / 阶段5）。
 * 共用入口：图片模式与原生编辑器均通过它发起 PPT 派生视频生成运行。
 * 只创建运行，从不直接写正式视频工作区。
 */
export function PptToVideoWizard(props: {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  if (!props.isOpen) return null;
  return <PptToVideoWizardInner {...props} />;
}

function PptToVideoWizardInner({ projectId, isOpen, onClose, onCreated }: {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const navigate = useNavigate();
  const project = useContentProjectStore((state) => state.project);
  const { createRun, error } = useWorkspaceGenerationStore();
  const [pageIds, setPageIds] = useState<Set<string>>(new Set());
  const [scriptSource, setScriptSource] = useState<'confirmed_narration' | 'page'>('confirmed_narration');
  const [visualStrategy, setVisualStrategy] = useState<'reuse_ppt' | 'generate'>('reuse_ppt');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [voiceProfileId, setVoiceProfileId] = useState('edge:zh-CN-XiaoxiaoNeural');
  const [expressivenessId, setExpressivenessId] = useState('expression.standard.v1');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pages, setPages] = useState<Page[]>([]);
  const videoWorkspace = selectContentWorkspace(project, 'video');
  const hasFormalVersion = Boolean(videoWorkspace && videoWorkspace.state !== 'uninitialized');

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void getProject(projectId).then((response) => {
      if (!active) return;
      const loaded = (response.data?.pages || []) as Page[];
      setPages(loaded);
      setPageIds(new Set(loaded.slice(0, 10).map((page) => page.page_id)));
    }).catch(() => {
      if (active) setPages([]);
    });
    setScriptSource('confirmed_narration');
    setVisualStrategy('reuse_ppt');
    setAspectRatio('16:9');
    setVoiceProfileId('edge:zh-CN-XiaoxiaoNeural');
    setExpressivenessId('expression.standard.v1');
    setBusy(false);
    setMessage('');
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId]);

  const togglePage = (pageId: string) => {
    setPageIds((current) => {
      const next = new Set(current);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const start = async () => {
    if (!pageIds.size) {
      setMessage('请至少选择一页');
      return;
    }
    setBusy(true);
    setMessage('');
    const run = await createRun(projectId, {
      targetWorkspaceKind: 'video',
      sourceKind: 'ppt',
      mode: 'ai_adapt',
      operation: 'generate',
      pageIds: Array.from(pageIds),
      options: {
        script_source: scriptSource,
        visual_strategy: visualStrategy,
        aspect_ratio: aspectRatio,
        voice_profile_id: voiceProfileId,
        expressiveness_id: expressivenessId,
      },
    });
    if (run?.run_id) {
      onCreated?.();
      onClose();
      navigate(`/project/${projectId}/video/review/${run.run_id}`);
    } else {
      setMessage(error || '创建生成运行失败');
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-6" role="dialog" aria-modal="true" aria-label="从 PPT 转换视频">
      <button type="button" aria-label="关闭转换向导" className="fixed inset-0 cursor-default" onClick={onClose} />
      <section className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow-floating)]">
        <div className="flex items-center gap-2">
          <Film size={18} className="text-[var(--app-accent)]" aria-hidden="true" />
          <h2 className="text-lg font-semibold">从 PPT 转换视频</h2>
        </div>
        {hasFormalVersion && (
          <p className="mt-2 rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] p-3 text-xs leading-5 text-[var(--app-text-secondary)]">
            项目已有正式视频版本。本次转换会生成新候选供审查，发布前不会覆盖现有版本。
          </p>
        )}

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-[var(--app-text-secondary)]">选择页面（{pageIds.size}/{pages.length}）</p>
            <ul className="mt-2 grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto">
              {pages.map((page) => (
                <li key={page.page_id}>
                  <label className={`flex cursor-pointer items-center gap-2 rounded-[var(--app-radius-control)] border px-3 py-2 text-sm ${pageIds.has(page.page_id) ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)]' : 'border-[var(--app-border)] hover:bg-[var(--app-surface-hover)]'}`}>
                    <input type="checkbox" checked={pageIds.has(page.page_id)} onChange={() => togglePage(page.page_id)} className="h-4 w-4 accent-[var(--app-accent)]" />
                    <span className="min-w-0 truncate">第 {page.order_index + 1} 页</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <label className="grid gap-1.5 text-xs font-medium text-[var(--app-text-secondary)]">
            <span>旁白来源</span>
            <select value={scriptSource} onChange={(event) => setScriptSource(event.target.value as typeof scriptSource)} className="h-9 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm">
              <option value="confirmed_narration">已确认视频文案（优先）</option>
              <option value="page">页面内容（无确认稿时）</option>
            </select>
          </label>

          <label className="grid gap-1.5 text-xs font-medium text-[var(--app-text-secondary)]">
            <span>画面策略</span>
            <select value={visualStrategy} onChange={(event) => setVisualStrategy(event.target.value as typeof visualStrategy)} className="h-9 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm">
              <option value="reuse_ppt">复用 PPT 页面画面</option>
              <option value="generate">生成新画面</option>
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-xs font-medium text-[var(--app-text-secondary)]">
              <span>画幅</span>
              <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as typeof aspectRatio)} className="h-9 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm">
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-[var(--app-text-secondary)]">
              <span>表现力</span>
              <select value={expressivenessId} onChange={(event) => setExpressivenessId(event.target.value)} className="h-9 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm">
                <option value="expression.standard.v1">标准</option>
                <option value="expression.warm.v1">温暖</option>
                <option value="expression.energetic.v1">活力</option>
              </select>
            </label>
          </div>

          <label className="grid gap-1.5 text-xs font-medium text-[var(--app-text-secondary)]">
            <span>默认声音</span>
            <input value={voiceProfileId} onChange={(event) => setVoiceProfileId(event.target.value)} className="h-9 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm" placeholder="edge:voice 或 fish:voice-id" />
          </label>
        </div>

        {message && <p role="alert" className="mt-3 text-xs text-[var(--app-error)]">{message}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>取消</Button>
          <Button size="sm" loading={busy} onClick={() => void start()}>开始转换</Button>
        </div>
      </section>
    </div>
  );
}
