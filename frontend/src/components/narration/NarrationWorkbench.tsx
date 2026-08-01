import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, PanelRight, Pause, Play, Save, Sparkles, Square, Unlock, X } from 'lucide-react';

import {
  applyNarrationVersion,
  cancelNarrationAiJob,
  createNarrationAiCandidate,
  createNarrationAiJob,
  createPageNarrationVersion,
  discardNarrationCandidate,
  getPageNarrationVersions,
  getProjectNarrations,
  getNarrationAiJobResult,
  pauseNarrationAiJob,
  previewPageNarration,
  resumeNarrationAiJob,
  setPageNarrationLock,
} from '@/api/endpoints';
import { Button, SegmentedControl } from '@/components/shared';
import type {
  NarrationMode,
  NarrationAiJobResult,
  NarrationPreviewResult,
  NarrationSegment,
  NarrationVersion,
  NarrationVersionsResponse,
  ProjectNarrationSummary,
} from '@/types';
import { NarrationEditor, type NarrationEditorSegment } from './NarrationEditor';
import { NarrationInspector } from './NarrationInspector';


interface NarrationWorkbenchProps {
  open: boolean;
  projectId: string;
  initialPageId?: string;
  pageIds?: string[];
  onClose: () => void;
  onSummaryChange?: (summary: ProjectNarrationSummary) => void;
}

type Draft = {
  mode: NarrationMode;
  language: string;
  text: string;
  segments: NarrationEditorSegment[];
};

const EMPTY_DRAFT: Draft = { mode: 'single', language: 'zh-CN', text: '', segments: [] };

function errorMessage(error: unknown) {
  const candidate = error as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return candidate.response?.data?.error?.message || candidate.message || '操作失败，请重试';
}

function versionDraft(version?: NarrationVersion): Draft {
  if (!version) return { ...EMPTY_DRAFT };
  return {
    mode: version.mode,
    language: version.language || 'zh-CN',
    text: version.text,
    segments: (version.segments || []).map((segment, index) => ({
      ...segment,
      segment_id: segment.segment_id || `segment-${index + 1}`,
      speaker_id: segment.speaker_id || 'host',
      text: segment.text || '',
    })),
  };
}

export function NarrationWorkbench({
  open,
  projectId,
  initialPageId,
  pageIds,
  onClose,
  onSummaryChange,
}: NarrationWorkbenchProps) {
  const [summary, setSummary] = useState<ProjectNarrationSummary | null>(null);
  const [selectedPageId, setSelectedPageId] = useState(initialPageId || '');
  const [details, setDetails] = useState<NarrationVersionsResponse | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [savedDraft, setSavedDraft] = useState<Draft>(EMPTY_DRAFT);
  const [preview, setPreview] = useState<NarrationPreviewResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [aiJob, setAiJob] = useState<NarrationAiJobResult | null>(null);
  const [aiJobPending, setAiJobPending] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const visiblePages = useMemo(() => (
    summary?.pages.filter((page) => !pageIds?.length || pageIds.includes(page.page_id)) || []
  ), [pageIds, summary]);

  useEffect(() => () => {
    if (preview?.audio_url.startsWith('blob:')) URL.revokeObjectURL(preview.audio_url);
  }, [preview?.audio_url]);

  const refreshSummary = useCallback(async () => {
    const response = await getProjectNarrations(projectId);
    if (!response.data) throw new Error('文案摘要为空');
    setSummary(response.data);
    onSummaryChange?.(response.data);
    return response.data;
  }, [onSummaryChange, projectId]);

  useEffect(() => {
    if (!open || !aiJob || ['PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(aiJob.status)) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void getNarrationAiJobResult(projectId, aiJob.task_id)
        .then(async (response) => {
          if (!active || !response.data) return;
          setAiJob(response.data);
          if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(response.data.status)) await refreshSummary();
        })
        .catch((cause) => active && setError(errorMessage(cause)));
    }, 1000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [aiJob, open, projectId, refreshSummary]);

  const loadPage = useCallback(async (pageId: string) => {
    const response = await getPageNarrationVersions(projectId, pageId);
    if (!response.data) throw new Error('旁白版本为空');
    const current = response.data.versions.find((item) => item.id === response.data?.current_version_id)
      || response.data.versions.find((item) => item.status === 'applied');
    const nextDraft = versionDraft(current);
    setDetails(response.data);
    setDraft(nextDraft);
    setSavedDraft(nextDraft);
    setPreview(null);
    setSelectedPageId(pageId);
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setPending(true);
    setError('');
    void refreshSummary()
      .then((nextSummary) => {
        if (!active) return;
        const allowed = nextSummary.pages.filter((page) => !pageIds?.length || pageIds.includes(page.page_id));
        const target = allowed.some((page) => page.page_id === initialPageId)
          ? initialPageId!
          : allowed[0]?.page_id;
        return target ? loadPage(target) : undefined;
      })
      .catch((cause) => active && setError(errorMessage(cause)))
      .finally(() => active && setPending(false));
    return () => { active = false; };
  }, [initialPageId, loadPage, open, pageIds, refreshSummary]);

  const requestClose = useCallback(() => {
    if (dirty) {
      setError('请先保存或放弃当前修改');
      return;
    }
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, requestClose]);

  if (!open) return null;

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  };

  const reload = async () => {
    await Promise.all([refreshSummary(), loadPage(selectedPageId)]);
  };

  const save = () => run(async () => {
    if (!details || !selectedPageId) return;
    await createPageNarrationVersion(projectId, selectedPageId, {
      baseRevision: details.revision,
      mode: draft.mode,
      language: draft.language,
      text: draft.text,
      segments: draft.segments as NarrationSegment[],
    });
    await reload();
  });

  const startMissingAiJob = async () => {
    setAiJobPending(true);
    setError('');
    try {
      const failedPageIds = aiJob?.pages.filter((page) => page.status === 'failed').map((page) => page.page_id) || [];
      const response = await createNarrationAiJob(projectId, failedPageIds.length
        ? { scope: 'selected', pageIds: failedPageIds, operation: 'generate' }
        : { scope: 'missing', operation: 'generate' });
      if (!response.data) throw new Error('AI 文案任务创建失败');
      setAiJob({ ...response.data, completed: 0, failed: 0, skipped: 0, pages: [] });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAiJobPending(false);
    }
  };

  const controlAiJob = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!aiJob) return;
    setAiJobPending(true);
    setError('');
    try {
      const request = action === 'pause' ? pauseNarrationAiJob : action === 'resume' ? resumeNarrationAiJob : cancelNarrationAiJob;
      const response = await request(projectId, aiJob.task_id);
      if (response.data?.status) setAiJob((value) => value ? { ...value, status: response.data!.status } : value);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setAiJobPending(false);
    }
  };

  const speakers = Array.from(new Set([
    'host',
    'expert',
    ...draft.segments.map((segment) => segment.speaker_id),
  ])).map((id) => ({ id, name: id === 'host' ? '主持人' : id === 'expert' ? '嘉宾' : id }));

  return (
    <div className="fixed inset-y-0 left-0 right-0 z-[130] bg-[var(--app-bg)] text-[var(--app-text)] lg:left-[var(--project-nav-offset,216px)]" role="dialog" aria-modal="true" aria-label="视频文案工作台">
      <div className="grid h-[100dvh] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
        <header className="flex min-h-14 items-center justify-between gap-4 border-b border-[var(--app-border)] bg-[var(--app-surface)] px-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">视频文案工作台</h2>
            <p className="text-xs text-[var(--app-text-tertiary)]">
              已确认 {summary?.confirmed_pages || 0} 页 · 缺失 {summary?.missing_pages || 0} 页 · 候选 {summary?.candidate_pages || 0} 页
            </p>
          </div>
          <div className="flex items-center gap-2">
            {aiJob && (
              <div aria-live="polite" className="flex items-center gap-2 text-xs text-[var(--app-text-secondary)]">
                <span>{aiJob.completed} / {aiJob.total}</span>
                <span>失败 {aiJob.failed}</span>
                <span>跳过 {aiJob.skipped}</span>
                {['PENDING', 'PROCESSING', 'RUNNING'].includes(aiJob.status) && (
                  <Button type="button" variant="secondary" size="sm" disabled={aiJobPending} icon={<Pause size={14} aria-hidden="true" />} onClick={() => void controlAiJob('pause')}>暂停</Button>
                )}
                {aiJob.status === 'PAUSED' && (
                  <Button type="button" variant="secondary" size="sm" disabled={aiJobPending} icon={<Play size={14} aria-hidden="true" />} onClick={() => void controlAiJob('resume')}>恢复</Button>
                )}
                {!['COMPLETED', 'FAILED', 'CANCELLED'].includes(aiJob.status) && (
                  <Button type="button" variant="secondary" size="sm" disabled={aiJobPending} icon={<Square size={13} aria-hidden="true" />} onClick={() => void controlAiJob('cancel')}>取消</Button>
                )}
              </div>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<Sparkles size={15} aria-hidden="true" />}
              disabled={aiJobPending || summary?.missing_pages === 0 || !!aiJob && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(aiJob.status)}
              onClick={() => void startMissingAiJob()}
            >{aiJob?.failed ? '重试失败页' : 'AI 生成缺失页'}</Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 w-10 px-0 min-[1280px]:hidden"
              icon={<PanelRight size={17} aria-hidden="true" />}
              aria-label="显示或隐藏检查器"
              onClick={() => setInspectorOpen((value) => !value)}
            ><span className="sr-only">检查器</span></Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 w-10 px-0"
              icon={<X size={18} aria-hidden="true" />}
              aria-label="返回当前工作区"
              title="返回当前工作区"
              onClick={requestClose}
            ><span className="sr-only">关闭</span></Button>
          </div>
        </header>

        <div className="relative grid min-h-0 min-w-0 grid-cols-[216px_minmax(0,1fr)_320px] overflow-hidden max-[1279px]:grid-cols-[196px_minmax(0,1fr)]">
          <nav aria-label="旁白页面" className="min-h-0 min-w-0 overflow-y-auto border-r border-[var(--app-border)] bg-[var(--app-surface-secondary)] p-2">
            {visiblePages.map((page) => (
              <button
                key={page.page_id}
                type="button"
                disabled={pending}
                onClick={() => {
                  if (dirty) {
                    setError('请先保存或放弃当前修改');
                    return;
                  }
                  void run(() => loadPage(page.page_id));
                }}
                className={`mb-1 w-full rounded-[var(--app-radius-control)] px-3 py-2 text-left text-sm transition-colors ${
                  page.page_id === selectedPageId
                    ? 'bg-[var(--app-surface)] font-semibold shadow-[var(--app-shadow-control)]'
                    : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]'
                }`}
              >
                <span className="block">第 {page.order_index + 1} 页</span>
                <span className="block text-xs font-normal text-[var(--app-text-tertiary)]">
                  {page.current_version_id ? `${page.word_count} 字` : '缺少确认稿'}
                  {page.candidate_count > 0 ? ` · ${page.candidate_count} 个候选` : ''}
                </span>
              </button>
            ))}
          </nav>

          <main className="min-h-0 min-w-0 overflow-y-auto bg-[var(--app-surface)] p-5">
            <div className="mx-auto max-w-3xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] pb-4">
                <SegmentedControl
                  ariaLabel="旁白模式"
                  value={draft.mode}
                  disabled={pending || details?.locked}
                  onChange={(mode) => setDraft((value) => ({ ...value, mode }))}
                  options={[
                    { value: 'single', label: '单人旁白' },
                    { value: 'dialogue', label: '多人对话' },
                  ]}
                />
                <label className="flex items-center gap-2 text-sm text-[var(--app-text-secondary)]">
                  <span>文案语言</span>
                  <select
                    aria-label="文案语言"
                    value={draft.language}
                    disabled={pending || details?.locked}
                    onChange={(event) => setDraft((value) => ({ ...value, language: event.target.value }))}
                    className="h-9 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 outline-none focus-visible:border-[var(--app-accent)] focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
                  >
                    <option value="zh-CN">中文</option>
                    <option value="en-US">English</option>
                    <option value="ja-JP">日本語</option>
                    <option value="auto">自动识别</option>
                  </select>
                </label>
              </div>
              <NarrationEditor
                mode={draft.mode}
                text={draft.text}
                segments={draft.segments}
                speakers={speakers}
                disabled={pending || details?.locked}
                onTextChange={(text) => setDraft((value) => ({ ...value, text }))}
                onSegmentsChange={(segments) => setDraft((value) => ({
                  ...value,
                  segments,
                  text: segments.map((segment) => segment.text.trim()).filter(Boolean).join('\n'),
                }))}
              />
            </div>
          </main>

          <div className={`${inspectorOpen ? 'block' : 'hidden'} min-h-0 min-w-0 border-l border-[var(--app-border)] max-[1279px]:absolute max-[1279px]:inset-y-0 max-[1279px]:right-0 max-[1279px]:z-10 max-[1279px]:w-[320px] max-[1279px]:shadow-[var(--app-shadow-panel)] min-[1280px]:block`}>
            <NarrationInspector
              versions={details?.versions || []}
              currentVersionId={details?.current_version_id}
              preview={preview}
              disabled={pending || details?.locked}
              onGenerate={(operation, instruction) => void run(async () => {
                if (!details) return;
                const response = await createNarrationAiCandidate(projectId, selectedPageId, {
                  operation,
                  baseVersionId: details.current_version_id || undefined,
                  baseRevision: details.revision,
                  instruction,
                });
                if (response.data?.candidate) {
                  setDetails((value) => value ? { ...value, versions: [response.data!.candidate, ...value.versions] } : value);
                }
                await refreshSummary();
              })}
              onApply={(versionId) => void run(async () => {
                if (!details) return;
                await applyNarrationVersion(projectId, selectedPageId, versionId, details.revision);
                await reload();
              })}
              onDiscard={(versionId) => void run(async () => {
                await discardNarrationCandidate(projectId, selectedPageId, versionId);
                await reload();
              })}
              onPreview={(ttsProvider, voice) => void run(async () => {
                const response = await previewPageNarration(projectId, selectedPageId, {
                  draft: { mode: draft.mode, language: draft.language, text: draft.text, segments: draft.segments as NarrationSegment[] },
                  ttsProvider,
                  voice,
                  autoEmotion: ttsProvider === 'fish_audio',
                });
                if (response.data) setPreview(response.data);
              })}
            />
          </div>
        </div>

        <footer className="flex min-h-14 items-center justify-between gap-3 border-t border-[var(--app-border)] bg-[var(--app-surface)] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <div aria-live="polite" className="min-w-0 flex-1">
            {error && <p role="alert" className="truncate text-sm text-[var(--app-error)]" title={error}>{error}</p>}
            {!error && <p className="text-xs text-[var(--app-text-tertiary)]">{dirty ? '有未保存修改' : pending ? '处理中…' : '当前稿已同步'}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              icon={details?.locked ? <Unlock size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
              disabled={pending || !details}
              onClick={() => void run(async () => {
                if (!details) return;
                await setPageNarrationLock(projectId, selectedPageId, !details.locked, details.revision);
                await reload();
              })}
            >{details?.locked ? '解除锁定' : '锁定本页'}</Button>
            {dirty && (
              <Button type="button" variant="secondary" disabled={pending} onClick={() => { setDraft(savedDraft); setError(''); }}>
                放弃修改
              </Button>
            )}
            <Button
              type="button"
              icon={<Save size={16} aria-hidden="true" />}
              disabled={pending || !dirty || details?.locked || !draft.text.trim()}
              onClick={save}
            >保存确认稿</Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
