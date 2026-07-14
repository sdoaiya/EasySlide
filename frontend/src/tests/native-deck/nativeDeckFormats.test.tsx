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
    <section class="slide"><div class="native-slide"><h1>第一页</h1></div></section>
    <section class="slide"><div class="native-slide"><h1>第二页</h1></div></section>
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

    const html = await readBlob(exportNativeDeckHtml({ title: '离线演示', slides }))

    expect(html).toContain('<style>')
    expect(html).toContain('.native-slide')
    expect(html).toContain('id="deck-data"')
    expect(html).toContain('"pageId"')
    expect(html).toContain('data-page-index="1"')
    expect(html).toContain('上一页')
    expect(html).toContain('下一页')
    expect(html).not.toMatch(/<(?:script|link|img)[^>]+(?:src|href)=["']https?:/i)
  })

  it('rejects project file media instead of producing a broken offline file', () => {
    installDeckDom()
    const withProjectMedia: NativeSlideSpec[] = [{
      pageId: 'page-1',
      layout: 'core01_case',
      props: { title: '案例', image: '/files/project/image.png' },
    }]

    expect(() => exportNativeDeckHtml({ title: '离线演示', slides: withProjectMedia })).toThrow('/files/project/image.png')
  })

  it('rejects remote DOM resources instead of depending on a network connection', () => {
    installDeckDom()
    document.querySelector('.native-slide')?.insertAdjacentHTML('beforeend', '<img src="https://example.com/image.png">')

    expect(() => exportNativeDeckHtml({ title: '离线演示', slides })).toThrow('https://example.com/image.png')
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
    ['PDF', 'native_project-1.pdf'],
    ['离线 HTML', 'native_project-1.html'],
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
