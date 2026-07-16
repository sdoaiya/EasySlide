import { describe, expect, it, vi } from 'vitest'
import type { NativeLayoutContract } from '@/components/native-deck/NativeDeckPropertyPanel'
import type { NativeSlideSpec } from '@/native-deck/types'
import { buildNativeMediaPrompt, collectNativeMediaSlots, compressNativeMediaUpload, createNativeMediaSlot, runNativeMediaQueue, setNativeMediaValue } from '@/native-deck/nativeMedia'

const contract: NativeLayoutContract = {
  layout: 'theme01_page008',
  theme: 'theme01',
  roles: ['image'],
  copyKeys: ['title', 'images[]'],
  propShapes: { title: 'string', images: ['media'] },
  mediaSlots: [{ key: 'images', required: false, defaultVisibleCount: 2, max: 3 }],
}

const slides: NativeSlideSpec[] = [
  { pageId: 'page-1', layout: contract.layout, props: { title: '第一页', images: ['/files/existing.png'] } },
  { pageId: 'page-2', layout: contract.layout, props: { title: '第二页', images: [] } },
]

describe('native media scheduling', () => {
  it('applies standard, rich, and custom density without overwriting filled slots', () => {
    expect(collectNativeMediaSlots(slides, [contract], { density: 'standard', style: 'theme', composition: 'auto', custom_prompt: '', custom_counts: {} }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ pageId: 'page-2', key: 'images', index: 0 }),
      ]))
    expect(collectNativeMediaSlots(slides, [contract], { density: 'standard', style: 'theme', composition: 'auto', custom_prompt: '', custom_counts: {} }))
      .toHaveLength(1)
    expect(collectNativeMediaSlots(slides, [contract], { density: 'rich', style: 'theme', composition: 'auto', custom_prompt: '', custom_counts: {} }))
      .toHaveLength(5)
    expect(collectNativeMediaSlots(slides, [contract], { density: 'custom', style: 'theme', composition: 'auto', custom_prompt: '', custom_counts: { 'page-1': 2, 'page-2': 0 } }))
      .toEqual([expect.objectContaining({ pageId: 'page-1', index: 1 })])
    expect(collectNativeMediaSlots(slides, [contract], { density: 'custom', style: 'theme', composition: 'auto', custom_prompt: '', custom_counts: { 'page-1': 2, 'page-2': 0 } })[0].id)
      .toBe('page-1:images[1]')
  })

  it('writes one array slot without replacing another image', () => {
    expect(setNativeMediaValue(slides[0].props, 'images', 1, '/files/new.png')).toMatchObject({
      images: ['/files/existing.png', '/files/new.png'],
    })
  })

  it('builds layout-aware image ratios and Huashu composition prompts', () => {
    const slide: NativeSlideSpec = {
      pageId: 'page-story',
      layout: 'core01_image_story',
      props: {
        title: '产业现场',
        summary: '展示真实生产场景',
        __design_intent: {
          media_strategy: '图片提供现场证据',
          page_plan: { media_direction: 'dominant' },
        },
      },
    }
    const slot = createNativeMediaSlot(slide, 'image')
    const prompt = buildNativeMediaPrompt(slide, { density: 'standard', style: 'photo', composition: 'text-left', custom_prompt: '', custom_counts: {} }, '', slot)

    expect(slot).toMatchObject({ aspectRatio: '4:3', composition: 'center' })
    expect(prompt).toContain('主体放在画面右侧')
    expect(prompt).toContain('画面比例 4:3')
    expect(prompt).toContain('图片提供现场证据')
    expect(prompt).toContain('不要生成文字、数字、Logo、水印')
  })

  it('runs at most four jobs and stops dispatching after pause', async () => {
    let active = 0
    let maxActive = 0
    let paused = false
    const started: number[] = []
    const release: Array<() => void> = []
    const jobs = Array.from({ length: 8 }, (_, index) => index)

    const run = runNativeMediaQueue(jobs, async (job) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      started.push(job)
      await new Promise<void>((resolve) => release.push(resolve))
      active -= 1
    }, { concurrency: 4, isPaused: () => paused })

    await Promise.resolve()
    expect(started).toHaveLength(4)
    paused = true
    release.splice(0).forEach((resolve) => resolve())
    await run

    expect(maxActive).toBe(4)
    expect(started).toHaveLength(4)
  })

  it('keeps transparent PNG files and compresses supported photo uploads', async () => {
    const png = new File(['png'], 'logo.png', { type: 'image/png' })
    expect(await compressNativeMediaUpload(png)).toBe(png)

    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 2000, close }))
    const context = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback?.(new Blob(['small'], { type: 'image/webp' })))
    const photo = new File([new Uint8Array(1024)], 'photo.jpg', { type: 'image/jpeg' })

    const compressed = await compressNativeMediaUpload(photo)

    expect(compressed.name).toBe('photo.webp')
    expect(compressed.type).toBe('image/webp')
    expect(compressed.size).toBeLessThan(photo.size)
    expect(close).toHaveBeenCalled()
    getContext.mockRestore()
    toBlob.mockRestore()
    vi.unstubAllGlobals()
  })
})
