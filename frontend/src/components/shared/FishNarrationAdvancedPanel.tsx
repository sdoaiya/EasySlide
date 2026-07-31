import { useEffect, useRef, useState } from 'react'
import { Loader2, Play, Plus, Trash2 } from 'lucide-react'
import { getFishAudioCapabilities, getSettings, previewFishNarration } from '@/api/endpoints'
import type { FishAudioVoice, FishAudioVoiceAsset, NarrationPreferences, PronunciationEntry } from '@/types'

type UsageEstimate = {
  characters: number
  estimated_seconds: number
  requests: number
  roles: number
  free_model_notice: string
}

const DIRECTOR_FIELDS = [
  ['intensity', '强度', ['gentle', 'standard', 'strong']],
  ['pace', '语速', ['slow', 'normal', 'fast']],
  ['pause', '停顿', ['short', 'normal', 'long']],
  ['relationship', '角色关系', ['neutral', 'host_guest', 'mentor', 'debate']],
] as const

export const DEFAULT_NARRATION_PREFERENCES: NarrationPreferences = {
  quality_check: false,
  strict_quality_check: false,
  subtitle_timing: 'estimated',
  emotion_director: { intensity: 'standard', pace: 'normal', pause: 'normal', relationship: 'neutral' },
  page_overrides: {},
}

export function FishNarrationAdvancedPanel({
  projectId,
  voices,
  voice,
  speed,
  autoEmotion,
  pronunciationLexicon,
  narrationPreferences,
  estimate,
  pageOptions = [],
  onVoiceChange,
  onSpeedChange,
  onPronunciationLexiconChange,
  onNarrationPreferencesChange,
}: {
  projectId: string
  voices: FishAudioVoice[]
  voice: string
  speed: number
  autoEmotion: boolean
  pronunciationLexicon: PronunciationEntry[]
  narrationPreferences: NarrationPreferences
  estimate?: UsageEstimate
  pageOptions?: Array<{ id: string; label: string }>
  onVoiceChange?: (voice: string) => void
  onSpeedChange?: (speed: number) => void
  onPronunciationLexiconChange: (value: PronunciationEntry[]) => void
  onNarrationPreferencesChange: (value: NarrationPreferences) => void
}) {
  const [previewText, setPreviewText] = useState('欢迎使用本次演示，我们先快速了解最关键的结论和行动建议。')
  const [comparisonVoice, setComparisonVoice] = useState('')
  const [previewUrls, setPreviewUrls] = useState<Record<'a' | 'b', string | undefined>>({ a: undefined, b: undefined })
  const [previewing, setPreviewing] = useState<'a' | 'b' | undefined>()
  const [voiceAssets, setVoiceAssets] = useState<FishAudioVoiceAsset[]>([])
  const [overridePageId, setOverridePageId] = useState('')
  const [voiceDesignReason, setVoiceDesignReason] = useState('当前免费模型未确认 Voice Design 官方 API 契约')
  const previewUrlsRef = useRef(previewUrls)

  useEffect(() => () => { Object.values(previewUrlsRef.current).forEach((url) => { if (url) URL.revokeObjectURL(url) }) }, [])
  useEffect(() => { void getSettings().then((response) => setVoiceAssets(response.data?.fish_audio_voice_assets || [])).catch(() => undefined) }, [])
  useEffect(() => { void getFishAudioCapabilities().then((response) => setVoiceDesignReason(response.data?.voice_design.reason || voiceDesignReason)).catch(() => undefined) }, [])

  const preview = async (slot: 'a' | 'b', selectedVoice: string) => {
    const characterCount = previewText.replace(/\s/g, '').length
    if (!selectedVoice || characterCount < 20 || characterCount > 40) return
    setPreviewing(slot)
    try {
      const blob = await previewFishNarration(projectId, {
        text: previewText.trim(), voice: selectedVoice, speed, autoEmotion, pronunciationLexicon,
      })
      const url = URL.createObjectURL(blob)
      setPreviewUrls((current) => {
        if (current[slot]) URL.revokeObjectURL(current[slot]!)
        const next = { ...current, [slot]: url }
        previewUrlsRef.current = next
        return next
      })
    } finally {
      setPreviewing(undefined)
    }
  }

  const updateDirector = (field: keyof NarrationPreferences['emotion_director'], value: string) => {
    onNarrationPreferencesChange({
      ...narrationPreferences,
      emotion_director: { ...narrationPreferences.emotion_director, [field]: value },
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

  const updatePageOverride = (field: keyof NarrationPreferences['emotion_director'], value: string) => {
    if (!overridePageId) return
    const pageOverrides = { ...narrationPreferences.page_overrides }
    const override = { ...(pageOverrides[overridePageId] || {}) }
    if (value) override[field] = value as never
    else delete override[field]
    if (Object.keys(override).length) pageOverrides[overridePageId] = override
    else delete pageOverrides[overridePageId]
    onNarrationPreferencesChange({ ...narrationPreferences, page_overrides: pageOverrides })
  }

  const previewCharacterCount = previewText.replace(/\s/g, '').length
  const selectedPageOverride = overridePageId ? narrationPreferences.page_overrides[overridePageId] || {} : {}

  return <section className="space-y-4 border-t border-[var(--app-border)] pt-4" aria-label="Fish Audio 高级旁白设置">
    {voiceAssets.length > 0 && <label className="block text-sm font-medium">人物声线资产<select aria-label="人物声线资产" value="" onChange={(event) => applyVoiceAsset(event.target.value)} className="mt-1 h-9 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm"><option value="">选择已保存角色</option>{voiceAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.use_case}</option>)}</select></label>}
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-medium">短句试听 / A-B 对比</h4><span className="text-xs text-[var(--app-text-tertiary)]">20–40 字 · 约 5–10 秒</span></div>
      <textarea aria-label="试听文案" value={previewText} maxLength={40} onChange={(event) => setPreviewText(event.target.value)} className="min-h-16 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] p-2 text-sm" />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex gap-2"><button type="button" onClick={() => void preview('a', voice)} disabled={!voice || previewCharacterCount < 20 || !!previewing} className="inline-flex h-9 items-center gap-1 rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-3 text-sm disabled:opacity-50">{previewing === 'a' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}试听 A</button>{previewUrls.a && <audio controls src={previewUrls.a} className="h-9 min-w-0 flex-1" />}</div>
        <div className="flex gap-2"><select aria-label="A-B 对比声线" value={comparisonVoice} onChange={(event) => setComparisonVoice(event.target.value)} className="h-9 min-w-0 flex-1 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm"><option value="">选择 B 声线</option>{voices.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button type="button" onClick={() => void preview('b', comparisonVoice)} disabled={!comparisonVoice || previewCharacterCount < 20 || !!previewing} className="inline-flex h-9 items-center gap-1 rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-3 text-sm disabled:opacity-50">{previewing === 'b' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}试听 B</button>{previewUrls.b && <audio controls src={previewUrls.b} className="h-9 w-0 flex-1" />}</div>
      </div>
    </div>

    <div className="space-y-2"><div className="flex items-center justify-between"><h4 className="text-sm font-medium">发音词典</h4><button type="button" onClick={() => onPronunciationLexiconChange([...pronunciationLexicon, { term: '', pronunciation: '' }])} className="inline-flex items-center gap-1 text-sm text-[var(--app-accent)]"><Plus size={14} />添加</button></div>{pronunciationLexicon.map((item, index) => <div key={`${item.term}-${index}`} className="flex gap-2"><input aria-label={`词条 ${index + 1}`} value={item.term} onChange={(event) => onPronunciationLexiconChange(pronunciationLexicon.map((entry, i) => i === index ? { ...entry, term: event.target.value } : entry))} placeholder="术语/缩写" className="min-w-0 flex-1 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1.5 text-sm" /><input aria-label={`读法 ${index + 1}`} value={item.pronunciation} onChange={(event) => onPronunciationLexiconChange(pronunciationLexicon.map((entry, i) => i === index ? { ...entry, pronunciation: event.target.value } : entry))} placeholder="TTS 读法" className="min-w-0 flex-1 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1.5 text-sm" /><button type="button" aria-label="删除词条" onClick={() => onPronunciationLexiconChange(pronunciationLexicon.filter((_, i) => i !== index))} className="p-2 text-[var(--app-text-tertiary)] hover:text-[var(--app-danger)]"><Trash2 size={15} /></button></div>)}</div>

    <div className="space-y-3"><h4 className="text-sm font-medium">高质量与情绪导演</h4><div className="grid gap-2 sm:grid-cols-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={narrationPreferences.quality_check} onChange={(event) => onNarrationPreferencesChange({ ...narrationPreferences, quality_check: event.target.checked, strict_quality_check: event.target.checked ? narrationPreferences.strict_quality_check : false })} />ASR 回听质检</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label="严格 ASR 质检" disabled={!narrationPreferences.quality_check} checked={narrationPreferences.strict_quality_check} onChange={(event) => onNarrationPreferencesChange({ ...narrationPreferences, strict_quality_check: event.target.checked })} />严格模式</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={narrationPreferences.subtitle_timing === 'asr'} onChange={(event) => onNarrationPreferencesChange({ ...narrationPreferences, subtitle_timing: event.target.checked ? 'asr' : 'estimated' })} />ASR 时间戳字幕</label></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{DIRECTOR_FIELDS.map(([field, label, options]) => <label key={field} className="text-xs text-[var(--app-text-secondary)]">{label}<select aria-label={label} value={narrationPreferences.emotion_director[field]} onChange={(event) => updateDirector(field, event.target.value)} className="mt-1 h-9 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm text-[var(--app-text)]">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>)}</div></div>

    {pageOptions.length > 0 && <div className="space-y-2"><h4 className="text-sm font-medium">逐页语气覆盖</h4><select aria-label="覆盖页面" value={overridePageId} onChange={(event) => setOverridePageId(event.target.value)} className="h-9 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm"><option value="">选择页面</option>{pageOptions.map((page) => <option key={page.id} value={page.id}>{page.label}</option>)}</select>{overridePageId && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{DIRECTOR_FIELDS.map(([field, label, options]) => <label key={field} className="text-xs text-[var(--app-text-secondary)]">{label}<select aria-label={`${selectedPageOverride ? pageOptions.find((page) => page.id === overridePageId)?.label : ''}${label}`} value={selectedPageOverride[field] || ''} onChange={(event) => updatePageOverride(field, event.target.value)} className="mt-1 h-9 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm"><option value="">跟随全局</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>)}</div>}</div>}

    {estimate && <div className="rounded-[var(--app-radius-control)] bg-[var(--app-surface-muted)] p-3 text-xs text-[var(--app-text-secondary)]"><strong className="mr-2 text-[var(--app-text)]">本次预估</strong>{estimate.characters} 字 · 约 {estimate.estimated_seconds} 秒 · {estimate.requests} 次请求 · {estimate.roles} 个角色<div className="mt-1 text-[var(--app-text-tertiary)]">{estimate.free_model_notice}</div></div>}
    <p className="text-xs text-[var(--app-text-tertiary)]">Voice Design：{voiceDesignReason}。</p>
  </section>
}
