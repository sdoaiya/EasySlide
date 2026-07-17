import { beforeEach, describe, expect, it, vi } from 'vitest'

const { toPng } = vi.hoisted(() => ({ toPng: vi.fn(async () => 'data:image/png;base64,AA==') }))
vi.mock('html-to-image', () => ({ toPng }))

import { captureNativeDeckFrameSequences, waitForNativeAnimations, waitForNativeMedia, waitForNativeStableLayout } from '@/native-deck/exportNativeDeckFrames'

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
