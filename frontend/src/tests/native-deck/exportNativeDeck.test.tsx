import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeDeckExportSurface } from '@/components/native-deck/NativeDeckExportSurface'
import { assertNoFullSlideRasterConflict, exportNativeDeck, resolveNativeElementEnter } from '@/native-deck/exportNativeDeck'
import type { NativeSlideSpec } from '@/native-deck/types'
import { exportEditablePptxInBrowser } from '@/vendor/html-deck-to-pptx/editable-browser.mjs'

vi.mock('@/vendor/html-deck-to-pptx/editable-browser.mjs', () => ({
  exportEditablePptxInBrowser: vi.fn(async () => ({
    blob: new Blob(['PK']),
    report: { slideCount: 1, textObjects: 1, shapeObjects: 0, imageObjects: 0, slideSummaries: [], warnings: [] },
  })),
}))

const slides: NativeSlideSpec[] = [
  { pageId: 'page-1', layout: 'core01_cover', props: { title: '第一页' } },
  { pageId: 'page-2', layout: 'core01_end', props: { title: '第二页' } },
]

describe('native deck browser export', () => {
  beforeEach(() => {
    vi.mocked(exportEditablePptxInBrowser).mockClear()
  })

  it('maps Dashi internal motion to a conservative PPTX entrance fallback', () => {
    expect(resolveNativeElementEnter({}, 'theme01_page001')).toBe('fade')
    expect(resolveNativeElementEnter({ internal: false }, 'theme01_page001')).toBeUndefined()
    expect(resolveNativeElementEnter({ elementEnter: 'wipe' }, 'theme01_page001')).toBe('wipe')
  })

  it('installs the deck DOM contract and switches the active slide', () => {
    const { container } = render(<NativeDeckExportSurface slides={slides} />)
    const deckSlides = container.querySelectorAll('#deck > .slide')

    expect(container.querySelector('#deck')).toHaveClass('native-export-surface')
    expect(deckSlides).toHaveLength(2)
    expect(deckSlides[0]).toHaveClass('active')
    expect(window.__getVisibleSlides?.()).toHaveLength(2)

    window.go?.(1)
    expect(deckSlides[0]).not.toHaveClass('active')
    expect(deckSlides[1]).toHaveClass('active')
    expect(deckSlides[1]).toHaveAttribute('data-deck-active')
  })

  it('keeps the configured animation metadata on each export slide', () => {
    const { container } = render(<NativeDeckExportSurface slides={[{ ...slides[0], props: { ...slides[0].props, __animation: { enter: 'fade', transition: 'zoom', internal: false } } }]} />)
    expect(container.querySelector('#deck > .slide')).toHaveAttribute('data-native-animation', JSON.stringify({ enter: 'fade', transition: 'zoom', internal: false }))
  })

  it('forwards progress and pause callbacks to the vendored exporter', async () => {
    render(<NativeDeckExportSurface slides={slides.slice(0, 1)} />)
    const onProgress = vi.fn()
    const waitIfPaused = vi.fn()

    await exportNativeDeck({ title: '测试', onProgress, waitIfPaused })

    expect(exportEditablePptxInBrowser).toHaveBeenCalledWith(expect.objectContaining({
      title: '测试',
      onProgress,
      waitIfPaused,
    }))
  })

  it('waits for dynamically loaded theme pages before exporting', async () => {
    document.body.innerHTML = '<div id="deck"><section class="slide"><div class="native-slide"></div></section></div>'
    const pending = exportNativeDeck({ title: '异步主题' })

    await Promise.resolve()
    expect(exportEditablePptxInBrowser).not.toHaveBeenCalled()
    document.querySelector('.native-slide')?.setAttribute('data-native-layout-ready', 'true')

    await pending
    expect(exportEditablePptxInBrowser).toHaveBeenCalledOnce()
  })

  it('rejects a page-sized raster element when the same slide has text', () => {
    document.body.innerHTML = `
      <div id="deck">
        <section class="slide"><p>可编辑文字</p><canvas data-editable-pptx-raster></canvas></section>
      </div>`
    const slide = document.querySelector('.slide') as HTMLElement
    const canvas = document.querySelector('canvas') as HTMLElement
    vi.spyOn(slide, 'getBoundingClientRect').mockReturnValue(rect(1920, 1080))
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(rect(1900, 1060))

    expect(() => assertNoFullSlideRasterConflict()).toThrow('整页栅格回退')
  })
})

function rect(width: number, height: number): DOMRect {
  return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }
}
