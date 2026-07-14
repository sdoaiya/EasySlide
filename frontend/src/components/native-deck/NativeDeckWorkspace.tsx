import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, Home, ListTodo, Maximize2, RefreshCw, Settings2, ZoomIn, ZoomOut } from 'lucide-react'
import type { NativeSlideSpec } from '@/native-deck/types'
import { useNativeDeckStore } from '@/store/useNativeDeckStore'
import { useProjectStore } from '@/store/useProjectStore'
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell'
import { WorkspaceStatusBar } from '@/components/workspace/WorkspaceStatusBar'
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
import { addPage, completeNativePptxExport, createNativePptxExport, deletePage, exportNativeVideo, getTaskStatus, updateNativePptxProgress, updatePagesOrder } from '@/api/endpoints'
import { ExportTasksPanel } from '@/components/shared/ExportTasksPanel'
import { MaterialSelector } from '@/components/shared/MaterialSelector'
import { NativeImageSettingsDialog } from './NativeImageSettingsDialog'
import { useNativeMediaGeneration } from './useNativeMediaGeneration'

export type NativeDeckWorkspaceProps = {
  projectId: string
  slides: NativeSlideSpec[]
  layoutContracts: readonly NativeLayoutContract[]
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

export function NativeDeckWorkspace({ projectId, slides: initialSlides, layoutContracts, autoSaveDelay = 800, onBack, onHome }: NativeDeckWorkspaceProps) {
  const { slides, selectedPageId, dirtyPageIds, savePage } = useNativeDeckStore()
  const { currentProject } = useProjectStore()
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const activeExportTaskIds = useRef(new Set<string>())
  const activeProjectId = useRef<string>()
  const [saveError, setSaveError] = useState('')
  const [showTasks, setShowTasks] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportSurfaceVisible, setExportSurfaceVisible] = useState(false)
  const [exportFormat, setExportFormat] = useState<'PPTX' | 'PDF' | '离线 HTML' | '讲解视频'>('PPTX')
  const [exportError, setExportError] = useState('')
  const [zoom, setZoom] = useState(1)
  const { addTask, updateTask, pollTask, tasks } = useExportTasksStore()
  const sourceKey = JSON.stringify(initialSlides)

  useEffect(() => {
    if (activeProjectId.current !== projectId) {
      activeProjectId.current = projectId
      timers.current.forEach(clearTimeout)
      timers.current.clear()
      useNativeDeckStore.setState({ slides: initialSlides, selectedPageId: initialSlides[0]?.pageId ?? null, dirtyPageIds: new Set() })
      setSaveError('')
      return
    }
    useNativeDeckStore.setState((state) => {
      const local = new Map(state.slides.map((slide) => [slide.pageId, slide]))
      const slides = initialSlides.map((serverSlide) => state.dirtyPageIds.has(serverSlide.pageId) ? local.get(serverSlide.pageId) || serverSlide : serverSlide)
      for (const slide of state.slides) {
        if (state.dirtyPageIds.has(slide.pageId) && !slides.some((item) => item.pageId === slide.pageId)) slides.push(slide)
      }
      const selectedPageId = slides.some((slide) => slide.pageId === state.selectedPageId) ? state.selectedPageId : slides[0]?.pageId ?? null
      return { slides, selectedPageId }
    })
  }, [projectId, sourceKey])

  useEffect(() => () => {
    timers.current.forEach(clearTimeout)
    timers.current.clear()
  }, [])

  const selectedSlide = slides.find((slide) => slide.pageId === selectedPageId)
  const selectedIndex = Math.max(0, slides.findIndex((slide) => slide.pageId === selectedPageId))
  const contract = layoutContracts.find((item) => item.layout === selectedSlide?.layout)
  const errors = useMemo(() => selectedSlide ? validate(selectedSlide, contract) : {}, [contract, selectedSlide])

  const selectPage = (pageId: string) => useNativeDeckStore.setState({ selectedPageId: pageId })
  const queueSlideUpdate = (updated: NativeSlideSpec) => {
    const updatedContract = layoutContracts.find((item) => item.layout === updated.layout)
    const nextErrors = validate(updated, updatedContract)
    useNativeDeckStore.setState((state) => ({
      slides: state.slides.map((slide) => slide.pageId === updated.pageId ? updated : slide),
      dirtyPageIds: new Set(state.dirtyPageIds).add(updated.pageId),
    }))
    setSaveError('')

    const pending = timers.current.get(updated.pageId)
    if (pending) clearTimeout(pending)
    if (Object.keys(nextErrors).length) return
    timers.current.set(updated.pageId, setTimeout(() => {
      timers.current.delete(updated.pageId)
      void savePage(projectId, updated.pageId).catch(() => setSaveError('自动保存失败，请检查网络后重试'))
    }, autoSaveDelay))
  }
  const updateProps = (props: Record<string, unknown>) => {
    if (selectedSlide) queueSlideUpdate({ ...selectedSlide, props })
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
      } else if (!typing && (event.key === 'PageUp' || event.key === 'PageDown')) {
        event.preventDefault()
        const index = slides.findIndex((slide) => slide.pageId === selectedPageId)
        const next = Math.max(0, Math.min(slides.length - 1, index + (event.key === 'PageDown' ? 1 : -1)))
        if (slides[next]) selectPage(slides[next].pageId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dirtyPageIds, projectId, savePage, selectedPageId, slides])

  const status = exportError || saveError || (dirtyPageIds.size ? '未保存' : '已保存')
  const exportTitle = useMemo(() => nativeExportTitle(currentProject, slides), [currentProject, slides])
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
          : exportNativeDeckHtml({ title: exportTitle, slides })
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
      hidePanelToggles
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
            <button type="button" onClick={() => media.setSettingsOpen(true)} className="hidden h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-background-hover lg:inline-flex"><Settings2 size={17} />项目设置</button>
            <button type="button" onClick={() => window.location.reload()} className="hidden h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-background-hover md:inline-flex"><RefreshCw size={17} />刷新</button>
            <button type="button" aria-label="导出任务" title="导出任务" onClick={() => setShowTasks((value) => !value)} className="relative flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold hover:bg-background-hover">
              <ListTodo size={17} aria-hidden="true" />{tasks.filter((task) => task.projectId === projectId).length || 0}
            </button>
            <select aria-label="导出格式" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as typeof exportFormat)} className="hidden h-10 rounded-xl border border-border bg-background px-3 text-sm md:block">
              <option>PPTX</option><option>PDF</option><option>离线 HTML</option><option>讲解视频</option>
            </select>
            <button type="button" aria-label={`导出${exportFormat}`} title={dirtyPageIds.size ? '请等待页面保存完成' : `导出${exportFormat}`} disabled={exporting || Boolean(dirtyPageIds.size) || !slides.length} onClick={() => void exportSelectedFormat()} className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-400 px-5 text-sm font-semibold text-white shadow-md shadow-sky-200/70 disabled:cursor-not-allowed disabled:opacity-50">
              <Download size={18} aria-hidden="true" />{exporting ? '导出中' : '导出'}
            </button>
          </div>
        </div>
      )}
      sidebar={<NativeDeckPageRail slides={slides} selectedPageId={selectedPageId} onSelect={selectPage} onAdd={() => void createSlide()} onDuplicate={(pageId) => void createSlide(slides.find((slide) => slide.pageId === pageId))} onDelete={(pageId) => void removeSlide(pageId)} onMove={(pageId, direction) => void moveSlide(pageId, direction)} imageAction={media.remaining > 0 ? { label: '批量生成', disabled: media.running, onClick: media.start } : media.running ? { label: '生成中', disabled: true, onClick: media.pause } : undefined} />}
      inspector={<NativeDeckPropertyPanel slide={selectedSlide} contract={contract} contracts={layoutContracts} errors={errors} onChange={updateProps} onLayoutChange={changeLayout} mediaActions={media.mediaActions} />}
      statusBar={<WorkspaceStatusBar><span className={exportError || saveError ? 'text-error' : ''} role={exportError || saveError ? 'alert' : undefined}>{status}</span><div className="ml-auto flex items-center gap-1"><button type="button" aria-label="缩小画布" title="缩小画布" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} className="flex h-8 w-8 items-center justify-center rounded hover:bg-background-hover disabled:opacity-35"><ZoomOut size={15} /></button><span className="w-12 text-center text-xs">{Math.round(zoom * 100)}%</span><button type="button" aria-label="放大画布" title="放大画布" disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, value + 0.1))} className="flex h-8 w-8 items-center justify-center rounded hover:bg-background-hover disabled:opacity-35"><ZoomIn size={15} /></button><button type="button" aria-label="适应窗口" title="适应窗口" onClick={() => setZoom(1)} className="flex h-8 w-8 items-center justify-center rounded hover:bg-background-hover"><Maximize2 size={15} /></button></div></WorkspaceStatusBar>}
    >
      <NativeDeckCanvas
        slide={selectedSlide}
        zoom={zoom}
        pageIndex={selectedIndex}
        pageCount={slides.length}
        onPrevious={() => slides[selectedIndex - 1] && selectPage(slides[selectedIndex - 1].pageId)}
        onNext={() => slides[selectedIndex + 1] && selectPage(slides[selectedIndex + 1].pageId)}
      />
      {exportSurfaceVisible && <NativeDeckExportSurface slides={slides} />}
      {showTasks && <div className="fixed right-4 top-24 z-50 w-[min(380px,calc(100vw-2rem))]"><ExportTasksPanel projectId={projectId} onRetry={(task) => void retryExport(task)} /></div>}
      <NativeImageSettingsDialog open={media.settingsOpen} settings={media.settings} pages={media.pages} saving={media.savingSettings} onClose={() => media.setSettingsOpen(false)} onSave={(settings) => void media.saveSettings(settings)} />
      <MaterialSelector projectId={projectId} isOpen={Boolean(media.selectedSlot)} multiple={false} maxSelection={1} onClose={media.closeSelector} onSelect={(materials) => { if (materials[0]) media.useSelectedMaterial(materials[0].url) }} />
    </WorkspaceShell>
  )
}

function nativeExportTitle(project: { project_title?: string; idea_prompt?: string } | null | undefined, slides: NativeSlideSpec[]) {
  const firstSlideTitle = firstText(slides[0]?.props.title) || firstText(slides[0]?.props.titleTop)
  return firstText(project?.project_title) || firstSlideTitle || firstText(project?.idea_prompt) || 'EasySlide'
}

function firstText(value: unknown) {
  return typeof value === 'string' ? value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''
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
