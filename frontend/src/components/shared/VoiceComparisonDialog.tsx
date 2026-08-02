import { useEffect, useRef, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { apiClient } from '@/api/client';
import { Button, Modal, VoicePicker } from '@/components/shared';
import { cn } from '@/utils';

interface VoiceComparisonDialogProps {
  isOpen: boolean;
  /** 当前主声音（canonical id），作为 A 的初始值 */
  voiceA: string;
  onClose: () => void;
  /** 采用 A 或 B 时回调所选声音 */
  onAdopt: (voiceId: string) => void;
}

/**
 * A/B 声音对比弹窗：左右各选一个声音，共用同一段试听文案，
 * 播放新试听时自动停止上一段；「采用 A / 采用 B」把选中声音应用回主配置。
 */
export function VoiceComparisonDialog({ isOpen, voiceA, onClose, onAdopt }: VoiceComparisonDialogProps) {
  const [a, setA] = useState(voiceA);
  const [b, setB] = useState('');
  const [previewText, setPreviewText] = useState('欢迎使用本次演示，我们先快速了解最关键的结论和行动建议。');
  const [previewing, setPreviewing] = useState<'a' | 'b' | null>(null);
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const textRef = useRef(previewText);

  useEffect(() => {
    if (isOpen) {
      setA(voiceA);
      setB('');
      setError('');
    }
  }, [isOpen, voiceA]);

  useEffect(() => { textRef.current = previewText; }, [previewText]);

  useEffect(() => () => {
    if (audioRef.current) audioRef.current.pause();
  }, []);

  const characterCount = previewText.replace(/\s/g, '').length;
  const canPreview = characterCount >= 20 && characterCount <= 40;

  const preview = async (side: 'a' | 'b') => {
    const voiceId = side === 'a' ? a : b;
    if (!voiceId || !canPreview) return;
    setPreviewing(side);
    setError('');
    try {
      const response = await apiClient.get(`/api/voices/${encodeURIComponent(voiceId)}/preview`, {
        params: { text: textRef.current.trim() },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data as Blob);
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      setError('试听失败，请稍后重试');
    } finally {
      setPreviewing(null);
    }
  };

  const adopt = (voiceId: string) => {
    if (!voiceId) return;
    onAdopt(voiceId);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="比较声音" size="lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--app-text-secondary)]">左右选择两个声音，用同一段文案对比效果。</p>
          <span className="shrink-0 text-xs text-[var(--app-text-tertiary)]">20–40 字 · 约 5–10 秒</span>
        </div>
        <textarea
          aria-label="试听文案"
          value={previewText}
          maxLength={40}
          onChange={(event) => setPreviewText(event.target.value)}
          className="min-h-16 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] p-2 text-sm outline-none focus-visible:border-[var(--app-accent)] focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] p-3">
            <p className="text-xs font-medium text-[var(--app-text-secondary)]">声音 A · 当前</p>
            <VoicePicker value={a} onChange={setA} allowUnset={false} />
            <button
              type="button"
              onClick={() => void preview('a')}
              disabled={!a || !canPreview || !!previewing}
              className={cn('inline-flex h-9 w-full items-center justify-center gap-1 rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-3 text-sm disabled:opacity-50')}
            >
              {previewing === 'a' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}试听 A
            </button>
          </div>
          <div className="space-y-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] p-3">
            <p className="text-xs font-medium text-[var(--app-text-secondary)]">声音 B · 备选</p>
            <VoicePicker value={b} onChange={setB} allowUnset={false} />
            <button
              type="button"
              onClick={() => void preview('b')}
              disabled={!b || !canPreview || !!previewing}
              className={cn('inline-flex h-9 w-full items-center justify-center gap-1 rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-3 text-sm disabled:opacity-50')}
            >
              {previewing === 'b' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}试听 B
            </button>
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-[var(--app-error)]">{error}</p>}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--app-border)] pt-4">
          <Button type="button" variant="ghost" size="sm" disabled={!a} onClick={() => adopt(a)}>采用 A</Button>
          <Button type="button" size="sm" disabled={!b} onClick={() => adopt(b)}>采用 B</Button>
        </div>
      </div>
    </Modal>
  );
}
