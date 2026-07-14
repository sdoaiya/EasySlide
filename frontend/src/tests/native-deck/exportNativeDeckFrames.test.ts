import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureNativeDeckFrames } from '@/native-deck/exportNativeDeckFrames'
import { toPng } from 'html-to-image'

vi.mock('html-to-image', () => ({
  toPng: vi.fn(async (_node: HTMLElement, options: Record<string, unknown>) => {
    const marker = String(options.cacheBust)
    return `data:image/png;base64,${btoa(marker)}`
  }),
}))

describe('captureNativeDeckFrames', () => {
  beforeEach(() => {
    vi.mocked(toPng).mockClear()
    document.body.innerHTML = `
      <div id="deck">
        <section class="slide"><div class="native-slide" data-native-layout-ready="true">第一页</div></section>
        <section class="slide"><div class="native-slide" data-native-layout-ready="true">第二页</div></section>
      </div>`
  })

  it('captures every native slide as a 1920x1080 PNG blob in page order', async () => {
    const frames = await captureNativeDeckFrames()

    expect(frames).toHaveLength(2)
    expect(frames.every((frame) => frame.type === 'image/png')).toBe(true)
    expect(toPng).toHaveBeenNthCalledWith(1, document.querySelectorAll('.slide')[0], expect.objectContaining({
      width: 1920,
      height: 1080,
      canvasWidth: 1920,
      canvasHeight: 1080,
    }))
    expect(toPng).toHaveBeenNthCalledWith(2, document.querySelectorAll('.slide')[1], expect.any(Object))
  })
})
