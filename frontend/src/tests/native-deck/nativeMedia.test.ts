import { describe, expect, it } from 'vitest'
import type { NativeLayoutContract } from '@/components/native-deck/NativeDeckPropertyPanel'
import type { NativeSlideSpec } from '@/native-deck/types'
import { collectNativeMediaSlots, runNativeMediaQueue, setNativeMediaValue } from '@/native-deck/nativeMedia'

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
    expect(collectNativeMediaSlots(slides, [contract], { density: 'standard', style: 'theme', custom_prompt: '', custom_counts: {} }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ pageId: 'page-2', key: 'images', index: 0 }),
      ]))
    expect(collectNativeMediaSlots(slides, [contract], { density: 'standard', style: 'theme', custom_prompt: '', custom_counts: {} }))
      .toHaveLength(1)
    expect(collectNativeMediaSlots(slides, [contract], { density: 'rich', style: 'theme', custom_prompt: '', custom_counts: {} }))
      .toHaveLength(5)
    expect(collectNativeMediaSlots(slides, [contract], { density: 'custom', style: 'theme', custom_prompt: '', custom_counts: { 'page-1': 2, 'page-2': 0 } }))
      .toEqual([expect.objectContaining({ pageId: 'page-1', index: 1 })])
  })

  it('writes one array slot without replacing another image', () => {
    expect(setNativeMediaValue(slides[0].props, 'images', 1, '/files/new.png')).toMatchObject({
      images: ['/files/existing.png', '/files/new.png'],
    })
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
})
