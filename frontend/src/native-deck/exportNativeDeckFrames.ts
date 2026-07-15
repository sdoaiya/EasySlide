import { toPng } from 'html-to-image'
import { waitForNativeLayouts } from './exportNativeDeck'

const WIDTH = 1920
const HEIGHT = 1080

export async function captureNativeDeckFrames(root: ParentNode = document) {
  await waitForNativeLayouts(root)
  await document.fonts?.ready
  await waitForNativeMedia(root)
  await waitForNativeAnimations(root)
  await waitForNativeStableLayout(root)
  const slides = Array.from(root.querySelectorAll<HTMLElement>('#deck > .slide'))
  if (!slides.length) throw new Error('没有可导出的视频页面')

  const frames: Blob[] = []
  for (const slide of slides) {
    const dataUrl = await toPng(slide, {
      width: WIDTH,
      height: HEIGHT,
      canvasWidth: WIDTH,
      canvasHeight: HEIGHT,
      pixelRatio: 1,
      cacheBust: true,
    })
    frames.push(dataUrlBlob(dataUrl))
  }
  return frames
}

/** Wait until slide geometry is identical across two animation frames. */
export async function waitForNativeStableLayout(root: ParentNode = document, timeoutMs = 1000) {
  const slides = Array.from(root.querySelectorAll<HTMLElement>('#deck > .slide'))
  if (!slides.length) return
  const frame = () => new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
    else setTimeout(resolve, 16)
  })
  const signature = () => slides.map((slide) => {
    const elements = [slide, ...Array.from(slide.querySelectorAll<HTMLElement>('*'))]
    return elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return [rect.left, rect.top, rect.width, rect.height, element.clientWidth, element.clientHeight].map((value) => Math.round(value * 100) / 100).join(',')
    }).join(';')
  }).join('|')
  let previous = signature()
  let stableFrames = 0
  const started = performance.now()
  while (performance.now() - started < timeoutMs) {
    await frame()
    const current = signature()
    if (current === previous) {
      stableFrames += 1
      if (stableFrames >= 2) return
    } else {
      stableFrames = 0
      previous = current
    }
  }
}

/** Wait for media dimensions/data before raster capture; never block export forever. */
export async function waitForNativeMedia(root: ParentNode = document, timeoutMs = 3000) {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('#deck > .slide img')).filter((image) => !image.complete)
  const videos = Array.from(root.querySelectorAll<HTMLVideoElement>('#deck > .slide video')).filter((video) => video.readyState < 2)
  if (!images.length && !videos.length) return

  let timeout: ReturnType<typeof setTimeout> | undefined
  const loaded = Promise.all([
    ...images.map((image) => new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true })
      image.addEventListener('error', () => resolve(), { once: true })
    })),
    ...videos.map((video) => {
      video.load?.()
      return new Promise<void>((resolve) => {
        video.addEventListener('loadeddata', () => resolve(), { once: true })
        video.addEventListener('error', () => resolve(), { once: true })
      })
    }),
  ]).then(() => undefined)
  const limit = new Promise<void>((resolve) => { timeout = setTimeout(resolve, timeoutMs) })
  await Promise.race([loaded, limit])
  if (timeout) clearTimeout(timeout)
}

/** Wait for finite page-entry animations without blocking on looping theme effects. */
export async function waitForNativeAnimations(root: ParentNode = document, timeoutMs = 2500) {
  const activeSlides = Array.from(root.querySelectorAll<HTMLElement>('#deck > .slide.active, #deck > .slide[data-deck-active]'))
  const candidates = activeSlides.length
    ? activeSlides.flatMap((slide) => [slide, ...Array.from(slide.querySelectorAll<HTMLElement>('*'))])
    : Array.from(root.querySelectorAll<HTMLElement>('#deck *')).filter((element) => Array.from(element.classList).some((name) => name.startsWith('native-enter-')))
  const animations = candidates.flatMap((element) => element.getAnimations?.() || [])

  if (!animations.length) return

  // Dashi's screenshot exporter finalizes finite animations and pauses loops
  // before capture; waiting for `finished` alone leaves infinite theme motion
  // nondeterministic and can capture an intermediate frame.
  animations.forEach((animation) => {
    const endTime = Number(animation.effect?.getComputedTiming?.().endTime)
    try {
      if (Number.isFinite(endTime) && endTime > 0) animation.finish()
      else animation.pause()
    } catch {
      // Some browser animation implementations reject finish/pause while
      // detached; the timeout below still keeps export bounded.
    }
  })

  let timeout: ReturnType<typeof setTimeout> | undefined
  const finished = Promise.allSettled(animations.map((animation) => animation.finished)).then(() => undefined)
  const limit = new Promise<void>((resolve) => {
    timeout = setTimeout(resolve, timeoutMs)
  })
  await Promise.race([finished, limit])
  if (timeout) clearTimeout(timeout)
}

function dataUrlBlob(dataUrl: string) {
  const [header, base64] = dataUrl.split(',', 2)
  if (!base64) throw new Error('页面 PNG 编码无效')
  const type = /data:([^;]+)/.exec(header)?.[1] || 'image/png'
  const binary = atob(base64)
  return new Blob([Uint8Array.from(binary, (character) => character.charCodeAt(0))], { type })
}
