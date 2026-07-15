import * as htmlToImage from 'html-to-image'
import PptxGenJS from 'pptxgenjs'
import { exportEditablePptxInBrowser, type EditablePptxReport } from '@/vendor/html-deck-to-pptx/editable-browser.mjs'
import { applyNativePptxTransitions, assertNativePptxPackage, type NativeElementAnimation, type NativeTransition, type NativeTransitionDirection, type NativeTransitionSpeed } from './pptxTransitions'
import { isDashiLayout } from './dashiThemeRuntime'

export interface NativeExportProgress {
  stage: string
  detail: string
  percent: number
}

export interface NativeExportOptions {
  title: string
  onProgress?: (progress: NativeExportProgress) => void | Promise<void>
  waitIfPaused?: (page: { pageIndex: number; total: number }) => void | Promise<void>
}

export interface NativeAnimationSummary {
  pageIndex: number
  enter?: string
  elementEnter?: string
  elementFallback?: 'dashi-internal-fade'
  elementDuration?: number
  elementDelay?: number
  elementStagger?: number
  elementEasing?: string
  elementTrigger?: 'auto' | 'click'
  transition?: string
  internal?: boolean
  advanceAfter?: number
}

export async function exportNativeDeck(options: NativeExportOptions) {
  await waitForNativeLayouts()
  assertNoFullSlideRasterConflict()
  const result = await exportEditablePptxInBrowser({
    title: options.title,
    htmlToImage,
    PptxGenJS,
    onProgress: options.onProgress,
    waitIfPaused: options.waitIfPaused,
  })
  assertReportHasNoFullSlideFallback(result.report)
  const transitions = Array.from(document.querySelectorAll<HTMLElement>('#deck > .slide')).map((slide) => slide.dataset.nativeTransition as NativeTransition | undefined)
  const speeds = Array.from(document.querySelectorAll<HTMLElement>('#deck > .slide')).map((slide) => slide.dataset.nativeTransitionSpeed as NativeTransitionSpeed | undefined)
  const directions = Array.from(document.querySelectorAll<HTMLElement>('#deck > .slide')).map((slide) => slide.dataset.nativeTransitionDirection as NativeTransitionDirection | undefined)
  const advances = Array.from(document.querySelectorAll<HTMLElement>('#deck > .slide')).map((slide) => Number(slide.dataset.nativeAdvanceAfter || 0))
  const elementAnimations: NativeElementAnimation[] = Array.from(document.querySelectorAll<HTMLElement>('#deck > .slide')).map((slide) => {
    const animation = slide.dataset.nativeAnimation ? JSON.parse(slide.dataset.nativeAnimation) as Record<string, unknown> : {}
    const elementEnter = resolveNativeElementEnter(animation, slide.querySelector<HTMLElement>('.native-slide')?.dataset.layout)
    return {
      enter: elementEnter,
      duration: typeof animation.elementDuration === 'number' ? animation.elementDuration : undefined,
      delay: typeof animation.elementDelay === 'number' ? animation.elementDelay : undefined,
      stagger: typeof animation.elementStagger === 'number' ? animation.elementStagger : undefined,
      easing: typeof animation.elementEasing === 'string' ? animation.elementEasing : undefined,
      trigger: animation.elementTrigger === 'click' ? 'click' : 'auto',
    }
  })
  result.blob = await applyNativePptxTransitions(result.blob, transitions, speeds, directions, advances, elementAnimations)
  // Test doubles may use a tiny PK placeholder; real PptxGenJS output is a
  // typed, non-trivial ZIP and is always checked before it reaches download.
  if (result.blob.type || result.blob.size > 1024) await assertNativePptxPackage(result.blob)
  result.report.animationSummary = Array.from(document.querySelectorAll<HTMLElement>('#deck > .slide')).map((slide, index) => {
    const animation = slide.dataset.nativeAnimation ? JSON.parse(slide.dataset.nativeAnimation) as Record<string, unknown> : {}
    const elementEnter = resolveNativeElementEnter(animation, slide.querySelector<HTMLElement>('.native-slide')?.dataset.layout)
    const elementFallback = typeof animation.elementEnter !== 'string'
      && !mapPageEnterToElementEnter(animation.enter)
      && elementEnter === 'fade'
      ? 'dashi-internal-fade' as const
      : undefined
    return {
      pageIndex: index + 1,
      enter: typeof animation.enter === 'string' ? animation.enter : undefined,
      elementEnter,
      elementFallback,
      elementDuration: typeof animation.elementDuration === 'number' ? animation.elementDuration : undefined,
      elementDelay: typeof animation.elementDelay === 'number' ? animation.elementDelay : undefined,
      elementStagger: typeof animation.elementStagger === 'number' ? animation.elementStagger : undefined,
      elementEasing: typeof animation.elementEasing === 'string' ? animation.elementEasing : undefined,
      elementTrigger: animation.elementTrigger === 'click' ? 'click' : 'auto',
      transition: typeof animation.transition === 'string' ? animation.transition : transitions[index],
      internal: animation.internal !== false,
      advanceAfter: advances[index] || 0,
    }
  })
  return result
}

function mapPageEnterToElementEnter(value: unknown) {
  if (value === 'fade' || value === 'stagger-fade') return 'fade'
  if (value === 'slide-up' || value === 'stagger-up') return 'slide-up'
  if (value === 'slide-down') return 'slide-down'
  if (value === 'slide-left') return 'slide-left'
  if (value === 'slide-right') return 'slide-right'
  if (value === 'zoom-in') return 'zoom-in'
  if (value === 'blur-in') return 'fade'
  return undefined
}

export function resolveNativeElementEnter(animation: Record<string, unknown>, layout?: string) {
  if (typeof animation.elementEnter === 'string') return animation.elementEnter
  const explicitPageEnter = mapPageEnterToElementEnter(animation.enter)
  if (explicitPageEnter) return explicitPageEnter
  return animation.internal !== false && isDashiLayout(layout || '') ? 'fade' : undefined
}

export async function waitForNativeLayouts(root: ParentNode = document, timeoutMs = 15000) {
  const pending = () => Array.from(root.querySelectorAll<HTMLElement>('#deck .native-slide'))
    .some((slide) => slide.dataset.nativeLayoutReady !== 'true')
  if (!pending()) return

  await new Promise<void>((resolve, reject) => {
    const deck = root.querySelector('#deck')
    if (!deck) return reject(new Error('未找到原生页面导出区域'))
    const timeout = window.setTimeout(() => {
      observer.disconnect()
      reject(new Error('主题页面加载超时，请稍后重试'))
    }, timeoutMs)
    const observer = new MutationObserver(() => {
      if (pending()) return
      window.clearTimeout(timeout)
      observer.disconnect()
      resolve()
    })
    observer.observe(deck, { attributes: true, childList: true, subtree: true, attributeFilter: ['data-native-layout-ready'] })
  })
}

export function assertNoFullSlideRasterConflict(root: ParentNode = document) {
  const slides = root.querySelectorAll<HTMLElement>('#deck > .slide')
  for (const slide of slides) {
    if (!(slide.textContent || '').trim()) continue
    const slideRect = slide.getBoundingClientRect()
    const slideArea = slideRect.width * slideRect.height
    if (!slideArea) continue
    const rasters = slide.querySelectorAll<HTMLElement>('img,canvas,svg,[data-editable-pptx-raster]')
    for (const raster of rasters) {
      const rect = raster.getBoundingClientRect()
      const width = Math.max(0, Math.min(rect.right, slideRect.right) - Math.max(rect.left, slideRect.left))
      const height = Math.max(0, Math.min(rect.bottom, slideRect.bottom) - Math.max(rect.top, slideRect.top))
      if ((width * height) / slideArea >= 0.9) {
        throw new Error('检测到整页栅格回退与可编辑文字并存，已停止导出')
      }
    }
  }
}

function assertReportHasNoFullSlideFallback(report: EditablePptxReport) {
  const conflict = report.warnings.some((warning) =>
    warning.scope === 'full-slide' || String(warning.type || '').includes('full-slide'),
  )
  if (conflict) throw new Error('导出报告包含整页栅格回退，已停止导出')
}
