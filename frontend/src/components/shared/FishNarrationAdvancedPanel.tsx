import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { getSettings } from '@/api/endpoints'
import { SegmentedControl } from '@/components/shared'
import type { FishAudioVoiceAsset, NarrationPreferences, PronunciationEntry } from '@/types'

export const DEFAULT_NARRATION_PREFERENCES: NarrationPreferences = {
  quality_check: false,
  strict_quality_check: false,
  subtitle_timing: 'estimated',
  emotion_director: { intensity: 'standard', pace: 'normal', pause: 'normal', relationship: 'neutral' },
  page_overrides: {},
}

/** 质量检查级别：快速 / 标准 / 严格（合并原 ASR 相关复选框，字幕时间轴由其自动推导） */
export type NarrationQualityLevel = 'fast' | 'standard' | 'strict'

const DIRECTOR_FIELDS = [
  ['intensity', '强度', ['gentle', 'standard', 'strong']],
  ['pace', '语速', ['slow', 'normal', 'fast']],
  ['pause', '停顿', ['short', 'normal', 'long']],
  ['relationship', '角色关系', ['neutral', 'host_guest', 'mentor', 'debate']],
] as const

const EMOTION_OPTIONS = [
  ['curious', '好奇'],
  ['emphasis', '强调'],
  ['confident', '自信'],
  ['calm', '平静'],
  ['warm', '温暖'],
  ['excited', '兴奋'],
] as const

export function qualityLevelFrom(preferences: NarrationPreferences): NarrationQualityLevel {
  if (preferences.strict_quality_check) return 'strict'
  if (preferences.quality_check) return 'standard'
  return 'fast'
}

export function applyQualityLevel(preferences: NarrationPreferences, level: NarrationQualityLevel): NarrationPreferences {
  if (level === 'strict') {
    return { ...preferences, quality_check: true, strict_quality_check: true, subtitle_timing: 'asr' }
  }
  if (level === 'standard') {
    return { ...preferences, quality_check: true, strict_quality_check: false, subtitle_timing: 'estimated' }
  }
  return { ...preferences, quality_check: false, strict_quality_check: false, subtitle_timing: 'estimated' }
}

/** 高级制作折叠标题的修改项计数：词典条数 / 质量级别 / 自动匹配 / 逐页覆盖各计一项 */
export function countAdvancedModifications(
  preferences: NarrationPreferences,
  pronunciationLexicon: PronunciationEntry[],
  autoEmotion: boolean,
): number {
  let count = 0
  if (pronunciationLexicon.length > 0) count += 1
  if (qualityLevelFrom(preferences) !== 'fast') count += 1
  if (!autoEmotion) count += 1
  if (Object.keys(preferences.page_overrides).length > 0) count += 1
  return count
}

export function FishNarrationAdvancedPanel({
  autoEmotion,
  pronunciationLexicon,
  narrationPreferences,
  onVoiceChange,
  onSpeedChange,
  onPronunciationLexiconChange,
  onNarrationPreferencesChange,
}: {
  autoEmotion: boolean
  pronunciationLexicon: PronunciationEntry[]
  narrationPreferences: NarrationPreferences
  onVoiceChange?: (voice: string) => void
  onSpeedChange?: (speed: number) => void
  onPronunciationLexiconChange: (value: PronunciationEntry[]) => void
  onNarrationPreferencesChange: (value: NarrationPreferences) => void
}) {
  const [voiceAssets, setVoiceAssets] = useState<FishAudioVoiceAsset[]>([])

  useEffect(() => { void getSettings().then((response) => setVoiceAssets(response.data?.fish_audio_voice_assets || [])).catch(() => undefined) }, [])

  const updateDirector = (field: keyof NarrationPreferences['emotion_director'], value: string) => {
    const nextDirector: NarrationPreferences['emotion_director'] = { ...narrationPreferences.emotion_director };
    if (field === 'emotion' && !value) {
      // 选「自动」：从配置中删除 emotion 键（空串与 null 永不相等，会破坏表达方式预设匹配）
      delete nextDirector.emotion;
    } else {
      nextDirector[field] = value as never;
    }
    onNarrationPreferencesChange({
      ...narrationPreferences,
      emotion_director: nextDirector,
    })
  }

  const applyVoiceAsset = (assetId: string) => {
    const asset = voiceAssets.find((item) => item.id === assetId)
    if (!asset) return
    onVoiceChange?.(asset.voice)
    const rate = Number.parseFloat(asset.rate)
    if (onSpeedChange && Number.isFinite(rate)) onSpeedChange(Math.max(0.7, Math.min(1 + rate / 100, 1.2)))
    onNarrationPreferencesChange({
      ...narrationPreferences,
      emotion_director: { ...narrationPreferences.emotion_director, emotion: asset.default_emotion },
    })
  }

  const qualityLevel = qualityLevelFrom(narrationPreferences)

  return <section className="space-y-4" aria-label="高级制作">
    {voiceAssets.length > 0 && <div className="space-y-1.5">
      <h4 className="text-sm font-medium">角色预设</h4>
      <select aria-label="角色预设" value="" onChange={(event) => applyVoiceAsset(event.target.value)} className="h-9 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm">
        <option value="">选择已保存角色</option>
        {voiceAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.use_case}</option>)}
      </select>
      <p className="text-xs text-[var(--app-text-tertiary)]">套用预设会同时应用音色、语速与语气。</p>
    </div>}

    <div className="space-y-2"><div className="flex items-center justify-between"><h4 className="text-sm font-medium">发音词典</h4><button type="button" onClick={() => onPronunciationLexiconChange([...pronunciationLexicon, { term: '', pronunciation: '' }])} className="inline-flex items-center gap-1 text-sm text-[var(--app-accent)]"><Plus size={14} />添加</button></div>{pronunciationLexicon.map((item, index) => <div key={`${item.term}-${index}`} className="flex gap-2"><input aria-label={`词条 ${index + 1}`} value={item.term} onChange={(event) => onPronunciationLexiconChange(pronunciationLexicon.map((entry, i) => i === index ? { ...entry, term: event.target.value } : entry))} placeholder="术语/缩写" className="min-w-0 flex-1 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1.5 text-sm" /><input aria-label={`读法 ${index + 1}`} value={item.pronunciation} onChange={(event) => onPronunciationLexiconChange(pronunciationLexicon.map((entry, i) => i === index ? { ...entry, pronunciation: event.target.value } : entry))} placeholder="TTS 读法" className="min-w-0 flex-1 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1.5 text-sm" /><button type="button" aria-label="删除词条" onClick={() => onPronunciationLexiconChange(pronunciationLexicon.filter((_, i) => i !== index))} className="p-2 text-[var(--app-text-tertiary)] hover:text-[var(--app-danger)]"><Trash2 size={15} /></button></div>)}</div>

    <div className="space-y-2">
      <h4 className="text-sm font-medium">质量检查</h4>
      <SegmentedControl
        ariaLabel="质量检查"
        value={qualityLevel}
        onChange={(level) => onNarrationPreferencesChange(applyQualityLevel(narrationPreferences, level as NarrationQualityLevel))}
        options={[
          { value: 'fast', label: '快速' },
          { value: 'standard', label: '标准' },
          { value: 'strict', label: '严格' },
        ]}
      />
      <p className="text-xs text-[var(--app-text-tertiary)]">字幕时间轴：自动（严格模式自动使用逐句时间戳）。</p>
    </div>

    <div className="space-y-3">
      <h4 className="text-sm font-medium">情绪导演</h4>
      {autoEmotion ? (
        <p className="text-xs text-[var(--app-text-tertiary)]">已开启场景自动匹配语气，细节由每页内容自动决定。</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DIRECTOR_FIELDS.map(([field, label, options]) => <label key={field} className="text-xs text-[var(--app-text-secondary)]">{label}<select aria-label={label} value={narrationPreferences.emotion_director[field]} onChange={(event) => updateDirector(field, event.target.value)} className="mt-1 h-9 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm text-[var(--app-text)]">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>)}
          <label className="text-xs text-[var(--app-text-secondary)]">情绪<select aria-label="情绪" value={narrationPreferences.emotion_director.emotion || ''} onChange={(event) => updateDirector('emotion', event.target.value)} className="mt-1 h-9 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm text-[var(--app-text)]"><option value="">自动</option>{EMOTION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
      )}
    </div>
  </section>
}
