import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/shared';
import { generateMaterialImage, getTaskStatus } from '@/api/endpoints';
import { getImageUrl } from '@/api/client';

/** 封面风格预设：hint 拼进文生图 prompt，效果内置、零输入即可生成 */
const COVER_STYLES = [
  { id: 'business', label: '商务专业', hint: '深蓝与金色渐变，现代商务杂志风格，简洁高级的构图' },
  { id: 'tech', label: '科技感', hint: '深色背景配霓虹光效，未来科技感，几何线条与光晕' },
  { id: 'warm', label: '温暖治愈', hint: '暖色调柔和渐变，温馨柔和的光线，治愈系插画质感' },
  { id: 'minimal', label: '极简留白', hint: '大面积留白，少量几何色块点缀，现代极简主义' },
  { id: 'vibrant', label: '活力明快', hint: '明亮多彩渐变，动感波浪与光斑元素，充满活力' },
  { id: 'vintage', label: '复古质感', hint: '复古胶片色调，怀旧杂志拼贴风格，轻微颗粒质感' },
];

export function PodcastCoverGenerator({
  projectId,
  title,
  onSelect,
}: {
  projectId: string;
  title: string;
  onSelect: (imageUrl: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [styleId, setStyleId] = useState('business');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const style = COVER_STYLES.find((item) => item.id === styleId) || COVER_STYLES[0];
    setPrompt(`播客节目封面，${style.hint}。主题：${title || '未命名播客'}。画面以氛围和质感为主，不包含文字。`);
  }, [open, styleId, title]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await generateMaterialImage(projectId, prompt, undefined, undefined, '1:1');
      const taskId = response.data?.task_id;
      if (!taskId) throw new Error('生成任务创建失败');
      const poll = async () => {
        try {
          const status = await getTaskStatus(projectId, taskId);
          const task = status.data;
          if (task?.status === 'COMPLETED') {
            const imageUrl = (task.progress as { image_url?: string } | undefined)?.image_url;
            if (imageUrl) {
              onSelect(getImageUrl(imageUrl));
              setOpen(false);
            } else {
              setMessage('生成完成但未返回图片，请到素材库查看');
            }
            setBusy(false);
            return;
          }
          if (task?.status === 'FAILED') {
            setMessage(task.error_message || '生成失败，请重试');
            setBusy(false);
            return;
          }
          timerRef.current = window.setTimeout(poll, 2000);
        } catch (error: any) {
          setMessage(error?.message || '查询生成进度失败');
          setBusy(false);
        }
      };
      void poll();
    } catch (error: any) {
      setMessage(error?.message || '生成失败');
      setBusy(false);
    }
  };

  if (!open) {
    return <Button size="sm" variant="secondary" icon={<Sparkles size={14} />} onClick={() => setOpen(true)}>AI 生成</Button>;
  }

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/40 p-6" role="dialog" aria-modal="true" aria-label="AI 生成播客封面">
      <button type="button" aria-label="关闭封面生成" className="fixed inset-0 cursor-default" onClick={() => setOpen(false)} />
      <section className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[var(--app-radius-card)] border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow-floating)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--app-accent)]" aria-hidden="true" />
            <h2 className="text-base font-semibold">AI 生成封面</h2>
          </div>
          <button type="button" aria-label="关闭" className="text-[var(--app-text-tertiary)] hover:text-[var(--app-text-secondary)]" onClick={() => setOpen(false)}><X size={16} /></button>
        </div>

        <p className="mt-3 text-xs font-medium text-[var(--app-text-secondary)]">风格预设</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {COVER_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              onClick={() => setStyleId(style.id)}
              className={`rounded-[var(--app-radius-control)] border px-2 py-1.5 text-xs transition-colors ${styleId === style.id ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]' : 'border-[var(--app-border)] hover:bg-[var(--app-surface-hover)]'}`}
            >
              {style.label}
            </button>
          ))}
        </div>

        <label className="mt-3 grid gap-1.5 text-xs font-medium text-[var(--app-text-secondary)]">
          <span>画面描述（可修改）</span>
          <textarea value={prompt} rows={4} onChange={(event) => setPrompt(event.target.value)} className="w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm" />
        </label>

        {message && <p role="alert" className="mt-2 text-xs text-[var(--app-error)]">{message}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>取消</Button>
          <Button size="sm" icon={busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} loading={busy} disabled={busy} onClick={() => void start()}>生成封面</Button>
        </div>
      </section>
    </div>
  );
}
