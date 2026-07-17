import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import layoutManifest from '../../../../shared/native-deck/layout-manifest.json'
import { apiClient } from '@/api/client'
import { NativeDeckWorkspace } from '@/components/native-deck/NativeDeckWorkspace'
import type { NativeLayoutContract } from '@/components/native-deck/NativeDeckPropertyPanel'
import type { NativeSlideSpec } from '@/native-deck/types'
import { useNativeDeckStore } from '@/store/useNativeDeckStore'

const previewMocks = vi.hoisted(() => ({
  store: {
    currentProject: null as Record<string, unknown> | null,
    syncProject: vi.fn(),
    generatePageImage: vi.fn(),
    generateImages: vi.fn(),
    editPageImage: vi.fn(),
    deletePageById: vi.fn(),
    updatePageLocal: vi.fn(),
    isGlobalLoading: false,
    taskProgress: null,
    pageGeneratingTasks: {},
    warningMessage: null,
    restoreImageGeneration: vi.fn(),
  },
}))

const nativeApiMocks = vi.hoisted(() => ({
  addPage: vi.fn(),
  completeNativePptxExport: vi.fn(),
  createNativePptxExport: vi.fn(),
  deletePage: vi.fn(),
  updatePagesOrder: vi.fn(),
  exportNativeVideo: vi.fn(),
  generateMaterialImage: vi.fn(),
  updateProject: vi.fn(),
  getNativePageVersions: vi.fn(),
  restoreNativePageVersion: vi.fn(),
}))

const exportTaskMocks = vi.hoisted(() => ({
  addTask: vi.fn(),
  updateTask: vi.fn(),
  pollTask: vi.fn(),
}))

const frameMocks = vi.hoisted(() => ({ capture: vi.fn() }))
const exportMocks = vi.hoisted(() => ({
  exportNativeDeck: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  apiClient: { put: vi.fn() },
  getImageUrl: vi.fn((path: string) => path),
  getStaticAssetUrl: vi.fn((path: string) => path),
}))

vi.mock('@/store/useProjectStore', () => ({
  useProjectStore: Object.assign(vi.fn(() => previewMocks.store), {
    getState: vi.fn(() => previewMocks.store),
  }),
}))

vi.mock('@/store/useExportTasksStore', () => ({
  useExportTasksStore: () => ({ ...exportTaskMocks, tasks: [], restoreActiveTasks: vi.fn() }),
}))

vi.mock('@/native-deck/exportNativeDeckFrames', () => ({
  captureNativeDeckFrames: frameMocks.capture,
}))

vi.mock('@/native-deck/exportNativeDeck', () => ({
  exportNativeDeck: exportMocks.exportNativeDeck,
}))

vi.mock('@/api/endpoints', () => ({
  addPage: nativeApiMocks.addPage,
  deletePage: nativeApiMocks.deletePage,
  updatePagesOrder: nativeApiMocks.updatePagesOrder,
  completeNativePptxExport: nativeApiMocks.completeNativePptxExport,
  createNativePptxExport: nativeApiMocks.createNativePptxExport,
  getTaskStatus: vi.fn(),
  generateMaterialImage: nativeApiMocks.generateMaterialImage,
  updateNativePptxProgress: vi.fn(),
  getSettings: vi.fn(() => new Promise(() => {})),
  getElevenLabsVoices: vi.fn(() => new Promise(() => {})),
  listUserTemplates: vi.fn(() => new Promise(() => {})),
  getPageImageVersions: vi.fn(() => new Promise(() => {})),
  setCurrentImageVersion: vi.fn(),
  updateProject: nativeApiMocks.updateProject,
  uploadTemplate: vi.fn(),
  exportPPTX: vi.fn(),
  exportPDF: vi.fn(),
  exportImages: vi.fn(),
  exportEditablePPTX: vi.fn(),
  exportVideo: vi.fn(),
  exportNativeVideo: nativeApiMocks.exportNativeVideo,
  getNativePageVersions: nativeApiMocks.getNativePageVersions,
  restoreNativePageVersion: nativeApiMocks.restoreNativePageVersion,
}))

const slides: NativeSlideSpec[] = [
  {
    pageId: 'page-1',
    layout: 'core01_agenda',
    props: { title: '议程', items: ['现状', '方案'] },
  },
  {
    pageId: 'page-2',
    layout: 'core01_case',
    props: { kicker: '案例', title: '客户案例', summary: '摘要', image: '/files/old.png' },
  },
]
const layoutContracts = layoutManifest.layouts as unknown as readonly NativeLayoutContract[]

function renderWorkspace(initialSlides = slides) {
  return render(
    <NativeDeckWorkspace
      projectId="project-1"
      slides={initialSlides}
      layoutContracts={layoutContracts}
      autoSaveDelay={300}
    />,
  )
}

async function flushAutoSave() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300)
  })
}

describe('NativeDeckWorkspace', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(apiClient.put).mockReset().mockResolvedValue({ data: { success: true } })
    nativeApiMocks.addPage.mockReset().mockResolvedValue({ data: { page_id: 'page-new' } })
    nativeApiMocks.completeNativePptxExport.mockReset().mockResolvedValue({ data: { status: 'COMPLETED', progress: { download_url: '/files/project-1/exports/native.pptx' } } })
    nativeApiMocks.createNativePptxExport.mockReset().mockResolvedValue({ data: { task_id: 'native-pptx-task-1' } })
    nativeApiMocks.deletePage.mockReset().mockResolvedValue({ data: {} })
    nativeApiMocks.updatePagesOrder.mockReset().mockResolvedValue({ data: {} })
    nativeApiMocks.exportNativeVideo.mockReset().mockResolvedValue({ data: { task_id: 'video-task-1' } })
    nativeApiMocks.generateMaterialImage.mockReset()
    nativeApiMocks.updateProject.mockReset().mockResolvedValue({ data: undefined })
    nativeApiMocks.getNativePageVersions.mockReset().mockResolvedValue({ data: { versions: [] } })
    nativeApiMocks.restoreNativePageVersion.mockReset().mockResolvedValue({ data: {} })
    frameMocks.capture.mockReset().mockResolvedValue([new Blob(['frame'], { type: 'image/png' })])
    exportMocks.exportNativeDeck.mockReset().mockResolvedValue({
      blob: new Blob(['pptx'], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }),
      report: { slideCount: 1, textObjects: 1, shapeObjects: 0, imageObjects: 0, slideSummaries: [], warnings: [] },
    })
    exportTaskMocks.addTask.mockReset()
    exportTaskMocks.updateTask.mockReset()
    exportTaskMocks.pollTask.mockReset().mockResolvedValue(undefined)
    previewMocks.store.syncProject.mockReset().mockResolvedValue(undefined)
    previewMocks.store.restoreImageGeneration.mockReset()
    useNativeDeckStore.setState({ slides: [], selectedPageId: null, dirtyPageIds: new Set() })
  })

  it('marks pages with Huashu quality warnings in the page rail', () => {
    renderWorkspace([
      {
        ...slides[0],
        props: {
          ...slides[0].props,
          __design_intent: {
            quality_report: { status: 'warning', score: 85, outline_coverage: 0.4, issues: ['low_outline_coverage'] },
          },
        },
      },
    ])

    expect(screen.getByRole('button', { name: '第 1 页：议程，存在质量警告' })).toBeInTheDocument()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('switches pages while rendering the same native HTML in the rail and canvas', () => {
    renderWorkspace()

    expect(screen.getByRole('complementary', { name: '页面栏' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('议程')
    expect(screen.getByRole('complementary', { name: '属性栏' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '收起页面栏' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '收起属性栏' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '第 2 页：客户案例' }))

    expect(useNativeDeckStore.getState().selectedPageId).toBe('page-2')
    fireEvent.click(screen.getByRole('tab', { name: '媒体' }))
    expect(screen.getByAltText('image 1')).toHaveAttribute('src', '/files/old.png')
  })

  it('offers regeneration and persistent version history for a generated native page', async () => {
    const onRegenerate = vi.fn()
    nativeApiMocks.getNativePageVersions.mockResolvedValue({ data: { versions: [{ version_id: 'current', version_number: 2, is_current: true, layout: 'core01_agenda', props: slides[0].props }] } })
    render(
      <NativeDeckWorkspace
        projectId="project-1"
        slides={slides}
        layoutContracts={layoutContracts}
        singlePageGenerationAction={{ label: '重新生成本页', onClick: onRegenerate }}
      />,
    )

    expect(screen.getByRole('button', { name: '重新生成本页' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '页面版本' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新生成本页' }))
    expect(onRegenerate).toHaveBeenCalledWith('page-1')
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('版本 2（当前）')).toBeInTheDocument()
  })

  it('opens an in-app full-screen presentation overlay', () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined)
    const originalRequestFullscreen = document.documentElement.requestFullscreen
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: requestFullscreen })
    renderWorkspace()

    fireEvent.click(screen.getByRole('button', { name: '演示模式' }))

    const presentation = screen.getByRole('dialog', { name: '演示模式' })
    expect(presentation).toHaveClass('fixed', 'inset-0')
    expect(presentation.querySelector('button[aria-label="退出演示模式"]')).toBeInTheDocument()
    expect(requestFullscreen).toHaveBeenCalledOnce()
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: originalRequestFullscreen })
  })

  it('edits text and array fields from the selected layout contract', () => {
    renderWorkspace()

    fireEvent.click(screen.getByRole('tab', { name: '内容' }))
    fireEvent.change(screen.getByLabelText('title'), { target: { value: '更新后的议程' } })
    expect(screen.getByRole('main')).toHaveTextContent('更新后的议程')

    fireEvent.click(screen.getByRole('button', { name: '添加 items' }))
    expect(screen.getByLabelText('items 3')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('items 3'), { target: { value: '里程碑' } })
    expect(screen.getByRole('main')).toHaveTextContent('里程碑')

    fireEvent.click(screen.getByRole('button', { name: '删除 items 3' }))
    expect(screen.queryByLabelText('items 3')).not.toBeInTheDocument()
  })

  it('does not discard local edits when the parent rerenders equivalent slide data', () => {
    const { rerender } = renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: '内容' }))
    fireEvent.change(screen.getByLabelText('title'), { target: { value: '尚未保存的编辑' } })

    rerender(
      <NativeDeckWorkspace
        projectId="project-1"
        slides={slides.map((slide) => ({ ...slide, props: { ...slide.props } }))}
        layoutContracts={layoutContracts}
        autoSaveDelay={300}
      />,
    )

    expect(screen.getByLabelText('title')).toHaveValue('尚未保存的编辑')
    expect(useNativeDeckStore.getState().dirtyPageIds.has('page-1')).toBe(true)
  })

  it('merges newly generated server pages without discarding dirty edits or selection', () => {
    const { rerender } = renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: '内容' }))
    fireEvent.change(screen.getByLabelText('title'), { target: { value: '尚未保存的编辑' } })
    fireEvent.click(screen.getByRole('button', { name: '第 2 页：客户案例' }))

    rerender(
      <NativeDeckWorkspace
        projectId="project-1"
        slides={[
          ...slides,
          { pageId: 'page-3', layout: 'core01_process', props: { title: '新生成页面', steps: ['第一步'] } },
        ]}
        layoutContracts={layoutContracts}
        autoSaveDelay={300}
      />,
    )

    expect(useNativeDeckStore.getState().slides.find((slide) => slide.pageId === 'page-1')?.props.title).toBe('尚未保存的编辑')
    expect(useNativeDeckStore.getState().selectedPageId).toBe('page-2')
    expect(screen.getByRole('button', { name: '第 3 页：新生成页面' })).toBeInTheDocument()
  })

  it('clears a media slot and autosaves the current layout and props', async () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: '第 2 页：客户案例' }))
    fireEvent.click(screen.getByRole('tab', { name: '媒体' }))

    fireEvent.click(screen.getByRole('button', { name: '清除 image 1' }))
    expect(screen.queryByAltText('image 1')).not.toBeInTheDocument()

    await flushAutoSave()

    expect(apiClient.put).toHaveBeenCalledWith('/api/projects/project-1/pages/page-2/native', {
      layout: 'core01_case',
      props: { kicker: '案例', title: '客户案例', summary: '摘要', image: '' },
    })
    expect(useNativeDeckStore.getState().dirtyPageIds.has('page-2')).toBe(false)
    expect(screen.getByText('已保存')).toBeInTheDocument()
  })

  it('shows copy budget errors and does not send invalid content', async () => {
    renderWorkspace()

    fireEvent.click(screen.getByRole('tab', { name: '内容' }))
    fireEvent.change(screen.getByLabelText('title'), { target: { value: '这是一段明显超过二十四个字符限制并且不应发送到后端保存的标题文案' } })

    expect(screen.getByRole('alert')).toHaveTextContent('title 最多 24 个字符')
    await flushAutoSave()
    expect(apiClient.put).not.toHaveBeenCalled()
    expect(useNativeDeckStore.getState().dirtyPageIds.has('page-1')).toBe(true)
  })

  it('retries autosave before keeping the page dirty', async () => {
    vi.mocked(apiClient.put).mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce({ data: { success: true } })
    renderWorkspace()

    fireEvent.click(screen.getByRole('tab', { name: '内容' }))
    fireEvent.change(screen.getByLabelText('title'), { target: { value: '保存会失败' } })
    await flushAutoSave()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(apiClient.put).toHaveBeenCalledTimes(2)
    expect(useNativeDeckStore.getState().dirtyPageIds.has('page-1')).toBe(false)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('已保存')
  })

  it('keeps the page dirty after all autosave retries fail', async () => {
    vi.mocked(apiClient.put).mockRejectedValue(new Error('network down'))
    renderWorkspace()

    fireEvent.click(screen.getByRole('tab', { name: '内容' }))
    fireEvent.change(screen.getByLabelText('title'), { target: { value: '保存会失败' } })
    await flushAutoSave()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(apiClient.put).toHaveBeenCalledTimes(3)
    expect(useNativeDeckStore.getState().dirtyPageIds.has('page-1')).toBe(true)
    expect(screen.getByRole('status')).toHaveTextContent('自动保存失败，请检查网络后重试')
  })

  it('adds, duplicates, reorders, and deletes native pages through project APIs', async () => {
    vi.useRealTimers()
    renderWorkspace()

    fireEvent.click(screen.getByRole('button', { name: '复制第 1 页' }))
    await waitFor(() => {
      expect(nativeApiMocks.addPage).toHaveBeenCalledWith('project-1', expect.objectContaining({ order_index: 1 }))
      expect(apiClient.put).toHaveBeenCalledWith('/api/projects/project-1/pages/page-new/native', expect.objectContaining({ layout: 'core01_agenda' }))
      expect(screen.getByRole('button', { name: '删除第 2 页' })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '下移第 2 页' }))
    await waitFor(() => expect(nativeApiMocks.updatePagesOrder).toHaveBeenCalledWith('project-1', expect.any(Array)))

    fireEvent.click(screen.getByRole('button', { name: '删除第 3 页' }))
    await waitFor(() => {
      expect(nativeApiMocks.deletePage).toHaveBeenCalledWith('project-1', 'page-new')
      expect(screen.queryByRole('button', { name: '删除第 3 页' })).not.toBeInTheDocument()
    })

    nativeApiMocks.addPage.mockResolvedValueOnce({ data: { page_id: 'page-added' } })
    fireEvent.click(screen.getByRole('button', { name: '添加页面' }))
    await waitFor(() => expect(nativeApiMocks.addPage).toHaveBeenLastCalledWith('project-1', expect.objectContaining({ order_index: 2 })))
  })

  it('switches layout, zooms the canvas, and changes pages from the keyboard', () => {
    renderWorkspace()

    expect(screen.getByRole('button', { name: '演示模式' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: '页面' }))
    fireEvent.change(screen.getByLabelText('页面布局'), { target: { value: 'core01_process' } })
    expect(screen.getByLabelText('页面布局')).toHaveValue('core01_process')
    fireEvent.click(screen.getByRole('tab', { name: '内容' }))
    expect(screen.getByLabelText('steps 1')).toBeInTheDocument()

    expect(screen.getByText('100%')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '放大画布' }))
    expect(screen.getByText('110%')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'PageDown' })
    expect(useNativeDeckStore.getState().selectedPageId).toBe('page-2')
    fireEvent.keyDown(window, { key: 'Home' })
    expect(useNativeDeckStore.getState().selectedPageId).toBe('page-1')
    fireEvent.keyDown(window, { key: 'End' })
    expect(useNativeDeckStore.getState().selectedPageId).toBe('page-2')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(useNativeDeckStore.getState().selectedPageId).toBe('page-1')
    fireEvent.keyDown(window, { key: ' ' })
    expect(useNativeDeckStore.getState().selectedPageId).toBe('page-2')
  })

  it('copies only animation settings to every page', () => {
    renderWorkspace()

    fireEvent.click(screen.getByRole('tab', { name: '动效' }))
    fireEvent.click(screen.getByText('页面动效'))
    fireEvent.change(screen.getByLabelText('进入效果'), { target: { value: 'fade' } })
    fireEvent.change(screen.getByLabelText('页面切换'), { target: { value: 'cover' } })
    fireEvent.click(screen.getByLabelText('主题内部动效'))
    fireEvent.click(screen.getByRole('button', { name: '应用动效到全部页面' }))

    const nextSlides = useNativeDeckStore.getState().slides
    expect(nextSlides).toHaveLength(2)
    expect(nextSlides.every((slide) => (slide.props.__animation as Record<string, unknown>).enter === 'fade')).toBe(true)
    expect(nextSlides.every((slide) => (slide.props.__animation as Record<string, unknown>).transition === 'cover')).toBe(true)
    expect(nextSlides.every((slide) => (slide.props.__animation as Record<string, unknown>).internal === false)).toBe(true)
    expect(nextSlides[1].props.image).toBe('/files/old.png')
  })

  it('supports undo and redo for native property edits', () => {
    renderWorkspace()
    fireEvent.click(screen.getByRole('tab', { name: '内容' }))
    fireEvent.change(screen.getByLabelText('title'), { target: { value: '修改后的标题' } })
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    expect(useNativeDeckStore.getState().slides[0].props.title).toBe('议程')
    fireEvent.click(screen.getByRole('button', { name: '重做' }))
    expect(useNativeDeckStore.getState().slides[0].props.title).toBe('修改后的标题')
  })

  it('routes native projects to the HTML workspace from SlidePreview', async () => {
    vi.useRealTimers()
    previewMocks.store.currentProject = {
      id: 'project-1',
      project_id: 'project-1',
      render_mode: 'native',
      pages: [{
        page_id: 'page-1',
        order_index: 0,
        status: 'COMPLETED',
        outline_content: { title: '真实 HTML 页面', points: [] },
        native_layout: 'core01_cover',
        native_props: { kicker: '原生模式', title: '真实 HTML 页面', subtitle: '可编辑内容' },
      }],
    }
    const { SlidePreview } = await import('@/pages/SlidePreview')

    render(
      <MemoryRouter initialEntries={['/project/project-1/preview']}>
        <Routes>
          <Route path="/project/:projectId/preview" element={<SlidePreview />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => expect(screen.getByRole('main')).toHaveTextContent('真实 HTML 页面'))
    expect(screen.getByRole('complementary', { name: '属性栏' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: '内容' }))
    expect(screen.getByLabelText('title')).toHaveValue('真实 HTML 页面')
  }, 15000)

  it('offers narration video export from the native editor', () => {
    renderWorkspace()

    expect(screen.getByRole('option', { name: '讲解视频' })).toBeInTheDocument()
  })

  it('regenerates only the selected fallback page from the property panel', () => {
    const onGeneratePage = vi.fn()
    render(
      <NativeDeckWorkspace
        projectId="project-1"
        slides={[{ ...slides[0], props: { ...slides[0].props, __design_intent: { generation_fallback: true } } }]}
        layoutContracts={layoutContracts}
        singlePageGenerationAction={{ label: '生成本页', onClick: onGeneratePage }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '重新生成本页' }))
    expect(onGeneratePage).toHaveBeenCalledWith('page-1')
  })

  it('waits for an explicit batch action before generating missing images', async () => {
    vi.useRealTimers()
    renderWorkspace([{ ...slides[1], props: { ...slides[1].props, image: '' } }])

    expect(screen.queryByRole('dialog', { name: '图片生成设置' })).not.toBeInTheDocument()
    const imageButtons = screen.getAllByRole('button', { name: '批量生成图片' })
    expect(imageButtons).toHaveLength(1)
    expect(imageButtons.some((button) => button.className.includes('bg-gradient-to-r'))).toBe(false)
    expect(screen.getByRole('navigation', { name: '原生页面' })).not.toHaveTextContent('批量生成图片')

    fireEvent.click(screen.getByRole('button', { name: '项目设置' }))
    expect(screen.getByRole('dialog', { name: '图片生成设置' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存图片生成设置' }))

    await waitFor(() => expect(nativeApiMocks.updateProject).toHaveBeenCalled())
    expect(nativeApiMocks.generateMaterialImage).not.toHaveBeenCalled()
  })

  it('keeps click-triggered element animation visible while editing', () => {
    renderWorkspace()

    fireEvent.click(screen.getByRole('tab', { name: '动效' }))
    fireEvent.click(screen.getByText('页面动效'))
    fireEvent.change(screen.getByLabelText('元素逐项进入'), { target: { value: 'fade' } })
    fireEvent.change(screen.getByLabelText('元素触发方式'), { target: { value: 'click' } })

    expect(screen.getByRole('main')).toHaveTextContent('议程')
    expect(screen.getByRole('main')).toHaveTextContent('现状')
  })

  it('keeps page generation out of the top toolbar when image generation is available', () => {
    const { container } = render(
      <NativeDeckWorkspace
        projectId="project-1"
        slides={[{ ...slides[1], props: { ...slides[1].props, image: '' } }]}
        layoutContracts={layoutContracts}
        pageGenerationAction={{ label: '批量生成页面', onClick: vi.fn() }}
        autoSaveDelay={300}
      />,
    )

    const toolbar = container.querySelector('header')
    expect(toolbar).toBeInTheDocument()
    expect(toolbar).not.toHaveTextContent('批量生成页面')
    expect(toolbar).toHaveTextContent('批量生成图片')
    expect(screen.getByRole('button', { name: '批量生成页面' })).toBeInTheDocument()
  })

  it('uses the compact native toolbar and tracks PPTX export as a task', async () => {
    vi.useRealTimers()
    render(
      <NativeDeckWorkspace
        projectId="project-1"
        slides={slides.slice(0, 1)}
        layoutContracts={layoutContracts}
        autoSaveDelay={300}
        onBack={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: '更换模板' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '素材生成' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '上一步' })).not.toBeInTheDocument()

    const exportButton = screen.getByRole('button', { name: '导出PPTX' })
    expect(exportButton).toHaveClass('bg-gradient-to-r')

    fireEvent.click(exportButton)

    await waitFor(() => expect(exportTaskMocks.addTask).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      type: 'native-pptx',
      status: 'PROCESSING',
    })))
    await waitFor(() => expect(exportTaskMocks.addTask).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      taskId: 'native-pptx-task-1',
      type: 'native-pptx',
      status: 'PENDING',
    })))
    await waitFor(() => expect(nativeApiMocks.completeNativePptxExport).toHaveBeenCalledWith(
      'project-1',
      'native-pptx-task-1',
      expect.any(Blob),
      expect.any(Object),
      '议程.pptx',
    ))
  })

  it('extracts the document topic for native export filenames when slide titles are empty', async () => {
    vi.useRealTimers()
    previewMocks.store.currentProject = {
      id: 'project-1',
      idea_prompt: '生成一份关于人工智能基础的简短PPT，包含3页内容：什么是AI、AI的应用、AI的未来',
    }
    render(
      <NativeDeckWorkspace
        projectId="project-1"
        slides={[{ ...slides[0], props: { ...slides[0].props, title: '', titleTop: '' } }]}
        layoutContracts={layoutContracts}
        autoSaveDelay={300}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '导出PPTX' }))

    await waitFor(() => expect(nativeApiMocks.completeNativePptxExport).toHaveBeenCalledWith(
      'project-1',
      'native-pptx-task-1',
      expect.any(Blob),
      expect.any(Object),
      '人工智能基础.pptx',
    ))
  })

  it('does not mount hidden export frames while editing', () => {
    renderWorkspace()

    expect(document.getElementById('deck')).not.toBeInTheDocument()
  })

  it('renders native frames and starts a tracked narration video task', async () => {
    vi.useRealTimers()
    renderWorkspace(slides.slice(0, 1))
    fireEvent.change(screen.getByLabelText('导出格式'), { target: { value: '讲解视频' } })
    const exportButton = screen.getByRole('button', { name: '导出讲解视频' })
    fireEvent.click(exportButton)

    await waitFor(() => expect(nativeApiMocks.exportNativeVideo).toHaveBeenCalledWith(
      'project-1',
      expect.any(Array),
      ['page-1'],
      '议程.mp4',
    ))
    expect(exportTaskMocks.addTask).toHaveBeenCalledWith(expect.objectContaining({ type: 'video', taskId: 'video-task-1' }))
    expect(exportTaskMocks.pollTask).toHaveBeenCalledWith(expect.stringMatching(/^export-/), 'project-1', 'video-task-1')
    await waitFor(() => expect(exportButton).toBeEnabled())
  })
})
