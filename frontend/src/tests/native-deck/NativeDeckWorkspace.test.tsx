import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  handoffVideoWorkspaceFrames: vi.fn(),
  createNativeSceneManifestRefs: vi.fn(),
  preflightExportVideo: vi.fn(),
  getFishAudioVoices: vi.fn(),
  getProjectNarrations: vi.fn(),
  getFishAudioCapabilities: vi.fn(),
  previewFishNarration: vi.fn(),
  generateMaterialImage: vi.fn(),
  updateProject: vi.fn(),
  getNativePageVersions: vi.fn(),
  restoreNativePageVersion: vi.fn(),
}))

const exportTaskMocks = vi.hoisted(() => ({
  addTask: vi.fn(),
  updateTask: vi.fn(),
  pollTask: vi.fn(),
  loadTasks: vi.fn(),
  removeTask: vi.fn(),
  clearCompleted: vi.fn(),
  pauseTask: vi.fn(),
  resumeTask: vi.fn(),
  cancelTask: vi.fn(),
  retryTask: vi.fn(),
  loadMoreTasks: vi.fn(),
}))

const taskStatusMocks = vi.hoisted(() => ({ getTaskStatus: vi.fn() }))

const frameMocks = vi.hoisted(() => ({ capture: vi.fn(), captureManifests: vi.fn() }))
const sceneBundleMocks = vi.hoisted(() => ({ capture: vi.fn() }))
const exportMocks = vi.hoisted(() => ({
  exportNativeDeck: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  apiClient: { put: vi.fn(), get: vi.fn() },
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
  captureNativeDeckFrameSequences: frameMocks.capture,
  captureNativeSceneManifests: frameMocks.captureManifests,
}))

vi.mock('@/native-deck/exportNativeMotionBundle', () => ({
  captureNativeMotionBundles: sceneBundleMocks.capture,
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
  getTaskStatus: taskStatusMocks.getTaskStatus,
  generateMaterialImage: nativeApiMocks.generateMaterialImage,
  updateNativePptxProgress: vi.fn(),
  getSettings: vi.fn().mockResolvedValue({ data: { fish_audio_voice_assets: [] } }),
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
  handoffVideoWorkspaceFrames: nativeApiMocks.handoffVideoWorkspaceFrames,
  createNativeSceneManifestRefs: nativeApiMocks.createNativeSceneManifestRefs,
  preflightExportVideo: nativeApiMocks.preflightExportVideo,
  getFishAudioVoices: nativeApiMocks.getFishAudioVoices,
  getProjectNarrations: nativeApiMocks.getProjectNarrations,
  getFishAudioCapabilities: nativeApiMocks.getFishAudioCapabilities,
  previewFishNarration: nativeApiMocks.previewFishNarration,
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
    nativeApiMocks.handoffVideoWorkspaceFrames.mockReset().mockResolvedValue({ data: { attached: true } })
    frameMocks.captureManifests.mockReset().mockImplementation((items: NativeSlideSpec[]) => items.map((slide) => ({ page_id: slide.pageId })))
    nativeApiMocks.createNativeSceneManifestRefs.mockReset().mockImplementation(async (items: Array<{ page_id: string }>) => items.map((item) => ({ page_id: item.page_id, sha256: item.page_id.padEnd(64, '0') })))
    sceneBundleMocks.capture.mockReset().mockImplementation(async (_items: NativeSlideSpec[], refs: Array<{ page_id: string; sha256: string }>) => refs.map((ref) => ({ page_id: ref.page_id, scene_manifest_sha256: ref.sha256 })))
    nativeApiMocks.preflightExportVideo.mockReset().mockResolvedValue({ data: { can_export: true, errors: [], warnings: [] } })
    nativeApiMocks.getFishAudioVoices.mockReset().mockResolvedValue({
      data: {
        voices: [
          { id: 'fish-host', title: '品牌主讲人', state: 'trained', languages: ['zh'], visibility: 'private' },
          { id: 'fish-expert', title: '产品专家', state: 'trained', languages: ['zh'], visibility: 'private' },
          { id: 'fish-guest', title: '客户嘉宾', state: 'trained', languages: ['zh'], visibility: 'private' },
        ],
      },
    })
    vi.mocked(apiClient.get).mockReset().mockResolvedValue({
      data: {
        data: {
          voices: [
            { voice_id: 'edge:zh-CN-XiaoxiaoNeural', provider: 'edge', upstream_id: 'zh-CN-XiaoxiaoNeural', name: '晓晓（中文女声）', languages: ['zh-CN'] },
            { voice_id: 'edge:zh-CN-YunxiNeural', provider: 'edge', upstream_id: 'zh-CN-YunxiNeural', name: '云希（中文男声）', languages: ['zh-CN'] },
            { voice_id: 'fish:fish-host', provider: 'fish_audio', upstream_id: 'fish-host', name: '品牌主讲人', languages: ['zh'] },
            { voice_id: 'fish:fish-expert', provider: 'fish_audio', upstream_id: 'fish-expert', name: '产品专家', languages: ['zh'] },
            { voice_id: 'fish:fish-guest', provider: 'fish_audio', upstream_id: 'fish-guest', name: '客户嘉宾', languages: ['zh'] },
          ],
        },
      },
    })
    nativeApiMocks.getProjectNarrations.mockReset().mockResolvedValue({
      data: {
        pages: slides.map((slide, index) => ({
          page_id: slide.pageId,
          order_index: index,
          current_version_id: `narration-${index + 1}`,
          locked: false,
          revision: 1,
          word_count: 20,
          estimated_seconds: 8,
          candidate_count: 0,
        })),
        total_pages: slides.length,
        confirmed_pages: slides.length,
        missing_pages: 0,
        candidate_pages: 0,
      },
    })
    nativeApiMocks.getFishAudioCapabilities.mockReset().mockResolvedValue({
      data: { voice_design: { supported: false, reason: '当前免费模型未确认 Voice Design 官方 API 契约' } },
    })
    nativeApiMocks.previewFishNarration.mockReset().mockResolvedValue(new Blob(['preview'], { type: 'audio/mpeg' }))
    nativeApiMocks.generateMaterialImage.mockReset()
    taskStatusMocks.getTaskStatus.mockReset()
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

    const pageRail = screen.getByRole('complementary', { name: '页面栏' })
    expect(pageRail).toBeInTheDocument()
    expect(pageRail.innerHTML).not.toContain('shadow-sm')
    expect(screen.getByText('Step 3 · 视觉成稿')).not.toHaveClass('rounded-full')
    expect(screen.getByText('Step 3 · 视觉成稿')).toHaveClass('rounded-[var(--app-radius-control)]')
    expect(screen.getByRole('main')).toHaveTextContent('议程')
    expect(screen.getByRole('complementary', { name: '属性栏' })).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toHaveTextContent('已保存')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('原生可编辑模式')
    const sidebarToggle = screen.getByRole('button', { name: '收起页面栏' })
    expect(sidebarToggle).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: '页面栏' })).toHaveAttribute('data-collapsed', 'false')
    fireEvent.click(sidebarToggle)
    expect(screen.getByRole('complementary', { name: '页面栏' })).toHaveAttribute('data-collapsed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '展开页面栏' }))
    expect(screen.getByRole('button', { name: '收起属性栏' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '第 2 页：客户案例' }))

    expect(useNativeDeckStore.getState().selectedPageId).toBe('page-2')
    fireEvent.click(screen.getByRole('tab', { name: '图片' }))
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
    const originalRequestFullscreen = Object.getOwnPropertyDescriptor(document.documentElement, 'requestFullscreen')
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: requestFullscreen })

    try {
      renderWorkspace()

      fireEvent.click(screen.getByRole('button', { name: '演示模式' }))

      const presentation = screen.getByRole('dialog', { name: '演示模式' })
      expect(presentation).toHaveClass('fixed', 'inset-0')
      const closeButton = presentation.querySelector('button[aria-label="退出演示模式"]')
      expect(closeButton).toBeInTheDocument()
      expect(closeButton).not.toHaveClass('bg-black/50')
      expect(closeButton).toHaveClass('bg-[color:var(--app-surface)]/85')
      expect(presentation.closest('.workspace-shell')).toHaveAttribute('data-presenting', 'true')
      expect(requestFullscreen).toHaveBeenCalledOnce()
    } finally {
      if (originalRequestFullscreen) Object.defineProperty(document.documentElement, 'requestFullscreen', originalRequestFullscreen)
      else Reflect.deleteProperty(document.documentElement, 'requestFullscreen')
    }
  })

  it('closes the presentation overlay when browser fullscreen is exited externally', () => {
    const originalFullscreenElement = Object.getOwnPropertyDescriptor(document, 'fullscreenElement')
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement })

    try {
      renderWorkspace()
      fireEvent.click(screen.getByRole('button', { name: '演示模式' }))
      expect(screen.getByRole('dialog', { name: '演示模式' })).toBeInTheDocument()

      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
      fireEvent(document, new Event('fullscreenchange'))

      expect(screen.queryByRole('dialog', { name: '演示模式' })).not.toBeInTheDocument()
    } finally {
      if (originalFullscreenElement) Object.defineProperty(document, 'fullscreenElement', originalFullscreenElement)
      else Reflect.deleteProperty(document, 'fullscreenElement')
    }
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
    fireEvent.click(screen.getByRole('tab', { name: '图片' }))

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
    fireEvent.click(screen.getByRole('tab', { name: '内容' }))
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

    fireEvent.click(screen.getByRole('tab', { name: '设计' }))
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
    const imageButtons = screen.getAllByRole('button', { name: '批量生成' })
    expect(imageButtons).toHaveLength(1)
    expect(imageButtons.some((button) => button.className.includes('bg-gradient-to-r'))).toBe(false)
    expect(screen.getByRole('navigation', { name: '原生页面' })).not.toHaveTextContent('批量生成')

    fireEvent.click(screen.getByRole('button', { name: '项目设置' }))
    expect(screen.getByRole('dialog', { name: '图片生成设置' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '保存图片生成设置' }))

    await waitFor(() => expect(nativeApiMocks.updateProject).toHaveBeenCalled())
    expect(nativeApiMocks.generateMaterialImage).not.toHaveBeenCalled()
  })

  it('runs the batch media generation to completion when clicking 批量生成', async () => {
    vi.useRealTimers()
    nativeApiMocks.generateMaterialImage.mockResolvedValue({ data: { task_id: 'mat-task-1', status: 'PENDING' } })
    taskStatusMocks.getTaskStatus.mockResolvedValue({
      data: { status: 'COMPLETED', progress: { total: 1, completed: 1, image_url: '/files/project-1/materials/gen.webp' } },
    })
    renderWorkspace([{ ...slides[1], props: { ...slides[1].props, image: '' } }])

    const batchButton = screen.getByRole('button', { name: '批量生成' })
    expect(batchButton).toBeEnabled()
    fireEvent.click(batchButton)

    await waitFor(() => expect(nativeApiMocks.generateMaterialImage).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(taskStatusMocks.getTaskStatus).toHaveBeenCalledWith('project-1', 'mat-task-1'))

    const updated = useNativeDeckStore.getState().slides.find((slide) => slide.pageId === 'page-2')
    expect(updated?.props.image).toBe('/files/project-1/materials/gen.webp')
  })

  it('keeps click-triggered element animation visible while editing', () => {
    renderWorkspace()

    fireEvent.click(screen.getByRole('tab', { name: '设计' }))
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
    expect(toolbar).toHaveTextContent('批量生成')
    const pageAction = screen.getByRole('button', { name: '批量生成页面' })
    expect(pageAction).toBeInTheDocument()
    expect(pageAction).toHaveClass('bg-[var(--app-primary-action)]')
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
    expect(exportButton).toHaveClass('bg-[var(--app-primary-action)]')
    expect(exportButton).not.toHaveClass('bg-[var(--app-accent)]')
    expect(exportButton).not.toHaveClass('bg-gradient-to-r')

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

  it('shows the native export task list above the workspace', () => {
    renderWorkspace()

    fireEvent.click(screen.getByRole('button', { name: '导出任务' }))
    expect(screen.getByTestId('native-export-task-popover')).toHaveClass('fixed', 'z-[120]')
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
    const dialog = await screen.findByRole('dialog', { name: '讲解视频设置' })
    expect(dialog).toBeInTheDocument()
    expect(dialog.parentElement).not.toHaveClass('bg-black/35')
    expect(dialog.parentElement).toHaveClass('bg-[color:var(--app-surface)]/80')
    fireEvent.click(screen.getByRole('button', { name: '培训课程' }))
    fireEvent.click(screen.getByRole('button', { name: '开始导出视频' }))

    await waitFor(() => expect(nativeApiMocks.exportNativeVideo).toHaveBeenCalledWith(
      'project-1',
      expect.any(Array),
      ['page-1'],
      '议程.mp4',
      { preset: 'training', motion_intensity: 'standard', subtitle_mode: 'highlight', transition: 'fade', page_pause_ms: 340 },
      expect.objectContaining({
        ttsProvider: 'edge',
        voice: 'zh-CN-XiaoxiaoNeural',
        rate: '+0%',
        speed: 1,
        language: 'zh',
        generateNarration: false,
        narrationPolicy: 'confirmed_only',
        narrationVersionMap: { 'page-1': 'narration-1' },
        narrationMode: 'single',
        speakers: undefined,
        autoEmotion: true,
      }),
      [expect.objectContaining({ page_id: 'page-1' })],
      [expect.objectContaining({ page_id: 'page-1', scene_manifest_sha256: expect.any(String) })],
    ))
    expect(frameMocks.captureManifests.mock.invocationCallOrder[0]).toBeLessThan(sceneBundleMocks.capture.mock.invocationCallOrder[0])
    expect(sceneBundleMocks.capture).toHaveBeenCalledWith(
      [expect.objectContaining({ pageId: 'page-1' })],
      [expect.objectContaining({ page_id: 'page-1', sha256: expect.any(String) })],
    )
    expect(nativeApiMocks.handoffVideoWorkspaceFrames).toHaveBeenCalledWith(
      'project-1',
      expect.any(Array),
      ['page-1'],
    )
    expect(exportTaskMocks.addTask).toHaveBeenCalledWith(expect.objectContaining({ type: 'video', taskId: 'video-task-1' }))
    expect(exportTaskMocks.pollTask).toHaveBeenCalledWith(expect.stringMatching(/^export-/), 'project-1', 'video-task-1')
    await waitFor(() => expect(exportButton).toBeEnabled())
  })

  it('switches to Fish voices and exports a three-person expressive narration', async () => {
    vi.useRealTimers()
    renderWorkspace(slides.slice(0, 1))
    fireEvent.change(screen.getByLabelText('导出格式'), { target: { value: '讲解视频' } })
    fireEvent.click(screen.getByRole('button', { name: '导出讲解视频' }))
    await screen.findByRole('dialog', { name: '讲解视频设置' })

    // 旁白模式在首屏直接可见（不再藏在高级设置里）
    fireEvent.click(screen.getByRole('radio', { name: '多人对话' }))

    const openVoicePicker = (row: HTMLElement) => {
      const trigger = within(row).getAllByRole('button').find((button) => button.getAttribute('aria-haspopup') === 'listbox')
      expect(trigger).toBeTruthy()
      fireEvent.click(trigger!)
    }

    // 主持人切到 Fish 声音：声音决定引擎，其他角色跟随切到同引擎
    const hostRow = screen.getByLabelText('角色 1 名称').closest('div.grid') as HTMLElement
    openVoicePicker(hostRow)
    fireEvent.click(await screen.findByText('品牌主讲人'))

    // 专家与新增嘉宾分别选择 Fish 声音
    const expertRow = screen.getByLabelText('角色 2 名称').closest('div.grid') as HTMLElement
    openVoicePicker(expertRow)
    fireEvent.click(await screen.findByText('产品专家'))

    fireEvent.click(screen.getByRole('button', { name: '添加角色' }))
    const guestRow = screen.getByLabelText('角色 3 名称').closest('div.grid') as HTMLElement
    openVoicePicker(guestRow)
    fireEvent.click(await screen.findByText('客户嘉宾'))

    fireEvent.click(screen.getByLabelText('场景自动匹配语气'))
    fireEvent.click(screen.getByRole('button', { name: '开始导出视频' }))

    await waitFor(() => expect(nativeApiMocks.exportNativeVideo).toHaveBeenCalledWith(
      'project-1',
      expect.any(Array),
      ['page-1'],
      '议程.mp4',
      { preset: 'business', motion_intensity: 'subtle', subtitle_mode: 'highlight', transition: 'fade', page_pause_ms: 260 },
      expect.objectContaining({
        ttsProvider: 'fish_audio',
        voice: 'fish-host',
        rate: '+0%',
        speed: 1,
        language: 'zh',
        generateNarration: false,
        narrationPolicy: 'confirmed_only',
        narrationVersionMap: { 'page-1': 'narration-1' },
        narrationMode: 'dialogue',
        speakers: [
          { id: 'host', name: '主持人', voice: 'fish-host', rate: '+0%' },
          { id: 'expert', name: '专家', voice: 'fish-expert', rate: '+0%' },
          { id: 'guest_3', name: '嘉宾 3', voice: 'fish-guest', rate: '+0%' },
        ],
        autoEmotion: false,
      }),
      [expect.objectContaining({ page_id: 'page-1' })],
      [expect.objectContaining({ page_id: 'page-1', scene_manifest_sha256: expect.any(String) })],
    ))
    expect(nativeApiMocks.preflightExportVideo).toHaveBeenCalledWith('project-1', expect.objectContaining({
      ttsProvider: 'fish_audio',
      narrationMode: 'dialogue',
      speakers: expect.arrayContaining([expect.objectContaining({ voice: 'fish-host' })]),
    }))
  })
})
