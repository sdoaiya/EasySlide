import { useState } from 'react';
import { Play, Sparkles, Trash2, Undo2 } from 'lucide-react';

import { Button, SegmentedControl, Textarea } from '@/components/shared';
import type { NarrationPreviewResult, NarrationVersion } from '@/types';

const UNKNOWN_ID = 'legacy.unknown';

/** 稳定 ID 契约（§7.4/§7.5）：从 ai_config 读真实 ID，缺失一律 legacy.unknown */
function configId(version: NarrationVersion, key: 'style_profile_id' | 'expressiveness_id' | 'voice_profile_id') {
  const config = version.ai_config as { generation_config?: Record<string, unknown> } | undefined;
  const value = config?.generation_config?.[key];
  return typeof value === 'string' && value ? value : UNKNOWN_ID;
}

function providerId(version: NarrationVersion, key: 'provider' | 'model_id' | 'prompt_version') {
  const config = version.ai_config as Record<string, unknown> | undefined;
  const value = config?.[key];
  return typeof value === 'string' && value ? value : UNKNOWN_ID;
}

/** 次级等宽 ID 显示：长 ID 截断并提供 tooltip */
function StableId({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex min-w-0 items-baseline gap-1.5 text-[11px] leading-5 text-[var(--app-text-tertiary)]">
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 truncate font-mono text-[10px]" title={value}>{value}</span>
    </p>
  );
}

type InspectorTab = 'candidates' | 'ai' | 'history' | 'preview';

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
  const [tab, setTab] = useState<InspectorTab>('candidates');
  const [operation, setOperation] = useState('polish');
  const [instruction, setInstruction] = useState('');
  const [provider, setProvider] = useState<'edge' | 'fish_audio'>('edge');
  const [voice, setVoice] = useState('zh-CN-XiaoxiaoNeural');
  const effectiveOperation = currentVersionId ? operation : 'generate';

  const candidates = versions.filter((version) => version.status === 'candidate');
  const history = versions.filter((version) => version.status !== 'candidate');

  return (
    <aside aria-label="旁白检查器" className="flex h-full min-h-0 flex-col bg-[var(--app-surface-secondary)]">
      <div className="border-b border-[var(--app-border)] p-3">
        <SegmentedControl
          ariaLabel="旁白检查器视图"
          value={tab}
          onChange={setTab}
          className="w-full"
          options={[
            { value: 'candidates', label: `候选${candidates.length ? ` ${candidates.length}` : ''}` },
            { value: 'ai', label: 'AI 优化' },
            { value: 'history', label: '历史' },
            { value: 'preview', label: '试听' },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'candidates' && (
          <div className="divide-y divide-[var(--app-border)]">
            {candidates.length === 0 && (
              <p className="py-4 text-sm text-[var(--app-text-tertiary)]">
                暂无候选。AI 只生成候选稿，不会覆盖当前确认稿。
              </p>
            )}
            {candidates.map((version) => (
              <div key={version.id} className="py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--app-text)]">
                      {version.ai_operation === 'generate' ? '从页面内容生成'
                        : version.ai_operation === 'convert_single' ? '转单人'
                          : version.ai_operation === 'convert_dialogue' ? '转多人对话'
                            : version.ai_operation === 'shorten' ? '压缩精简'
                              : version.ai_operation === 'expand' ? '扩写解释'
                                : '自然润色'}
                    </p>
                    <StableId label="候选 ID" value={version.id} />
                    <StableId label="脚本文风" value={configId(version, 'style_profile_id')} />
                    <StableId label="表现力" value={configId(version, 'expressiveness_id')} />
                    <StableId label="声音" value={configId(version, 'voice_profile_id')} />
                    <StableId label="模型" value={`${providerId(version, 'provider')} · ${providerId(version, 'model_id')}`} />
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-10 w-10 px-0"
                      icon={<Undo2 size={15} aria-hidden="true" />}
                      aria-label={`应用候选 ${version.id}`}
                      title="应用此候选为确认稿"
                      disabled={disabled}
                      onClick={() => onApply(version.id)}
                    ><span className="sr-only">应用</span></Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-10 w-10 px-0 text-[var(--app-error)]"
                      icon={<Trash2 size={15} aria-hidden="true" />}
                      aria-label={`丢弃候选 ${version.id}`}
                      title="丢弃候选"
                      disabled={disabled}
                      onClick={() => onDiscard(version.id)}
                    ><span className="sr-only">丢弃</span></Button>
                  </div>
                </div>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--app-text-secondary)]">{version.text}</p>
              </div>
            ))}
          </div>
        )}

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

        {tab === 'history' && (
          <div className="divide-y divide-[var(--app-border)]">
            {history.length === 0 && (
              <p className="py-4 text-sm text-[var(--app-text-tertiary)]">暂无历史版本</p>
            )}
            {history.map((version) => {
              const current = version.id === currentVersionId;
              return (
                <div key={version.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--app-text)]">
                        版本 {version.version_number} · {version.source_type}
                      </p>
                      <p className="text-xs text-[var(--app-text-tertiary)]">
                        {current ? '当前确认稿' : '历史版本'}
                      </p>
                    </div>
                    {!current && (
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
