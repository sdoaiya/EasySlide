import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { ArrowLeft, Download, Home, ListTodo, Maximize2, MonitorPlay, Redo2, RefreshCw, Settings2, Sparkles, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react'
import type { NativeSlideSpec } from '@/native-deck/types'
import { useNativeDeckStore } from '@/store/useNativeDeckStore'
import { useProjectStore } from '@/store/useProjectStore'
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell'
import { NativeDeckCanvas } from './NativeDeckCanvas'
import { NativeDeckPageRail } from './NativeDeckPageRail'
import { NativeDeckPropertyPanel, type NativeLayoutContract } from './NativeDeckPropertyPanel'
import { NativeDeckExportSurface } from './NativeDeckExportSurface'
import { exportNativeDeck } from '@/native-deck/exportNativeDeck'
import { exportNativeDeckHtml } from '@/native-deck/exportNativeDeckHtml'
import { exportNativeDeckPdf } from '@/native-deck/exportNativeDeckPdf'
import { captureNativeDeckFrames } from '@/native-deck/exportNativeDeckFrames'
import { migrateNativeProps } from '@/native-deck/nativeLayoutMigration'
import { useExportTasksStore, type ExportTask } from '@/store/useExportTasksStore'
import { addPage, completeNativePptxExport, createNativePptxExport, deletePage, exportNativeVideo, getNativePageVersions, getTaskStatus, restoreNativePageVersion, type NativePageVersion, updateNativePptxProgress, updatePagesOrder } from '@/api/endpoints'
import { ExportTasksPanel } from '@/components/shared/ExportTasksPanel'
import { MaterialSelector } from '@/components/shared/MaterialSelector'
import { NativeImageSettingsDialog } from './NativeImageSettingsDialog'
import { useNativeMediaGeneration } from './useNativeMediaGeneration'

export type NativeDeckWorkspaceProps = {
  projectId: string
  slides: NativeSlideSpec[]
  layoutContracts: readonly NativeLayoutContract[]
  pageGenerationAction?: { label: string; onClick: () => void }
  pageGenerationStatus?: { status: string; completed: number; failed: number; total: number; error?: string; onPause?: () => void; onResume?: () => void }
  singlePageGenerationAction?: { label: string; disabled?: boolean; onClick: (pageId: string) => void }
  autoSaveDelay?: number
  onBack?: () => void
  onHome?: () => void
}

function validate(slide: NativeSlideSpec, contract: NativeLayoutContract | undefined) {
  if (!contract) return { layout: `未找到布局契约：${slide.layout}` }
  const errors: Record<string, string> = {}
  for (const [key, shape] of Object.entries(contract.propShapes)) {
    const value = slide.props[key]
    if (shape === 'string') {
      const max = contract.copyBudgets?.[key]?.maxChars
      if (max && typeof value === 'string' && value.length > max) errors[key] = `${key} 最多 ${max} 个字符`
    } else if (shape === 'string[]') {
      const values = Array.isArray(value) ? value : []
      const limits = contract.arrayLimits?.[key]
      if (limits && (values.length < limits.min || values.length > limits.max)) errors[key] = `${key} 需要 ${limits.min}-${limits.max} 项`
      else if (limits && values.some((item) => typeof item !== 'string' || item.length > limits.itemMaxChars)) errors[key] = `${key} 单项最多 ${limits.itemMaxChars} 个字符`
    } else if (shape === 'media') {
      const required = contract.mediaSlots.find((slot) => slot.key === key)?.required
      if ((required || value) && (typeof value !== 'string' || !value.startsWith('/files/'))) errors[key] = `${key} 必须使用 /files/ 项目素材路径`
    }
  }
  return errors
}

export function NativeDeckWorkspace({ projectId, slides: initialSlides, layoutContracts, pageGenerationAction, pageGenerationStatus, singlePageGenerationAction, autoSaveDelay = 800, onBack, onHome }: NativeDeckWorkspaceProps) {
  const { slides, selectedPageId, dirtyPageIds, savePage } = useNativeDeckStore()
  const { currentProject, syncProject } = useProjectStore()
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const saveAttempts = useRef(new Map<string, number>())
  const historyPast = useRef<NativeSlideSpec[][]>([])
  const historyFuture = useRef<NativeSlideSpec[][]>([])
  const historyGroup = useRef<{ pageId: string; at: number }>({ pageId: '', at: 0 })
  const activeExportTaskIds = useRef(new Set<string>())
  const activeProjectId = useRef<string>()
  const [saveError, setSaveError] = useState('')
  const [showTasks, setShowTasks] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportSurfaceVisible, setExportSurfaceVisible] = useState(false)
  const [exportFormat, setExportFormat] = useState<'PPTX' | 'PDF' | '离线 HTML' | '讲解视频'>('PPTX')
  const [exportError, setExportError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [presenting, setPresenting] = useState(false)
  const [pageVersions, setPageVersions] = useState<NativePageVersion[]>([])
  const { addTask, updateTask, pollTask, tasks } = useExportTasksStore()
  const hydratedInitialSlides = useMemo(() => initialSlides.map((slide) => {
    const contract = layoutContracts.find((item) => item.layout === slide.layout)
    return contract ? { ...slide, props: hydrateNativeProps(contract, slide.props) } : slide
  }), [initialSlides, layoutContracts])
  const sourceKey = JSON.stringify(hydratedInitialSlides)

  useEffect(() => {
    if (activeProjectId.current !== projectId) {
      activeProjectId.current = projectId
      timers.current.forEach(clearTimeout)
      timers.current.clear()
      saveAttempts.current.clear()
      useNativeDeckStore.setState({ slides: hydratedInitialSlides, selectedPageId: hydratedInitialSlides[0]?.pageId ?? null, dirtyPageIds: new Set() })
      setSaveError('')
      return
    }
    useNativeDeckStore.setState((state) => {
      const local = new Map(state.slides.map((slide) => [slide.pageId, slide]))
      const slides = hydratedInitialSlides.map((serverSlide) => state.dirtyPageIds.has(serverSlide.pageId) ? local.get(serverSlide.pageId) || serverSlide : serverSlide)
      for (const slide of state.slides) {
        if (state.dirtyPageIds.has(slide.pageId) && !slides.some((item) => item.pageId === slide.pageId)) slides.push(slide)
      }
      const selectedPageId = slides.some((slide) => slide.pageId === state.selectedPageId) ? state.selectedPageId : slides[0]?.pageId ?? null
      return { slides, selectedPageId }
    })
  }, [hydratedInitialSlides, projectId, sourceKey])

  useEffect(() => () => {
    timers.current.forEach(clearTimeout)
    timers.current.clear()
  }, [])

  const selectedSlide = slides.find((slide) => slide.pageId === selectedPageId)
  const selectedIndex = Math.max(0, slides.findIndex((slide) => slide.pageId === selectedPageId))
  const contract = layoutContracts.find((item) => item.layout === selectedSlide?.layout)
  const errors = useMemo(() => selectedSlide ? validate(selectedSlide, contract) : {}, [contract, selectedSlide])

  const selectPage = (pageId: string) => useNativeDeckStore.setState({ selectedPageId: pageId })
  const loadPageVersions = async (pageId: string) => {
    const response = await getNativePageVersions(projectId, pageId)
    setPageVersions(response.data?.versions || [])
  }

  useEffect(() => {
    if (!selectedPageId) {
      setPageVersions([])
      return
    }
    void loadPageVersions(selectedPageId).catch(() => setPageVersions([]))
  }, [projectId, selectedPageId, sourceKey])

  const restorePageVersion = async (versionId: string) => {
    if (!selectedSlide || versionId === 'current') return
    try {
      const response = await restoreNativePageVersion(projectId, selectedSlide.pageId, versionId)
      const responseData = response.data as unknown as { native_layout?: string; native_props?: Record<string, unknown>; data?: { native_layout?: string; native_props?: Record<string, unknown> } }
      const page = responseData?.native_layout && responseData?.native_props ? responseData : responseData?.data
      if (!page?.native_layout || !page.native_props) throw new Error('版本恢复响应无效')

      // Sync the project first, then apply the returned page locally. This prevents
      // a stale project snapshot from overwriting the restored version.
      await syncProject(projectId)
      useNativeDeckStore.setState((state) => ({
        slides: state.slides.map((slide) => slide.pageId === selectedSlide.pageId ? { ...slide, layout: page.native_layout!, props: page.native_props!, pending: false } : slide),
        dirtyPageIds: new Set([...state.dirtyPageIds].filter((pageId) => pageId !== selectedSlide.pageId)),
      }))
      await loadPageVersions(selectedSlide.pageId)
      setSaveError('')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '版本切换失败，请重试')
    }
  }

  const startPresentation = async () => {
    setPresenting(true)
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.()
    } catch {
      // The in-app presentation layer remains available when system fullscreen is unavailable.
    }
  }

  const stopPresentation = async () => {
    setPresenting(false)
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.()
    } catch {
      // The in-app presentation layer has already been closed.
    }
  }
  const scheduleSave = (pageId: string, delay = autoSaveDelay) => {
    const pending = timers.current.get(pageId)
    if (pending) clearTimeout(pending)
    timers.current.set(pageId, setTimeout(() => {
      timers.current.delete(pageId)
      void savePage(projectId, pageId)
        .then(() => {
          saveAttempts.current.delete(pageId)
          setSaveError('')
        })
        .catch(() => {
          const attempt = (saveAttempts.current.get(pageId) || 0) + 1
          if (attempt >= 3) {
            saveAttempts.current.delete(pageId)
            setSaveError('自动保存失败，请检查网络后重试')
            return
          }
          saveAttempts.current.set(pageId, attempt)
          scheduleSave(pageId, attempt * 1000)
        })
    }, delay))
  }
  const queueSlideUpdate = (updated: NativeSlideSpec, recordHistory = true) => {
    const now = Date.now()
    const mergeHistory = recordHistory
      && historyGroup.current.pageId === updated.pageId
      && now - historyGroup.current.at < 500
    if (recordHistory && !mergeHistory) {
      const snapshot = structuredClone(useNativeDeckStore.getState().slides)
      historyPast.current = [...historyPast.current, snapshot].slice(-40)
      historyFuture.current = []
    }
    if (recordHistory) historyGroup.current = { pageId: updated.pageId, at: now }
    const updatedContract = layoutContracts.find((item) => item.layout === updated.layout)
    const nextErrors = validate(updated, updatedContract)
    useNativeDeckStore.setState((state) => ({
      slides: state.slides.map((slide) => slide.pageId === updated.pageId ? updated : slide),
      dirtyPageIds: new Set(state.dirtyPageIds).add(updated.pageId),
    }))
    setSaveError('')

    saveAttempts.current.delete(updated.pageId)
    if (Object.keys(nextErrors).length) return
    scheduleSave(updated.pageId)
  }
  const updateProps = (props: Record<string, unknown>) => {
    if (selectedSlide) queueSlideUpdate({ ...selectedSlide, props })
  }
  const restoreHistory = (source: MutableRefObject<NativeSlideSpec[][]>, destination: MutableRefObject<NativeSlideSpec[][]>) => {
    const target = source.current.pop()
    if (!target) return
    historyGroup.current = { pageId: '', at: 0 }
    destination.current.push(structuredClone(useNativeDeckStore.getState().slides))
    useNativeDeckStore.setState({ slides: structuredClone(target), dirtyPageIds: new Set(target.map((slide) => slide.pageId)) })
    setSaveError('')
    void Promise.all(target.map((slide) => savePage(projectId, slide.pageId))).catch(() => setSaveError('历史记录保存失败，请重试'))
  }
  const undo = () => restoreHistory(historyPast, historyFuture)
  const redo = () => restoreHistory(historyFuture, historyPast)
  const applyAnimationToAll = (animation: Record<string, unknown>) => {
    const currentSlides = useNativeDeckStore.getState().slides
    const snapshot = structuredClone(currentSlides)
    const previous = historyPast.current[historyPast.current.length - 1]
    if (!previous || JSON.stringify(previous) !== JSON.stringify(snapshot)) {
      historyPast.current = [...historyPast.current, snapshot].slice(-40)
    }
    historyFuture.current = []
    const updatedSlides = currentSlides.map((slide) => ({ ...slide, props: { ...slide.props, __animation: structuredClone(animation) } }))
    useNativeDeckStore.setState({
      slides: updatedSlides,
      dirtyPageIds: new Set(updatedSlides.map((slide) => slide.pageId)),
    })
    setSaveError('')
    void Promise.all(updatedSlides.map((slide) => savePage(projectId, slide.pageId))).catch(() => setSaveError('批量保存失败，请重试'))
  }
  const changeLayout = (layout: string) => {
    if (!selectedSlide) return
    const nextContract = layoutContracts.find((item) => item.layout === layout)
    if (!nextContract) return
    const props = contract ? migrateNativeProps(contract, nextContract, selectedSlide.props) : defaultPropsFor(nextContract, selectedSlide.props)
    queueSlideUpdate({ ...selectedSlide, layout, props })
  }
  const media = useNativeMediaGeneration({ projectId, slides, contracts: layoutContracts, onSlideUpdate: queueSlideUpdate })

  const createSlide = async (source?: NativeSlideSpec) => {
    const selectedIndex = Math.max(0, slides.findIndex((slide) => slide.pageId === selectedPageId))
    const insertIndex = slides.length ? selectedIndex + 1 : 0
    try {
      const response = await addPage(projectId, {
        order_index: insertIndex,
        outline_content: { title: source ? `${String(source.props.title || '页面')} 副本` : '新页面', points: [] },
      })
      const pageId = response.data?.page_id || response.data?.id
      if (!pageId) throw new Error('创建页面失败')
      const selectedContract = layoutContracts.find((item) => item.layout === selectedSlide?.layout)
      const fallbackContract = layoutContracts.find((item) => item.theme === selectedContract?.theme && !item.roles?.includes('cover'))
        || layoutContracts.find((item) => item.layout === 'theme01_page006')
        || layoutContracts.find((item) => item.layout === 'core01_agenda')
        || layoutContracts[0]
      const slide: NativeSlideSpec = source
        ? { pageId, layout: source.layout, props: structuredClone(source.props) }
        : { pageId, layout: fallbackContract.layout, props: defaultPropsFor(fallbackContract) }
      useNativeDeckStore.setState((state) => {
        const next = [...state.slides]
        next.splice(insertIndex, 0, slide)
        return { slides: next, selectedPageId: pageId, dirtyPageIds: new Set(state.dirtyPageIds).add(pageId) }
      })
      await savePage(projectId, pageId)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '创建页面失败')
    }
  }

  const removeSlide = async (pageId: string) => {
    if (slides.length <= 1) return
    const index = slides.findIndex((slide) => slide.pageId === pageId)
    try {
      await deletePage(projectId, pageId)
      const remaining = slides.filter((slide) => slide.pageId !== pageId)
      await updatePagesOrder(projectId, remaining.map((slide) => slide.pageId))
      useNativeDeckStore.setState({ slides: remaining, selectedPageId: remaining[Math.min(index, remaining.length - 1)].pageId })
    } catch {
      setSaveError('删除页面失败，请重试')
    }
  }

  const moveSlide = async (pageId: string, direction: -1 | 1) => {
    const index = slides.findIndex((slide) => slide.pageId === pageId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= slides.length) return
    const next = [...slides]
    ;[next[index], next[target]] = [next[target], next[index]]
    useNativeDeckStore.setState({ slides: next })
    try {
      await updatePagesOrder(projectId, next.map((slide) => slide.pageId))
    } catch {
      useNativeDeckStore.setState({ slides })
      setSaveError('页面排序保存失败，请重试')
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const typing = target instanceof Element && target.matches('input,textarea,select,[contenteditable="true"]')
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void Promise.all([...dirtyPageIds].map((pageId) => savePage(projectId, pageId))).catch(() => setSaveError('保存失败，请重试'))
      } else if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        undo()
      } else if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      } else if (!typing && !event.altKey && !event.ctrlKey && !event.metaKey && ['PageUp', 'PageDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', ' '].includes(event.key)) {
        event.preventDefault()
        const index = slides.findIndex((slide) => slide.pageId === selectedPageId)
        const next = event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? slides.length - 1
            : Math.max(0, Math.min(slides.length - 1, index + (event.key === 'PageDown' || event.key === 'ArrowRight' || event.key === ' ' ? 1 : -1)))
        if (slides[next]) selectPage(slides[next].pageId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dirtyPageIds, projectId, savePage, selectedPageId, slides, undo, redo])

  const exportTitle = useMemo(() => nativeExportTitle(currentProject, slides), [currentProject, slides])
  const saveStatus = exportError || saveError || (dirtyPageIds.size ? '未保存' : '已保存')
  const showExportSurface = async () => {
    setExportSurfaceVisible(true)
    await new Promise<void>((resolve) => {
      const nextFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0)
      nextFrame(() => resolve())
    })
  }

  const runExport = async (id: string, taskId: string, format: 'pptx' | 'pdf' | 'html' = 'pptx') => {
    if (exporting || activeExportTaskIds.current.has(taskId) || dirtyPageIds.size || !slides.length) return
    activeExportTaskIds.current.add(taskId)
    await showExportSurface()
    setExporting(true)
    setShowTasks(true)
    try {
      const filename = nativeExportFilename(exportTitle, format)
      if (format !== 'pptx') {
        const blob = format === 'pdf'
          ? await exportNativeDeckPdf({ title: exportTitle })
          : await exportNativeDeckHtml({ title: exportTitle, slides })
        const report = {
          slideCount: slides.length,
          textObjects: 0,
          shapeObjects: 0,
          imageObjects: 0,
          slideSummaries: slides.map((_, index) => ({ index: index + 1 })),
          warnings: [],
        }
        const completed = await completeNativePptxExport(projectId, taskId, blob, report, filename)
        const progress = completed.data?.progress as Record<string, unknown> | undefined
        updateTask(id, { status: 'COMPLETED', downloadUrl: progress?.download_url as string, filename, progress: progress as never })
        return
      }
      const result = await exportNativeDeck({
        title: exportTitle,
        onProgress: async (progress) => {
          const completed = Math.min(slides.length, Math.max(0, Math.floor((progress.percent / 100) * slides.length)))
          updateTask(id, { status: 'PROCESSING', progress: { total: slides.length, completed, percent: progress.percent, current_step: progress.detail } })
          await updateNativePptxProgress(projectId, taskId, { total: slides.length, completed, percent: progress.percent, current_step: progress.detail })
        },
        waitIfPaused: async () => {
          let current = await getTaskStatus(projectId, taskId)
          while (current.data?.status === 'PAUSED') {
            updateTask(id, { status: 'PAUSED' })
            await new Promise((resolve) => setTimeout(resolve, 500))
            current = await getTaskStatus(projectId, taskId)
          }
        },
      })
      const completed = await completeNativePptxExport(projectId, taskId, result.blob, result.report, filename)
      const completedTask = completed.data
      const progress = completedTask?.progress as Record<string, unknown> | undefined
      updateTask(id, {
        status: 'COMPLETED',
        downloadUrl: progress?.download_url as string | undefined,
        filename: progress?.filename as string | undefined,
        progress: progress as never,
      })
    } catch (error) {
      updateTask(id, { status: 'FAILED', errorMessage: error instanceof Error ? error.message : String(error) })
    } finally {
      activeExportTaskIds.current.delete(taskId)
      setExporting(false)
      setExportSurfaceVisible(false)
    }
  }

  const startExport = async (formatSelection = exportFormat) => {
    if (exporting || dirtyPageIds.size || !slides.length) return
    const id = `export-${Date.now()}`
    setExporting(true)
    setShowTasks(true)
    try {
      if (formatSelection === '讲解视频') {
        await showExportSurface()
        addTask({ id, taskId: '', projectId, type: 'video', status: 'PROCESSING', progress: { total: slides.length, completed: 0, percent: 1, current_step: '正在截取页面帧' } })
        const frames = await captureNativeDeckFrames()
        const created = await exportNativeVideo(projectId, frames, slides.map((slide) => slide.pageId), nativeExportFilename(exportTitle, 'mp4'))
        const taskId = created.data?.task_id
        if (!taskId) throw new Error('创建视频导出任务失败')
        addTask({ id, taskId, projectId, type: 'video', status: 'PENDING' })
        await pollTask(id, projectId, taskId)
        return
      }
      const format = formatSelection === 'PPTX' ? 'pptx' : formatSelection === 'PDF' ? 'pdf' : 'html'
      addTask({ id, taskId: '', projectId, type: `native-${format}`, status: 'PROCESSING', progress: { total: slides.length, completed: 0, percent: 1, current_step: '正在创建导出任务' } })
      const created = await createNativePptxExport(projectId, format)
      const task = created.data
      if (!task) throw new Error('创建导出任务失败')
      const taskId = task.task_id
      addTask({ id, taskId, projectId, type: `native-${format}`, status: 'PENDING' })
      setExporting(false)
      await runExport(id, taskId, format)
    } catch (error) {
      updateTask(id, { status: 'FAILED', errorMessage: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      setExporting(false)
      setExportSurfaceVisible(false)
    }
  }

  const exportSelectedFormat = async () => {
    setExportError('')
    try { await startExport() } catch (error) { setExportError(error instanceof Error ? error.message : String(error)) }
  }

  const retryExport = async (task: ExportTask) => {
    const format = task.type === 'native-pdf' ? 'PDF' : task.type === 'native-html' ? '离线 HTML' : task.type === 'video' ? '讲解视频' : 'PPTX'
    setExportFormat(format)
    setExportError('')
    try { await startExport(format) } catch (error) { setExportError(error instanceof Error ? error.message : String(error)) }
  }

  const pendingRestartTask = tasks.find((task) =>
    task.projectId === projectId && task.type.startsWith('native-') && task.status === 'PENDING',
  )

  useEffect(() => {
    if (pendingRestartTask && !exporting && !dirtyPageIds.size && slides.length) {
      const format = pendingRestartTask.type === 'native-pdf' ? 'pdf' : pendingRestartTask.type === 'native-html' ? 'html' : 'pptx'
      void runExport(pendingRestartTask.id, pendingRestartTask.taskId, format)
    }
  }, [pendingRestartTask?.taskId, slides.length, dirtyPageIds.size, exporting])

  return (
    <WorkspaceShell
      hideSidebarToggle
      hideStatusBar
      softBorders
      sidebarWidth="264px"
      toolbar={(
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {onHome && <button type="button" onClick={onHome} className="inline-flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold hover:bg-background-hover"><Home size={18} aria-hidden="true" />主页</button>}
            {onBack && <button type="button" onClick={onBack} className="inline-flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-semibold hover:bg-background-hover"><ArrowLeft size={18} aria-hidden="true" />返回</button>}
            <div className="hidden min-w-0 flex-col leading-tight md:flex">
              <div className="flex min-w-0 items-center gap-2">
                <strong className="truncate text-lg">预览</strong>
                <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">Step 3 · 视觉成稿</span>
              </div>
              <span className="truncate text-[11px] text-foreground-secondary">生成图片、预览并导出交付</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" aria-label="撤销" title="撤销" disabled={!historyPast.current.length} onClick={undo} className="hidden h-10 w-9 items-center justify-center rounded-lg hover:bg-background-hover disabled:opacity-30 md:inline-flex"><Undo2 size={17} aria-hidden="true" /></button>
            <button type="button" aria-label="重做" title="重做" disabled={!historyFuture.current.length} onClick={redo} className="hidden h-10 w-9 items-center justify-center rounded-lg hover:bg-background-hover disabled:opacity-30 md:inline-flex"><Redo2 size={17} aria-hidden="true" /></button>
            <button type="button" onClick={() => media.setSettingsOpen(true)} className="hidden h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-background-hover lg:inline-flex"><Settings2 size={17} />项目设置</button>
            {media.pages.length > 0 && (
              <button type="button" aria-label={media.running ? (media.paused ? '继续生成图片' : '暂停生成图片') : '批量生成图片'} title={media.remaining > 0 ? `批量生成 ${media.remaining} 张图片` : '没有待生成图片'} disabled={!media.running && media.remaining === 0} onClick={media.running ? (media.paused ? media.resume : media.pause) : media.start} className="hidden h-10 items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-45 lg:inline-flex"><Sparkles size={17} />{media.running ? (media.paused ? '继续生成图片' : '暂停生成图片') : '批量生成图片'}</button>
            )}
            <button type="button" onClick={() => window.location.reload()} className="hidden h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-background-hover md:inline-flex"><RefreshCw size={17} />刷新</button>
            <button type="button" aria-label={presenting ? '退出演示模式' : '演示模式'} title={presenting ? '退出演示模式' : '演示模式'} onClick={() => void (presenting ? stopPresentation() : startPresentation())} className="hidden h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-background-hover md:inline-flex"><MonitorPlay size={17} />{presenting ? '退出演示' : '演示'}</button>
            <div className="relative">
              <button type="button" aria-label="导出任务" title="导出任务" onClick={() => setShowTasks((value) => !value)} className="relative flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold hover:bg-background-hover">
                <ListTodo size={17} aria-hidden="true" />{tasks.filter((task) => task.projectId === projectId).length || 0}
              </button>
              {showTasks && <div className="absolute right-0 top-full z-50 mt-2 w-[min(380px,calc(100vw-2rem))]"><ExportTasksPanel projectId={projectId} onRetry={(task) => void retryExport(task)} /></div>}
            </div>
            <div className="hidden items-center gap-1 rounded-lg border border-slate-200 bg-white px-1 dark:border-border-primary dark:bg-background-secondary md:flex">
              <button type="button" aria-label="缩小画布" title="缩小画布" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} className="flex h-8 w-8 items-center justify-center rounded hover:bg-background-hover disabled:opacity-35"><ZoomOut size={15} /></button>
              <span className="w-12 text-center text-xs text-foreground-secondary">{Math.round(zoom * 100)}%</span>
              <button type="button" aria-label="放大画布" title="放大画布" disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, value + 0.1))} className="flex h-8 w-8 items-center justify-center rounded hover:bg-background-hover disabled:opacity-35"><ZoomIn size={15} /></button>
              <button type="button" aria-label="适应窗口" title="适应窗口" onClick={() => setZoom(1)} className="flex h-8 w-8 items-center justify-center rounded hover:bg-background-hover"><Maximize2 size={15} /></button>
            </div>
            <select aria-label="导出格式" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as typeof exportFormat)} className="hidden h-10 rounded-xl border border-border bg-background px-3 text-sm md:block">
              <option>PPTX</option><option>PDF</option><option>离线 HTML</option><option>讲解视频</option>
            </select>
            <button type="button" aria-label={`导出${exportFormat}`} title={dirtyPageIds.size ? '请等待页面保存完成' : `导出${exportFormat}`} disabled={exporting || Boolean(dirtyPageIds.size) || !slides.length} onClick={() => void exportSelectedFormat()} className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-400 px-5 text-sm font-semibold text-white shadow-md shadow-sky-200/70 disabled:cursor-not-allowed disabled:opacity-50">
              <Download size={18} aria-hidden="true" />{exporting ? '导出中' : '导出'}
            </button>
          </div>
        </div>
      )}
      sidebar={<NativeDeckPageRail slides={slides} selectedPageId={selectedPageId} onSelect={selectPage} onAdd={() => void createSlide()} onDuplicate={(pageId) => void createSlide(slides.find((slide) => slide.pageId === pageId))} onDelete={(pageId) => void removeSlide(pageId)} onMove={(pageId, direction) => void moveSlide(pageId, direction)} pageAction={pageGenerationAction} pageGenerationAction={singlePageGenerationAction || (media.pages.length > 0 ? { label: '生成本页', disabled: media.running, onClick: media.runPage } : undefined)} />}
      inspector={<NativeDeckPropertyPanel slide={selectedSlide} contract={contract} contracts={layoutContracts} errors={errors} onChange={updateProps} onLayoutChange={changeLayout} onRegenerate={selectedSlide && singlePageGenerationAction ? () => singlePageGenerationAction.onClick(selectedSlide.pageId) : undefined} versions={pageVersions} onRestoreVersion={(versionId) => void restorePageVersion(versionId)} onApplyAnimation={applyAnimationToAll} mediaActions={media.mediaActions} />}
    >
      <div className="relative flex h-full min-w-0 flex-col">
        <span className="sr-only" role="status" aria-live="polite">{saveStatus}</span>
        <div className="min-h-0 flex-1">
          <NativeDeckCanvas
            slide={selectedSlide}
            zoom={zoom}
            pageIndex={selectedIndex}
            pageCount={slides.length}
            onPrevious={() => slides[selectedIndex - 1] && selectPage(slides[selectedIndex - 1].pageId)}
            onNext={() => slides[selectedIndex + 1] && selectPage(slides[selectedIndex + 1].pageId)}
            presenting={false}
            emptyAction={pageGenerationAction}
            generationStatus={pageGenerationStatus}
            onPropsChange={updateProps}
            mediaContract={contract}
            onMediaSelect={media.mediaActions.onSelect}
            onMediaUpload={media.mediaActions.onUpload}
          />
        </div>
      </div>
      {exportSurfaceVisible && <NativeDeckExportSurface slides={slides} />}
      {presenting && selectedSlide && <div role="dialog" aria-label="演示模式" className="fixed inset-0 z-[100] bg-[#eef7fb]">
        <button type="button" aria-label="退出演示模式" title="退出演示" onClick={() => void stopPresentation()} className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-lg bg-black/50 text-white hover:bg-black/70"><X size={20} /></button>
        <NativeDeckCanvas slide={selectedSlide} pageIndex={selectedIndex} pageCount={slides.length} onPrevious={() => slides[selectedIndex - 1] && selectPage(slides[selectedIndex - 1].pageId)} onNext={() => slides[selectedIndex + 1] && selectPage(slides[selectedIndex + 1].pageId)} presenting mediaContract={contract} />
      </div>}
      <NativeImageSettingsDialog open={media.settingsOpen} settings={media.settings} pages={media.pages} saving={media.savingSettings} onClose={() => media.setSettingsOpen(false)} onSave={(settings) => void media.saveSettings(settings)} />
      <MaterialSelector projectId={projectId} isOpen={Boolean(media.selectedSlot)} multiple={false} maxSelection={1} onClose={media.closeSelector} onSelect={(materials) => { if (materials[0]) media.useSelectedMaterial(materials[0].url) }} />
    </WorkspaceShell>
  )
}

function nativeExportTitle(project: { project_title?: string; idea_prompt?: string } | null | undefined, slides: NativeSlideSpec[]) {
  const firstSlideTitle = firstText(slides[0]?.props.title) || firstText(slides[0]?.props.titleTop)
  const meaningfulSlideTitle = isGenericNativeTitle(firstSlideTitle) ? '' : firstSlideTitle
  return firstText(project?.project_title) || meaningfulSlideTitle || titleFromPrompt(project?.idea_prompt) || 'EasySlide'
}

function firstText(value: unknown) {
  return typeof value === 'string' ? value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''
}

function titleFromPrompt(value: unknown) {
  let title = firstText(value).split(/[，,。；;：:]/, 1)[0]?.trim() || ''
  title = title
    .replace(/^(?:请|帮我|帮忙|麻烦)?(?:生成|创建|制作|做|设计|输出|写)(?:一份|一个|一套|份|个|套)?/, '')
    .replace(/^(?:关于|有关|围绕)/, '')
    .replace(/(?:的(?:简短|完整|详细|中文|英文|商务|演讲|汇报|路演|展示|介绍|分析|主题|项目|方案)?)?\s*(?:PPT|ppt|演示文稿|幻灯片)$/, '')
    .trim()
  return title
}

function isGenericNativeTitle(title: string) {
  return ['新页面', 'Untitled', 'New Page'].includes(title)
}

function nativeExportFilename(title: string, extension: string) {
  const stem = Array.from(title).map((char) => {
    if (/[\p{L}\p{N}]/u.test(char) || '-_.()（）[]【】'.includes(char)) return char
    return /\s/.test(char) ? '_' : '_'
  }).join('').replace(/_+/g, '_').replace(/^[._-]+|[._-]+$/g, '').slice(0, 80) || 'EasySlide'
  return `${stem}.${extension}`
}

function defaultPropsFor(contract: NativeLayoutContract, existing: Record<string, unknown> = {}) {
  if (contract.defaultProps) return structuredClone(contract.defaultProps)
  return Object.fromEntries(Object.entries(contract.propShapes).map(([key, shape]) => {
    if (shape === 'string[]') {
      const min = contract.arrayLimits?.[key]?.min ?? 0
      return [key, Array.isArray(existing[key]) ? existing[key] : Array.from({ length: min }, (_, index) => `${key === 'steps' ? '步骤' : '项目'} ${index + 1}`)]
    }
    return [key, typeof existing[key] === 'string' ? existing[key] : key === 'title' ? '新页面' : '']
  }))
}

function hydrateNativeProps(contract: NativeLayoutContract, props: Record<string, unknown>) {
  const defaults = defaultPropsFor(contract)
  const hydrated = { ...defaults, ...props }
  for (const [key, value] of Object.entries(props)) {
    if (isEmptyNativeValue(value) && defaults[key] !== undefined) hydrated[key] = structuredClone(defaults[key])
  }
  return hydrated
}

function isEmptyNativeValue(value: unknown) {
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return value === null || value === undefined
}
