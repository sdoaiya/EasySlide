import { CheckCircle2, Pencil, Save, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Loading } from '@/components/shared';
import { useContentProjectStore } from '@/store/useContentProjectStore';

export function ContentSpinePage() {
  const { project, loading, confirmSpine, updateSpine, optimizeSpine } = useContentProjectStore();
  const navigate = useNavigate();
  const [editingContext, setEditingContext] = useState(false);
  const [savingContext, setSavingContext] = useState(false);
  const [optimizingContext, setOptimizingContext] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [optimizationNote, setOptimizationNote] = useState('');
  const [contextDraft, setContextDraft] = useState({ topic: '', content: '', audience: '', goal: '' });
  const autoOpenedProject = useRef<string | null>(null);
  const document = project?.spine?.document || {};
  const contextLabel = document.audience?.value && document.goal?.value ? '编辑定位' : '补充定位';
  const contextNeedsCompletion = Boolean(
    project && project.spine.status !== 'confirmed'
      && (!document.topic?.value || !document.content?.value || !document.audience?.value || !document.goal?.value),
  );

  useEffect(() => {
    if (editingContext) return;
    setContextDraft({
      topic: document.topic?.value || '',
      content: document.content?.value || '',
      audience: document.audience?.value || '',
      goal: document.goal?.value || '',
    });
  }, [document.audience?.value, document.goal?.value, document.topic?.value, editingContext]);

  useEffect(() => {
    if (!project || editingContext || autoOpenedProject.current === project.project_id) return;
    if (contextNeedsCompletion) {
      setEditingContext(true);
      autoOpenedProject.current = project.project_id;
    }
  }, [contextNeedsCompletion, editingContext, project]);

  if (!project) return <Loading fullscreen message="正在读取内容主线" />;
  const { spine } = project;
  const sections = Array.isArray(document.sections) && document.sections.length
    ? document.sections
    : (Array.isArray(spine.preview_sections) ? spine.preview_sections : []);
  // `last_workspace` becomes `spine` while this page is open; use the initialized
  // workspace first so confirmation still returns to the user's selected output.
  const workspaceEntries = (project.workspaces || [])
    .filter((workspace) => workspace.state !== 'uninitialized')
    .map((workspace) => workspace.kind);
  const initializedWorkspace = workspaceEntries[0];
  const nextWorkspace = initializedWorkspace || (project.last_workspace && project.last_workspace !== 'spine'
    ? project.last_workspace
    : null);
  const nextPath = nextWorkspace === 'ppt'
    ? `/project/${project.project_id}/ppt/outline`
    : nextWorkspace
      ? `/project/${project.project_id}/${nextWorkspace}`
      : null;

  const confirmSpineAndContinue = async () => {
    await confirmSpine();
    if (nextPath) navigate(nextPath);
  };

  const startEditingContext = () => {
    setContextDraft({
      topic: document.topic?.value || '',
      content: document.content?.value || '',
      audience: document.audience?.value || '',
      goal: document.goal?.value || '',
    });
    setSaveError('');
    setOptimizationNote('');
    setEditingContext(true);
  };

  const optimizeContext = async () => {
    setOptimizingContext(true);
    setSaveError('');
    setOptimizationNote('');
    try {
      const result = await optimizeSpine({
        topic: contextDraft.topic.trim(),
        audience: contextDraft.audience.trim(),
        goal: contextDraft.goal.trim(),
      });
      setContextDraft((draft) => ({ ...draft, topic: result.topic, audience: result.audience, goal: result.goal }));
      setOptimizationNote(result.rationale || 'AI 已生成优化建议，请检查后保存。');
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.response?.data?.error?.message || error?.message || '';
      setSaveError(status === 429 || message.includes('429')
        ? 'AI 服务当前请求过于频繁，请稍后重试，或在设置中切换文本模型。'
        : (message || 'AI 优化失败，请稍后重试'));
    } finally {
      setOptimizingContext(false);
    }
  };

  const saveContext = async () => {
    setSavingContext(true);
    setSaveError('');
    const topic = contextDraft.topic.trim();
    const content = contextDraft.content.trim();
    const audience = contextDraft.audience.trim();
    const goal = contextDraft.goal.trim();
    const nextNeedsConfirmation = new Set(
      Array.isArray(document.needs_confirmation)
        ? document.needs_confirmation.filter((path: unknown) => !['/topic', '/content', '/audience', '/goal'].includes(String(path)))
        : [],
    );
    if (!topic) nextNeedsConfirmation.add('/topic');
    if (!content) nextNeedsConfirmation.add('/content');
    if (!audience) nextNeedsConfirmation.add('/audience');
    if (!goal) nextNeedsConfirmation.add('/goal');
    const nextDocument = {
      ...document,
      topic: { ...(document.topic || {}), value: topic, needs_confirmation: !topic },
      content: { ...(document.content || {}), value: content, needs_confirmation: !content },
      audience: { ...(document.audience || {}), value: audience, needs_confirmation: !audience },
      goal: { ...(document.goal || {}), value: goal, needs_confirmation: !goal },
      needs_confirmation: Array.from(nextNeedsConfirmation),
    };
    try {
      await updateSpine(nextDocument);
      setEditingContext(false);
    } catch (error: any) {
      setSaveError(error?.response?.data?.error?.message || error?.message || '保存定位失败，请稍后重试');
    } finally {
      setSavingContext(false);
    }
  };

  return (
    <main className="h-full overflow-auto px-8 py-7">
      <header className="flex items-start justify-between gap-6 border-b border-[var(--app-border)] pb-5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">内容主线 · R{spine.revision}</p>
          <h1
            title={document.topic?.value || '内容主线'}
            className="mt-2 min-w-0 max-w-[min(100%,760px)] truncate text-lg font-semibold leading-6"
          >
            {document.topic?.value || '内容主线'}
          </h1>
          <p className="mt-1 text-xs text-[var(--app-text-tertiary)]">主题、受众、目标和叙事结构的共同基线</p>
          {!editingContext && <p className="mt-2 text-sm text-[var(--app-text-secondary)]">受众：{document.audience?.value || '待补充'} · 目标：{document.goal?.value || '待补充'}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
          {!editingContext && (
            <Button className="shrink-0 whitespace-nowrap" size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={startEditingContext}>
              {contextLabel}
            </Button>
          )}
          {!editingContext && spine.status === 'confirmed' ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-sm text-[var(--app-success)]"><CheckCircle2 size={16} />已确认</span>
            {workspaceEntries.length ? workspaceEntries.map((kind) => (
              <Button key={kind} className="shrink-0 whitespace-nowrap" size="sm" variant="secondary" onClick={() => navigate(kind === 'ppt' ? `/project/${project.project_id}/ppt/outline` : `/project/${project.project_id}/${kind}`)}>
                进入{kind === 'ppt' ? 'PPT' : kind === 'video' ? '视频' : '播客'}工作区
              </Button>
            )) : nextPath && <Button className="shrink-0 whitespace-nowrap" size="sm" variant="secondary" onClick={() => navigate(nextPath)}>进入{nextWorkspace === 'ppt' ? 'PPT' : nextWorkspace === 'video' ? '视频' : '播客'}工作区</Button>}
          </div>
          ) : !editingContext ? (
          <Button className="shrink-0 whitespace-nowrap" size="sm" loading={loading} onClick={() => void confirmSpineAndContinue()}>确认内容主线</Button>
          ) : null}
        </div>
      </header>
      {editingContext && (
        <section aria-label="编辑内容主线定位" className="mt-5 rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow-soft)]">
          <div className="grid gap-4 lg:grid-cols-3">
            <label className="text-sm font-medium text-[var(--app-text)]">
              主题
              <textarea aria-label="主题" rows={2} value={contextDraft.topic} onChange={(event) => setContextDraft((draft) => ({ ...draft, topic: event.target.value }))} className="mt-1.5 min-h-10 max-h-24 w-full resize-y overflow-auto break-words rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 font-normal leading-5 outline-none focus:border-[var(--app-accent)]" />
            </label>
            <label className="text-sm font-medium text-[var(--app-text)] lg:col-span-3">
              内容说明
              <textarea aria-label="内容说明" rows={4} placeholder="填写要表达的事实、观点、数据或素材范围，叙事结构会据此拆分章节" value={contextDraft.content} onChange={(event) => setContextDraft((draft) => ({ ...draft, content: event.target.value }))} className="mt-1.5 min-h-20 max-h-40 w-full resize-y overflow-auto break-words rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 font-normal leading-5 outline-none focus:border-[var(--app-accent)]" />
            </label>
            <label className="text-sm font-medium text-[var(--app-text)]">
              受众
              <input aria-label="受众" placeholder="例如：管理层、客户或公众" value={contextDraft.audience} onChange={(event) => setContextDraft((draft) => ({ ...draft, audience: event.target.value }))} className="mt-1.5 h-10 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 font-normal outline-none focus:border-[var(--app-accent)]" />
            </label>
            <label className="text-sm font-medium text-[var(--app-text)]">
              目标
              <input aria-label="目标" placeholder="例如：形成决策共识或推动下一步行动" value={contextDraft.goal} onChange={(event) => setContextDraft((draft) => ({ ...draft, goal: event.target.value }))} className="mt-1.5 h-10 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 font-normal outline-none focus:border-[var(--app-accent)]" />
            </label>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="min-w-0 text-xs text-[var(--app-text-tertiary)]">
              <p>可先手动填写，再让 AI 优化定位；保存后会生成新的内容主线版本，需要重新确认。</p>
              {optimizationNote && <p className="mt-1 text-[var(--app-accent)]">{optimizationNote}</p>}
            </div>
            <div className="flex items-center gap-2">
              {saveError && <span role="alert" className="text-xs text-[var(--app-danger)]">{saveError}</span>}
              <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} loading={optimizingContext} onClick={() => void optimizeContext()}>AI 优化定位</Button>
              <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => { setEditingContext(false); setSaveError(''); }}>取消</Button>
              <Button size="sm" icon={<Save size={14} />} loading={savingContext} onClick={() => void saveContext()}>保存定位</Button>
            </div>
          </div>
        </section>
      )}
      <section className="py-6">
        <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">叙事结构</h2>
              <p className="mt-1 text-xs text-[var(--app-text-tertiary)]">生成标准：建立背景 → 展开问题或证据 → 给出结论与行动；优先依据内容说明，再结合受众和目标调整重点。</p>
            </div>
          {!document.sections?.length && sections.length > 0 && spine.status !== 'confirmed' && (
            <span className="text-xs text-[var(--app-text-tertiary)]">确认后将冻结为内容主线</span>
          )}
        </div>
        <div className="mt-3 divide-y divide-[var(--app-border)] border-y border-[var(--app-border)]">
          {sections.length ? sections.map((section: any, index: number) => (
            <article key={section.id || index} className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 py-4">
              <span className="text-xs tabular-nums text-[var(--app-text-tertiary)]">{String(index + 1).padStart(2, '0')}</span>
              <div><h3 className="text-sm font-medium">{section.title}</h3><p className="mt-1 text-sm leading-6 text-[var(--app-text-secondary)]">{section.summary || '待补充摘要'}</p></div>
            </article>
          )) : <p className="py-8 text-sm text-[var(--app-text-secondary)]">内容主线尚无章节。</p>}
        </div>
      </section>
    </main>
  );
}
