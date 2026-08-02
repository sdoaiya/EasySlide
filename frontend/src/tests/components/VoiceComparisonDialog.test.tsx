import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/api/client'
import { VoiceComparisonDialog } from '@/components/shared/VoiceComparisonDialog'

vi.mock('@/api/client', () => ({
  getStaticAssetUrl: (path: string) => path,
  getImageUrl: (path: string) => path,
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: {
        data: {
          voices: [
            { voice_id: 'edge:zh-CN-XiaoxiaoNeural', provider: 'edge', upstream_id: 'zh-CN-XiaoxiaoNeural', name: '晓晓（中文女声）', languages: ['zh-CN'] },
            { voice_id: 'edge:zh-CN-YunxiNeural', provider: 'edge', upstream_id: 'zh-CN-YunxiNeural', name: '云希（中文男声）', languages: ['zh-CN'] },
          ],
        },
      },
    }),
  },
}))

vi.mock('@/api/endpoints', () => ({
  getSettings: vi.fn().mockResolvedValue({ data: { fish_audio_voice_assets: [] } }),
}))

const VOICE_A = 'edge:zh-CN-XiaoxiaoNeural'

function renderDialog(onAdopt = vi.fn(), onClose = vi.fn()) {
  render(<VoiceComparisonDialog isOpen voiceA={VOICE_A} onClose={onClose} onAdopt={onAdopt} />)
  return { onAdopt, onClose }
}

describe('VoiceComparisonDialog', () => {
  it('renders A as the current voice and adopts it back', async () => {
    const { onAdopt, onClose } = renderDialog()

    expect(await screen.findByText('晓晓（中文女声）')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '采用 A' }))

    expect(onAdopt).toHaveBeenCalledWith(VOICE_A)
    expect(onClose).toHaveBeenCalled()
  })

  it('adopts B after selecting a comparison voice', async () => {
    const { onAdopt } = renderDialog()

    // 等待声音目录加载（A 显示当前声音，B 仍为未选择）
    await screen.findByText('晓晓（中文女声）')

    // B 未选择时不可采用
    expect(screen.getByRole('button', { name: '采用 B' })).toBeDisabled()

    // 打开 B 的声音选择器并选择云希
    fireEvent.click(screen.getByRole('button', { name: /搜索声音/ }))
    fireEvent.click(await screen.findByText('云希（中文男声）'))

    fireEvent.click(screen.getByRole('button', { name: '采用 B' }))
    expect(onAdopt).toHaveBeenCalledWith('edge:zh-CN-YunxiNeural')
  })

  it('previews with the shared text and auto-stops the previous playback', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: new Blob(['audio'], { type: 'audio/mpeg' }) })
    const { onAdopt } = renderDialog()

    fireEvent.click(await screen.findByRole('button', { name: '试听 A' }))

    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/voices/edge%3Azh-CN-XiaoxiaoNeural/preview',
      expect.objectContaining({ params: expect.objectContaining({ text: expect.stringContaining('欢迎使用本次演示') }) }),
    )
    expect(onAdopt).not.toHaveBeenCalled()
  })
})
