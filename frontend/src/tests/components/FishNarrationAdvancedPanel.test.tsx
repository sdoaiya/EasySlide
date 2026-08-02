import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { countAdvancedModifications, DEFAULT_NARRATION_PREFERENCES, FishNarrationAdvancedPanel } from '@/components/shared/FishNarrationAdvancedPanel'
import type { NarrationPreferences, PronunciationEntry } from '@/types'

vi.mock('@/api/endpoints', () => ({
  getSettings: vi.fn().mockResolvedValue({ data: { fish_audio_voice_assets: [{
    id: 'asset-host', name: '品牌主持人', voice: 'voice-a', avatar: '🎙️', rate: '+10%', language: 'zh',
    default_emotion: 'confident', use_case: '发布会', synthetic: false,
  }] } }),
}))

function Harness({
  autoEmotion = true,
  onVoiceChange,
  onSpeedChange,
}: {
  autoEmotion?: boolean
  onVoiceChange?: (voice: string) => void
  onSpeedChange?: (speed: number) => void
} = {}) {
  const [lexicon, setLexicon] = useState<PronunciationEntry[]>([])
  const [preferences, setPreferences] = useState<NarrationPreferences>(DEFAULT_NARRATION_PREFERENCES)
  return <FishNarrationAdvancedPanel
    autoEmotion={autoEmotion}
    pronunciationLexicon={lexicon}
    narrationPreferences={preferences}
    onVoiceChange={onVoiceChange}
    onSpeedChange={onSpeedChange}
    onPronunciationLexiconChange={setLexicon}
    onNarrationPreferencesChange={setPreferences}
  />
}

describe('FishNarrationAdvancedPanel（高级制作）', () => {
  it('edits lexicon and merges quality level into existing preferences', async () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    fireEvent.change(screen.getByLabelText('词条 1'), { target: { value: 'API' } })
    fireEvent.change(screen.getByLabelText('读法 1'), { target: { value: 'A P I' } })

    expect(screen.getByDisplayValue('API')).toBeInTheDocument()

    // 默认快速（未开启质检）
    expect(screen.getByRole('radio', { name: '快速' })).toHaveAttribute('aria-checked', 'true')

    // 切到标准：quality_check=true、strict=false、字幕时间轴自动推导
    fireEvent.click(screen.getByRole('radio', { name: '标准' }))
    expect(screen.getByRole('radio', { name: '标准' })).toHaveAttribute('aria-checked', 'true')

    // 切到严格：strict=true，字幕时间轴说明文案保留且不出现 ASR 术语
    fireEvent.click(screen.getByRole('radio', { name: '严格' }))
    expect(screen.getByRole('radio', { name: '严格' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/字幕时间轴：自动/)).toBeInTheDocument()
    expect(screen.queryByText(/ASR/)).not.toBeInTheDocument()

    // 预估摘要已移出面板（不再作为独立配置区）
    expect(screen.queryByText(/次请求/)).not.toBeInTheDocument()
  })

  it('hides emotion director details while auto match is on and shows them when off', () => {
    const { rerender } = render(<Harness autoEmotion />)
    expect(screen.getByText(/已开启场景自动匹配语气/)).toBeInTheDocument()
    expect(screen.queryByLabelText('强度')).not.toBeInTheDocument()

    rerender(<Harness autoEmotion={false} />)
    expect(screen.getByLabelText('强度')).toBeInTheDocument()
    expect(screen.getByLabelText('语速')).toBeInTheDocument()
    expect(screen.getByLabelText('停顿')).toBeInTheDocument()
    expect(screen.getByLabelText('角色关系')).toBeInTheDocument()
    expect(screen.getByLabelText('情绪')).toBeInTheDocument()
  })

  it('applies saved voice preset with speed and default emotion together', async () => {
    const onVoiceChange = vi.fn()
    const onSpeedChange = vi.fn()
    render(<Harness onVoiceChange={onVoiceChange} onSpeedChange={onSpeedChange} />)

    fireEvent.change(await screen.findByLabelText('角色预设'), { target: { value: 'asset-host' } })

    expect(onVoiceChange).toHaveBeenCalledWith('voice-a')
    expect(onSpeedChange).toHaveBeenCalledWith(1.1)
    expect(screen.getByText(/套用预设会同时应用音色、语速与语气/)).toBeInTheDocument()
  })
})

describe('countAdvancedModifications', () => {
  it('counts lexicon, quality level, auto match and page overrides', () => {
    expect(countAdvancedModifications(DEFAULT_NARRATION_PREFERENCES, [], true)).toBe(0)

    const withLexicon = countAdvancedModifications(DEFAULT_NARRATION_PREFERENCES, [{ term: 'API', pronunciation: 'A P I' }], true)
    expect(withLexicon).toBe(1)

    const standard = { ...DEFAULT_NARRATION_PREFERENCES, quality_check: true }
    expect(countAdvancedModifications(standard, [], true)).toBe(1)

    expect(countAdvancedModifications(standard, [{ term: 'API', pronunciation: 'A P I' }], false)).toBe(3)

    const withOverrides = {
      ...DEFAULT_NARRATION_PREFERENCES,
      page_overrides: { 'page-1': { pace: 'slow' as const } },
    }
    expect(countAdvancedModifications(withOverrides, [], true)).toBe(1)
  })
})
