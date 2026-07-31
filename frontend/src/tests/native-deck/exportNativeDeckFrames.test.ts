import { beforeEach, describe, expect, it, vi } from 'vitest'

const { toPng } = vi.hoisted(() => ({ toPng: vi.fn(async () => 'data:image/png;base64,AA==') }))
vi.mock('html-to-image', () => ({ toPng }))

import { captureNativeDeckFrameSequences, captureNativeSceneManifests, waitForNativeAnimations, waitForNativeMedia, waitForNativeStableLayout } from '@/native-deck/exportNativeDeckFrames'

describe('captureNativeDeckFrameSequences', () => {
  beforeEach(() => {
    toPng.mockClear()
  })

  it('captures one final frame when the page has no element entrance animation', async () => {
    document.body.innerHTML = '<div id="deck"><section class="slide"><div class="native-slide-content"><div><p>A</p><p>B</p></div></div></section></div>'

    const sequences = await captureNativeDeckFrameSequences(document)

    expect(sequences).toHaveLength(1)
    expect(sequences[0]).toHaveLength(1)
    expect(toPng).toHaveBeenCalledOnce()
  })

  it('captures progressive element stages and restores editor visibility', async () => {
    document.body.innerHTML = '<div id="deck"><section class="slide" data-native-animation=\'{"elementEnter":"fade"}\'><div class="native-slide-content"><div><p>A</p><p style="visibility:visible">B</p><p>C</p><p>D</p><p>E</p></div></div></section></div>'
    const candidates = Array.from(document.querySelectorAll<HTMLElement>('.native-slide-content p'))

    const sequences = await captureNativeDeckFrameSequences(document)

    expect(sequences[0]).toHaveLength(4)
    expect(toPng).toHaveBeenCalledTimes(4)
    expect(candidates.map((element) => element.style.visibility)).toEqual(['', 'visible', '', '', ''])
  })

  it('captures validated scene manifests from the same export DOM', () => {
    document.body.innerHTML = '<div id="deck"><section class="slide"><div class="native-slide" data-page-id="page-1"><div class="native-slide-content"><h1>标题</h1></div></div></section></div>'
    const root = document.querySelector<HTMLElement>('.native-slide')!
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1920, height: 1080, right: 1920, bottom: 1080 } as DOMRect)
    const title = document.querySelector<HTMLElement>('h1')!
    vi.spyOn(title, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 80, width: 600, height: 100, right: 700, bottom: 180 } as DOMRect)

    const manifests = captureNativeSceneManifests([{ pageId: 'page-1', layout: 'core01_cover', props: { title: '标题' } }])

    expect(manifests[0].page_id).toBe('page-1')
    expect(manifests[0].elements[0]).toMatchObject({ id: 'title', kind: 'title', bbox: [100, 80, 600, 100] })
  })

  it('preserves page order and rejects a stale or reordered export DOM', () => {
    document.body.innerHTML = `
      <div id="deck">
        <section class="slide"><div class="native-slide" data-page-id="page-1"><h1>第一页</h1></div></section>
        <section class="slide"><div class="native-slide" data-page-id="page-2"><h1>第二页</h1></div></section>
      </div>`
    const sceneRoots = Array.from(document.querySelectorAll<HTMLElement>('.native-slide'))
    const titles = Array.from(document.querySelectorAll<HTMLElement>('h1'))
    sceneRoots.forEach((root) => vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1920, height: 1080, right: 1920, bottom: 1080 } as DOMRect))
    titles.forEach((title) => vi.spyOn(title, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 80, width: 600, height: 100, right: 700, bottom: 180 } as DOMRect))
    const slides = [
      { pageId: 'page-1', layout: 'core01_cover', props: { title: '第一页' } },
      { pageId: 'page-2', layout: 'core01_cover', props: { title: '第二页' } },
    ]

    expect(captureNativeSceneManifests(slides).map((manifest) => manifest.page_id)).toEqual(['page-1', 'page-2'])
    expect(() => captureNativeSceneManifests([...slides].reverse())).toThrow('第 1 页场景顺序与导出页面不一致')
  })
})

describe('waitForNativeAnimations', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="deck"><div class="native-enter-fade"></div><div class="theme-loop"></div></div>'
  })

  it('waits for finite native entry animations only', async () => {
    const entry = document.querySelector('.native-enter-fade') as HTMLElement
    const finished = Promise.resolve()
    const getAnimations = vi.fn(() => [{ finished }])
    entry.getAnimations = getAnimations as unknown as typeof entry.getAnimations
    const loop = document.querySelector('.theme-loop') as HTMLElement
    loop.getAnimations = vi.fn(() => [{ finished: new Promise(() => {}) }]) as unknown as typeof loop.getAnimations

    await waitForNativeAnimations(document, 50)

    expect(getAnimations).toHaveBeenCalledOnce()
    expect(loop.getAnimations).not.toHaveBeenCalled()
  })

  it('returns after the timeout when an entry animation never settles', async () => {
    const entry = document.querySelector('.native-enter-fade') as HTMLElement
    entry.getAnimations = vi.fn(() => [{ finished: new Promise(() => {}) }]) as unknown as typeof entry.getAnimations
    const started = performance.now()

    await waitForNativeAnimations(document, 30)

    expect(performance.now() - started).toBeGreaterThanOrEqual(20)
  })

  it('finalizes finite animations on the active slide and pauses looping effects', async () => {
    document.body.innerHTML = '<div id="deck"><section class="slide active"><div class="finite"></div><div class="loop"></div></section></div>'
    const finite = document.querySelector('.finite') as HTMLElement
    const loop = document.querySelector('.loop') as HTMLElement
    const finish = vi.fn()
    const pause = vi.fn()
    finite.getAnimations = vi.fn(() => [{ finished: Promise.resolve(), finish, effect: { getComputedTiming: () => ({ endTime: 300 }) } }]) as unknown as typeof finite.getAnimations
    loop.getAnimations = vi.fn(() => [{ finished: new Promise(() => {}), pause, effect: { getComputedTiming: () => ({ endTime: Infinity }) } }]) as unknown as typeof loop.getAnimations

    await waitForNativeAnimations(document, 50)

    expect(finish).toHaveBeenCalledOnce()
    expect(pause).toHaveBeenCalledOnce()
  })
})

describe('waitForNativeMedia', () => {
  it('returns after the media timeout when an image never loads', async () => {
    document.body.innerHTML = '<div id="deck"><section class="slide"><img src="pending.png"></section></div>'
    const image = document.querySelector('img') as HTMLImageElement
    Object.defineProperty(image, 'complete', { value: false, configurable: true })
    const started = performance.now()

    await waitForNativeMedia(document, 30)

    expect(performance.now() - started).toBeGreaterThanOrEqual(20)
  })
})

describe('waitForNativeStableLayout', () => {
  it('returns when slide geometry is stable for consecutive frames', async () => {
    document.body.innerHTML = '<div id="deck"><section class="slide"><div>内容</div></section></div>'
    await waitForNativeStableLayout(document, 200)
    expect(document.querySelector('.slide')).toBeInTheDocument()
  })
})
