import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_NARRATION_PREFERENCES, FishNarrationAdvancedPanel } from '@/components/shared/FishNarrationAdvancedPanel'
import type { NarrationPreferences, PronunciationEntry } from '@/types'

vi.mock('@/api/endpoints', () => ({
  getSettings: vi.fn().mockResolvedValue({ data: { fish_audio_voice_assets: [{
    id: 'asset-host', name: '品牌主持人', voice: 'voice-a', avatar: '🎙️', rate: '+10%', language: 'zh',
    default_emotion: 'confident', use_case: '发布会', synthetic: false,
  }] } }),
  getFishAudioCapabilities: vi.fn().mockResolvedValue({ data: { voice_design: { available: false, reason: '官方契约未确认' } } }),
  previewFishNarration: vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' })),
}))

function Harness({ onVoiceChange, onSpeedChange }: { onVoiceChange?: (voice: string) => void; onSpeedChange?: (speed: number) => void } = {}) {
  const [lexicon, setLexicon] = useState<PronunciationEntry[]>([])
  const [preferences, setPreferences] = useState<NarrationPreferences>(DEFAULT_NARRATION_PREFERENCES)
  return <FishNarrationAdvancedPanel
    projectId="project-1"
    voices={[{ id: 'voice-a', title: '主持人', state: 'ready', languages: ['zh'], visibility: 'private' }]}
    voice="voice-a"
    speed={1}
    autoEmotion
    pronunciationLexicon={lexicon}
    narrationPreferences={preferences}
    estimate={{ characters: 120, estimated_seconds: 30, requests: 3, roles: 2, free_model_notice: 'free' }}
    pageOptions={[{ id: 'page-1', label: '第 1 页 · 封面' }]}
    onVoiceChange={onVoiceChange}
    onSpeedChange={onSpeedChange}
    onPronunciationLexiconChange={setLexicon}
    onNarrationPreferencesChange={setPreferences}
  />
}

describe('FishNarrationAdvancedPanel', () => {
  it('edits project lexicon, quality switches, director and estimate', async () => {
    render(<Harness />)
    await screen.findByLabelText('人物声线资产')

    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    fireEvent.change(screen.getByLabelText('词条 1'), { target: { value: 'API' } })
    fireEvent.change(screen.getByLabelText('读法 1'), { target: { value: 'A P I' } })
    fireEvent.click(screen.getByLabelText('ASR 回听质检'))
    fireEvent.click(screen.getByLabelText('严格 ASR 质检'))
    fireEvent.change(screen.getByLabelText('强度'), { target: { value: 'strong' } })
    fireEvent.change(screen.getByLabelText('覆盖页面'), { target: { value: 'page-1' } })
    fireEvent.change(screen.getByLabelText('第 1 页 · 封面语速'), { target: { value: 'slow' } })

    expect(screen.getByDisplayValue('API')).toBeInTheDocument()
    expect(screen.getByLabelText('ASR 回听质检')).toBeChecked()
    expect(screen.getByLabelText('严格 ASR 质检')).toBeChecked()
    expect(screen.getByLabelText('第 1 页 · 封面语速')).toHaveValue('slow')
    expect(screen.getByText(/120 字 · 约 30 秒 · 3 次请求 · 2 个角色/)).toBeInTheDocument()
  })

  it('applies saved voice, speed and default emotion together', async () => {
    const onVoiceChange = vi.fn()
    const onSpeedChange = vi.fn()
    render(<Harness onVoiceChange={onVoiceChange} onSpeedChange={onSpeedChange} />)

    fireEvent.change(await screen.findByLabelText('人物声线资产'), { target: { value: 'asset-host' } })

    expect(onVoiceChange).toHaveBeenCalledWith('voice-a')
    expect(onSpeedChange).toHaveBeenCalledWith(1.1)
    expect(screen.getByLabelText('强度')).toBeInTheDocument()
  })
})
