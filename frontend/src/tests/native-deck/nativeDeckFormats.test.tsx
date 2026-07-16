import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { PDFDocument } from 'pdf-lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import layoutManifest from '../../../../shared/native-deck/layout-manifest.json'
import { NativeDeckWorkspace } from '@/components/native-deck/NativeDeckWorkspace'
import type { NativeLayoutContract } from '@/components/native-deck/NativeDeckPropertyPanel'
import type { NativeSlideSpec } from '@/native-deck/types'
import { exportNativeDeckHtml } from '@/native-deck/exportNativeDeckHtml'
import { exportNativeDeckPdf } from '@/native-deck/exportNativeDeckPdf'
import { completeNativePptxExport, createNativePptxExport } from '@/api/endpoints'
import { useExportTasksStore } from '@/store/useExportTasksStore'

const mocks = vi.hoisted(() => ({
  toPng: vi.fn(),
  createExport: vi.fn(),
  completeExport: vi.fn(),
  getTaskStatus: vi.fn(),
}))

vi.mock('html-to-image', () => ({ toPng: mocks.toPng }))
vi.mock('@/native-deck/native-deck.css?raw', () => ({ default: '.native-slide{width:1920px;height:1080px}.core01-cover{background:#fff}' }))
vi.mock('@/api/endpoints', () => ({
  completeNativePptxExport: mocks.completeExport,
  createNativePptxExport: mocks.createExport,
  getTaskStatus: mocks.getTaskStatus,
  updateNativePptxProgress: vi.fn(),
}))

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xv4lWQAAAABJRU5ErkJggg=='
const slides: NativeSlideSpec[] = [
  { pageId: 'page-1', layout: 'core01_cover', props: { title: '第一页' } },
  { pageId: 'page-2', layout: 'core01_end', props: { title: '第二页' } },
]

function installDeckDom() {
  document.body.innerHTML = `<div id="deck">
    <section class="slide"><div class="native-slide" data-native-layout-ready="true"><h1>第一页</h1></div></section>
    <section class="slide"><div class="native-slide" data-native-layout-ready="true"><h1>第二页</h1></div></section>
  </div>`
}

async function readBlob(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(blob)
  })
}

async function readBlobBytes(blob: Blob) {
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.readAsArrayBuffer(blob)
  })
}

describe('native deck PDF export', () => {
  beforeEach(() => {
    mocks.toPng.mockReset().mockResolvedValue(png)
  })

  it('rasterizes every real 1920 x 1080 slide DOM into a 16:9 PDF', async () => {
    installDeckDom()

    const blob = await exportNativeDeckPdf({ title: '离线演示' })
    const bytes = await readBlobBytes(blob)
    const pdf = await PDFDocument.load(bytes)

    expect(mocks.toPng).toHaveBeenCalledTimes(2)
    expect(mocks.toPng).toHaveBeenNthCalledWith(1, document.querySelectorAll('#deck > .slide')[0], expect.objectContaining({
      width: 1920,
      height: 1080,
      canvasWidth: 1920,
      canvasHeight: 1080,
    }))
    expect(pdf.getPageCount()).toBe(2)
    for (const page of pdf.getPages()) {
      expect(page.getWidth() / page.getHeight()).toBeCloseTo(16 / 9, 5)
    }
  })
})

describe('native deck offline HTML export', () => {
  it('embeds layout CSS, rendered pages, page JSON and browser navigation in one file', async () => {
    installDeckDom()

    const html = await readBlob(await exportNativeDeckHtml({ title: '离线演示', slides }))

    expect(html).toContain('<style>')
    expect(html).toContain('.native-slide')
    expect(html).toContain('id="deck-data"')
    expect(html).toContain('"pageId"')
    expect(html).toContain('data-page-index="1"')
    expect(html).toContain('上一页')
    expect(html).toContain('下一页')
    expect(html).not.toMatch(/<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i)
  })

  it('embeds project file media instead of producing a broken offline file', async () => {
    installDeckDom()
    document.querySelector('.native-slide')?.insertAdjacentHTML('beforeend', '<img src="/files/project/image.png">')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['image'], { type: 'image/png' }) }))
    const withProjectMedia: NativeSlideSpec[] = [{
      pageId: 'page-1',
      layout: 'core01_case',
      props: { title: '案例', image: '/files/project/image.png' },
    }]

    const html = await readBlob(await exportNativeDeckHtml({ title: '离线演示', slides: withProjectMedia }))

    expect(html).toContain('data:image/png;base64')
    expect(html).not.toContain('/files/project/image.png')
    vi.unstubAllGlobals()
  })

  it('reports a precise error when an external DOM resource cannot be embedded', async () => {
    installDeckDom()
    document.querySelector('.native-slide')?.insertAdjacentHTML('beforeend', '<img src="https://example.com/image.png">')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    await expect(exportNativeDeckHtml({ title: '离线演示', slides })).rejects.toThrow('https://example.com/image.png')
    vi.unstubAllGlobals()
  })

  it('preserves optional auto-advance metadata in offline HTML', async () => {
    installDeckDom()
    const autoSlides = slides.map((slide, index) => ({
      ...slide,
      props: { ...slide.props, __animation: { advanceAfter: index === 0 ? 5 : 0, elementEnter: 'fade', elementTrigger: 'click', elementEasing: 'ease-in-out' } },
    }))
    const html = await readBlob(await exportNativeDeckHtml({ title: '自动演示', slides: autoSlides }))

    expect(html).toContain('DOMContentLoaded')
    expect(html).toContain('advanceElement')
    expect(html).toContain('data-element-step')
    expect(html).toContain('elementTrigger')
    expect(html).toContain('--native-element-duration')
    expect(html).toContain('--native-element-delay')
    expect(html).toContain('--native-element-stagger')
    expect(html).toContain('--native-element-easing')
    expect(html).toContain('ease-in-out')
    const playerScript = html.split('<script>').at(-1)?.split('</script>')[0]
    expect(playerScript).toBeTruthy()
    expect(() => new Function(playerScript!)).not.toThrow()
  })

  it('keeps disabled theme motion disabled in offline HTML', async () => {
    installDeckDom()
    const staticSlides = slides.map((slide) => ({
      ...slide,
      props: { ...slide.props, __animation: { internal: false } },
    }))
    const html = await readBlob(await exportNativeDeckHtml({ title: '静态演示', slides: staticSlides }))

    expect(html).toContain('data-native-internal="0"')
    expect(html).toContain('.slide[data-native-internal="0"] *{animation:none!important}')
  })

  it('preserves Huashu visual-system attributes in offline HTML', async () => {
    installDeckDom()
    const native = document.querySelector('.native-slide')!
    native.setAttribute('data-design-engine', 'huashu_native')
    native.setAttribute('data-visual-system', 'signal')

    const html = await readBlob(await exportNativeDeckHtml({ title: 'Huashu 演示', slides }))

    expect(html).toContain('data-design-engine="huashu_native"')
    expect(html).toContain('data-visual-system="signal"')
  })
})

describe('native deck format entries', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mocks.toPng.mockReset().mockResolvedValue(png)
    mocks.createExport.mockReset().mockResolvedValue({ data: { task_id: 'task-format', status: 'PENDING' } })
    mocks.completeExport.mockReset().mockResolvedValue({ data: { status: 'COMPLETED', progress: { download_url: '/files/project-1/exports/result' } } })
    mocks.getTaskStatus.mockReset().mockResolvedValue({ data: { task_id: 'pending-html', status: 'PAUSED' } })
    useExportTasksStore.setState({ tasks: [] })
  })

  it.each([
    ['PDF', '第一页.pdf'],
    ['离线 HTML', '第一页.html'],
  ] as const)('uploads the selected %s format to the unified export task', async (format, filename) => {
    render(
      <NativeDeckWorkspace
        projectId="project-1"
        slides={slides}
        layoutContracts={layoutManifest.layouts as unknown as readonly NativeLayoutContract[]}
      />,
    )

    fireEvent.change(screen.getByLabelText('导出格式'), { target: { value: format } })
    fireEvent.click(screen.getByRole('button', { name: `导出${format}` }))

    const apiFormat = format === 'PDF' ? 'pdf' : 'html'
    await waitFor(() => expect(createNativePptxExport).toHaveBeenCalledWith('project-1', apiFormat))
    await waitFor(() => expect(completeNativePptxExport).toHaveBeenCalledWith(
      'project-1',
      'task-format',
      expect.any(Blob),
      expect.objectContaining({ slideCount: 2 }),
      filename,
    ))
  })

  it('restarts one pending native task only once in React strict mode', async () => {
    useExportTasksStore.setState({
      tasks: [{
        id: 'pending-html',
        taskId: 'pending-html',
        projectId: 'project-1',
        type: 'native-html',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
      }],
    })

    render(
      <StrictMode>
        <NativeDeckWorkspace
          projectId="project-1"
          slides={slides}
          layoutContracts={layoutManifest.layouts as unknown as readonly NativeLayoutContract[]}
        />
      </StrictMode>,
    )

    await waitFor(() => expect(mocks.completeExport).toHaveBeenCalledTimes(1))
  })
})
