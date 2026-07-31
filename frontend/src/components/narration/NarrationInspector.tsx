import { useState } from 'react';
import { Play, Sparkles, Trash2, Undo2 } from 'lucide-react';

import { Button, SegmentedControl, Textarea } from '@/components/shared';
import type { NarrationPreviewResult, NarrationVersion } from '@/types';


type InspectorTab = 'ai' | 'versions' | 'preview';

interface NarrationInspectorProps {
  versions: NarrationVersion[];
  currentVersionId?: string | null;
  preview?: NarrationPreviewResult | null;
  disabled?: boolean;
  onGenerate: (operation: string, instruction: string) => void;
  onApply: (versionId: string) => void;
  onDiscard: (versionId: string) => void;
  onPreview: (provider: 'edge' | 'fish_audio', voice: string) => void;
}

export function NarrationInspector({
  versions,
  currentVersionId,
  preview,
  disabled = false,
  onGenerate,
  onApply,
  onDiscard,
  onPreview,
}: NarrationInspectorProps) {
  const [tab, setTab] = useState<InspectorTab>('ai');
  const [operation, setOperation] = useState('polish');
  const [instruction, setInstruction] = useState('');
  const [provider, setProvider] = useState<'edge' | 'fish_audio'>('edge');
  const [voice, setVoice] = useState('zh-CN-XiaoxiaoNeural');
  const effectiveOperation = currentVersionId ? operation : 'generate';

  return (
    <aside aria-label="旁白检查器" className="flex h-full min-h-0 flex-col bg-[var(--app-surface-secondary)]">
      <div className="border-b border-[var(--app-border)] p-3">
        <SegmentedControl
          ariaLabel="旁白检查器视图"
          value={tab}
          onChange={setTab}
          className="w-full"
          options={[
            { value: 'ai', label: 'AI 润色' },
            { value: 'versions', label: '版本' },
            { value: 'preview', label: '试听' },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'ai' && (
          <div className="space-y-4">
            <label className="grid gap-1.5 text-sm font-medium text-[var(--app-text-secondary)]">
              <span>处理方式</span>
              <select
                aria-label="AI 处理方式"
                value={effectiveOperation}
                disabled={disabled}
                onChange={(event) => setOperation(event.target.value)}
                className="h-10 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-sm outline-none focus-visible:border-[var(--app-accent)] focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
              >
                {!currentVersionId && <option value="generate">从页面内容生成</option>}
                <option value="polish">自然润色</option>
                <option value="shorten">压缩精简</option>
                <option value="expand">扩写解释</option>
                <option value="convert_single">转为单人</option>
                <option value="convert_dialogue">转为多人对话</option>
              </select>
            </label>
            <Textarea
              label="补充要求"
              value={instruction}
              disabled={disabled}
              onChange={(event) => setInstruction(event.target.value)}
              className="min-h-28 resize-y"
              placeholder="例如：更口语化，保留所有数字与结论"
            />
            <Button
              type="button"
              className="w-full"
              icon={<Sparkles size={16} aria-hidden="true" />}
              disabled={disabled}
              onClick={() => onGenerate(effectiveOperation, instruction)}
            >
              生成候选
            </Button>
            <p className="text-xs leading-5 text-[var(--app-text-tertiary)]">
              AI 只创建候选稿，不会覆盖当前确认稿。
            </p>
          </div>
        )}

        {tab === 'versions' && (
          <div className="divide-y divide-[var(--app-border)]">
            {versions.length === 0 && (
              <p className="py-4 text-sm text-[var(--app-text-tertiary)]">暂无版本</p>
            )}
            {versions.map((version) => {
              const current = version.id === currentVersionId;
              return (
                <div key={version.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--app-text)]">
                        版本 {version.version_number} · {version.source_type}
                      </p>
                      <p className="text-xs text-[var(--app-text-tertiary)]">
                        {current ? '当前确认稿' : version.status === 'candidate' ? '待处理候选' : '历史版本'}
                      </p>
                    </div>
                    {!current && (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-10 w-10 px-0"
                          icon={<Undo2 size={15} aria-hidden="true" />}
                          aria-label={`应用版本 ${version.version_number}`}
                          title="应用此版本"
                          disabled={disabled}
                          onClick={() => onApply(version.id)}
                        ><span className="sr-only">应用</span></Button>
                        {version.status === 'candidate' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-10 w-10 px-0 text-[var(--app-error)]"
                            icon={<Trash2 size={15} aria-hidden="true" />}
                            aria-label={`丢弃候选版本 ${version.version_number}`}
                            title="丢弃候选"
                            disabled={disabled}
                            onClick={() => onDiscard(version.id)}
                          ><span className="sr-only">丢弃</span></Button>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--app-text-secondary)]">{version.text}</p>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'preview' && (
          <div className="space-y-4">
            <SegmentedControl
              ariaLabel="试听语音引擎"
              value={provider}
              onChange={setProvider}
              options={[
                { value: 'edge', label: '标准旁白' },
                { value: 'fish_audio', label: '表现力旁白' },
              ]}
            />
            <label className="grid gap-1.5 text-sm font-medium text-[var(--app-text-secondary)]">
              <span>{provider === 'fish_audio' ? 'Fish 私有 voice ID' : 'Edge 音色'}</span>
              <input
                aria-label="试听音色"
                value={voice}
                disabled={disabled}
                onChange={(event) => setVoice(event.target.value)}
                className="h-10 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-sm outline-none focus-visible:border-[var(--app-accent)] focus-visible:ring-2 focus-visible:ring-[var(--app-accent-soft)]"
              />
            </label>
            <Button
              type="button"
              className="w-full"
              icon={<Play size={16} aria-hidden="true" />}
              disabled={disabled || !voice.trim()}
              onClick={() => onPreview(provider, voice.trim())}
            >
              试听当前草稿
            </Button>
            {preview && (
              <div aria-live="polite" className="border-t border-[var(--app-border)] pt-3 text-xs leading-5 text-[var(--app-text-secondary)]">
                <p>引擎：{preview.provider}</p>
                <p>同步精度：{preview.timing_quality}</p>
                <p>{preview.cache_hit ? '已命中缓存' : '本次新生成'}</p>
                {preview.audio_url && <audio className="mt-2 w-full" controls src={preview.audio_url} />}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
