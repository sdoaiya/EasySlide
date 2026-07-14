import * as htmlToImage from 'html-to-image'
import PptxGenJS from 'pptxgenjs'
import { exportEditablePptxInBrowser, type EditablePptxReport } from '@/vendor/html-deck-to-pptx/editable-browser.mjs'

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
  return result
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
