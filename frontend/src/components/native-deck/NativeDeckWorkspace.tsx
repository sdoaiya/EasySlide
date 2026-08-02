import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react'
import { ChevronDown, Download, FileText, Film, ListTodo, Loader2, Maximize2, MonitorPlay, Play, Plus, Redo2, RefreshCw, Settings2, Sparkles, Trash2, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react'
import type { NativeSlideSpec } from '@/native-deck/types'
import type { NarrationPreferences, NarrationPreviewResult, NarrationSpeaker, ProjectNarrationSummary, PronunciationEntry } from '@/types'
import { useNativeDeckStore } from '@/store/useNativeDeckStore'
import { useProjectStore } from '@/store/useProjectStore'
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell'
import { WorkspaceStatusBar } from '@/components/workspace/WorkspaceStatusBar'
import { PptToVideoWizard } from '@/components/content-project/PptToVideoWizard'
import { NativeDeckCanvas } from './NativeDeckCanvas'
import { NativeDeckPageRail } from './NativeDeckPageRail'
import { NativeDeckPropertyPanel, type NativeLayoutContract } from './NativeDeckPropertyPanel'
import { NativeDeckExportSurface } from './NativeDeckExportSurface'
import { exportNativeDeck } from '@/native-deck/exportNativeDeck'
import { exportNativeDeckHtml } from '@/native-deck/exportNativeDeckHtml'
import { exportNativeDeckPdf } from '@/native-deck/exportNativeDeckPdf'
import { captureNativeDeckFrameSequences, captureNativeSceneManifests } from '@/native-deck/exportNativeDeckFrames'
import { captureNativeMotionBundles } from '@/native-deck/exportNativeMotionBundle'
import { migrateNativeProps } from '@/native-deck/nativeLayoutMigration'
import { useExportTasksStore, type ExportTask } from '@/store/useExportTasksStore'
import { addPage, completeNativePptxExport, createNativePptxExport, createNativeSceneManifestRefs, deletePage, exportNativeVideo, getNativePageVersions, getProjectNarrations, getTaskStatus, handoffVideoWorkspaceFrames, preflightExportVideo, previewPageNarration, restoreNativePageVersion, type NativePageVersion, updateNativePptxProgress, updatePagesOrder, updateProject } from '@/api/endpoints'
import { apiClient } from '@/api/client'
import { ExportTasksPanel } from '@/components/shared/ExportTasksPanel'
import { MaterialSelector } from '@/components/shared/MaterialSelector'
import { Button, SegmentedControl, VoiceComparisonDialog, VoicePicker } from '@/components/shared'
import { NativeImageSettingsDialog } from './NativeImageSettingsDialog'
import { useNativeMediaGeneration } from './useNativeMediaGeneration'
import { FishNarrationAdvancedPanel, DEFAULT_NARRATION_PREFERENCES, countAdvancedModifications } from '@/components/shared/FishNarrationAdvancedPanel'
import { NarrationWorkbench } from '@/components/narration/NarrationWorkbench'

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

type NativeVideoPreset = 'business' | 'training' | 'launch' | 'brief'

type NativeVideoDirectorConfig = {
  preset: NativeVideoPreset
  motion_intensity: 'minimal' | 'subtle' | 'standard'
  subtitle_mode: 'standard' | 'highlight'
  transition: 'cut' | 'fade' | 'push'
  page_pause_ms: number
}

const NATIVE_VIDEO_PRESETS: Record<NativeVideoPreset, NativeVideoDirectorConfig> = {
  business: { preset: 'business', motion_intensity: 'subtle', subtitle_mode: 'highlight', transition: 'fade', page_pause_ms: 260 },
  training: { preset: 'training', motion_intensity: 'standard', subtitle_mode: 'highlight', transition: 'fade', page_pause_ms: 340 },
  launch: { preset: 'launch', motion_intensity: 'standard', subtitle_mode: 'highlight', transition: 'push', page_pause_ms: 180 },
  brief: { preset: 'brief', motion_intensity: 'minimal', subtitle_mode: 'standard', transition: 'cut', page_pause_ms: 120 },
}

const NATIVE_VIDEO_PRESET_LABELS: Record<NativeVideoPreset, string> = {
  business: '商务汇报',
  training: '培训课程',
  launch: '产品发布',
  brief: '简洁播报',
}

const EDGE_DEFAULT_VOICES = [
  'edge:zh-CN-XiaoxiaoNeural',
  'edge:zh-CN-YunxiNeural',
  'edge:zh-CN-YunjianNeural',
  'edge:zh-CN-XiaoyiNeural',
]

const DEFAULT_VIDEO_VOICE = EDGE_DEFAULT_VOICES[0]

const NATIVE_VIDEO_SPEAKERS: NarrationSpeaker[] = [
  { id: 'host', name: '主持人', voice: EDGE_DEFAULT_VOICES[0], rate: '+0%' },
  { id: 'expert', name: '专家', voice: EDGE_DEFAULT_VOICES[1], rate: '+0%' },
]

/** canonical voice id（edge:xxx / fish:xxx）拆分为 provider 与上游 id */
function splitCanonicalVoice(canonical: string | undefined | null): { provider: 'edge' | 'fish_audio'; id: string } {
  const value = canonical || ''
  const [prefix, ...rest] = value.split(':')
  if (prefix === 'fish') return { provider: 'fish_audio', id: rest.join(':') }
  return { provider: 'edge', id: rest.join(':') || value }
}

/** 表达方式预设 → emotion_director 映射（自然讲解 / 专业演示 / 故事表达） */
const EXPRESSION_PRESETS: Record<'natural' | 'professional' | 'story', Partial<NarrationPreferences['emotion_director']>> = {
  natural: { intensity: 'standard', pace: 'normal', pause: 'normal', relationship: 'neutral', emotion: 'calm' },
  professional: { intensity: 'standard', pace: 'normal', pause: 'normal', relationship: 'mentor', emotion: 'confident' },
  story: { intensity: 'strong', pace: 'slow', pause: 'long', relationship: 'host_guest', emotion: 'warm' },
}

type ExpressionKey = 'natural' | 'professional' | 'story' | 'custom'

function expressionFromDirector(director: NarrationPreferences['emotion_director']): ExpressionKey {
  for (const [key, preset] of Object.entries(EXPRESSION_PRESETS) as Array<[ExpressionKey, Partial<NarrationPreferences['emotion_director']>]>) {
    if (
      preset.intensity === director.intensity
      && preset.pace === director.pace
      && preset.pause === director.pause
      && preset.relationship === director.relationship
      // emotion 未设置（含历史数据里的空串）视为「自动」，不参与预设匹配
      && (!director.emotion || (preset.emotion ?? null) === (director.emotion || null))
    ) return key
  }
  return 'custom'
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

export function NativeDeckWorkspace({ projectId, slides: initialSlides, layoutContracts, pageGenerationAction, pageGenerationStatus, singlePageGenerationAction, autoSaveDelay = 800 }: NativeDeckWorkspaceProps) {
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
  const taskButtonRef = useRef<HTMLButtonElement>(null)
  const [taskPopoverStyle, setTaskPopoverStyle] = useState<CSSProperties>({ right: 16, top: 64 })
  const [exporting, setExporting] = useState(false)
  const [exportSurfaceVisible, setExportSurfaceVisible] = useState(false)
  const [exportFormat, setExportFormat] = useState<'PPTX' | 'PDF' | '离线 HTML' | '讲解视频'>('PPTX')
  const [exportError, setExportError] = useState('')
  const [showVideoSettings, setShowVideoSettings] = useState(false)
  const [showNarrationWorkbench, setShowNarrationWorkbench] = useState(false)
  const [showVideoAdvanced, setShowVideoAdvanced] = useState(false)
  const [showPptToVideoWizard, setShowPptToVideoWizard] = useState(false)
  const [videoNarrationSummary, setVideoNarrationSummary] = useState<ProjectNarrationSummary>()
  const [videoPreset, setVideoPreset] = useState<NativeVideoPreset>('business')
  const [videoNarrationMode, setVideoNarrationMode] = useState<'single' | 'dialogue'>('single')
  const [videoVoice, setVideoVoice] = useState(DEFAULT_VIDEO_VOICE)
  const [videoSpeed, setVideoSpeed] = useState(1)
  const [videoSpeakers, setVideoSpeakers] = useState<NarrationSpeaker[]>(NATIVE_VIDEO_SPEAKERS)
  const [videoAutoEmotion, setVideoAutoEmotion] = useState(true)
  const [videoPronunciationLexicon, setVideoPronunciationLexicon] = useState<PronunciationEntry[]>([])
  const [videoNarrationPreferences, setVideoNarrationPreferences] = useState<NarrationPreferences>(DEFAULT_NARRATION_PREFERENCES)
  const [videoUsageEstimate, setVideoUsageEstimate] = useState<{ characters: number; estimated_seconds: number; requests: number; roles: number; free_model_notice: string }>()
  const [videoMoreOpen, setVideoMoreOpen] = useState(false)
  const [videoComparisonOpen, setVideoComparisonOpen] = useState(false)
  const [videoPreview, setVideoPreview] = useState<NarrationPreviewResult | null>(null)
  const [videoPreviewPending, setVideoPreviewPending] = useState(false)
  const [videoPreviewError, setVideoPreviewError] = useState('')
  const [videoVoicePreviewing, setVideoVoicePreviewing] = useState('')
  const videoAudioRef = useRef<HTMLAudioElement | null>(null)
  const previewVoiceUrlRef = useRef<string | null>(null)
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
  const pageVersionsRequestSeq = useRef(0)
  const loadPageVersions = async (pageId: string) => {
    const seq = ++pageVersionsRequestSeq.current
    try {
      const response = await getNativePageVersions(projectId, pageId)
      if (seq !== pageVersionsRequestSeq.current) return // 过期响应丢弃：快速切换页面时旧请求不得覆盖新页版本
      setPageVersions(response.data?.versions || [])
    } catch {
      if (seq === pageVersionsRequestSeq.current) setPageVersions([])
    }
  }

  useEffect(() => {
    if (!selectedPageId) {
      pageVersionsRequestSeq.current += 1
      setPageVersions([])
      return
    }
    void loadPageVersions(selectedPageId)
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
      if (window.electronAPI?.setFullscreen) await window.electronAPI.setFullscreen(true)
      else if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.()
    } catch {
      // The in-app presentation layer remains available when system fullscreen is unavailable.
    }
  }

  const stopPresentation = async () => {
    setPresenting(false)
    try {
      if (window.electronAPI?.setFullscreen) await window.electronAPI.setFullscreen(false)
      else if (document.fullscreenElement) await document.exitFullscreen?.()
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
      // 函数式回滚：只基于当前 slides 重排顺序（swap 回原位置），
      // 不整体替换数组，避免覆盖回滚前其他页的新编辑
      useNativeDeckStore.setState((state) => {
        const from = state.slides.findIndex((slide) => slide.pageId === pageId)
        const to = target
        if (from < 0 || from === to || to < 0 || to >= state.slides.length) return {}
        const reordered = [...state.slides]
        ;[reordered[from], reordered[to]] = [reordered[to], reordered[from]]
        return { slides: reordered }
      })
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

  const startExport = async (formatSelection = exportFormat, directorConfig?: NativeVideoDirectorConfig) => {
    if (exporting || dirtyPageIds.size || !slides.length) return
    const id = `export-${Date.now()}`
    setExporting(true)
    setShowTasks(true)
    try {
      if (formatSelection === '讲解视频') {
        const pageIds = slides.map((slide) => slide.pageId)
        const summaryResponse = await getProjectNarrations(projectId)
        const summary = summaryResponse.data
        if (!summary) throw new Error('无法读取视频文案状态')
        setVideoNarrationSummary(summary)
        const versionByPage = new Map(summary.pages.map((page) => [page.page_id, page.current_version_id]))
        const missingPageIds = pageIds.filter((pageId) => !versionByPage.get(pageId))
        if (missingPageIds.length) {
          setShowVideoSettings(false)
          setShowNarrationWorkbench(true)
          setExportError(`还有 ${missingPageIds.length} 页没有确认稿，请先完成视频文案`)
          return
        }
        const narrationVersionMap = Object.fromEntries(pageIds.map((pageId) => [pageId, versionByPage.get(pageId)!]))
        const activeVoice = videoNarrationMode === 'single' ? videoVoice : videoSpeakers[0]?.voice
        const { provider, id: activeVoiceId } = splitCanonicalVoice(activeVoice)
        const activeSpeakers = videoNarrationMode === 'dialogue'
          ? videoSpeakers.map((speaker) => ({ ...speaker, voice: splitCanonicalVoice(speaker.voice).id }))
          : undefined
        const preflight = await preflightExportVideo(projectId, {
          pageIds,
          generateNarration: false,
          includeNoImagePages: true,
          ttsProvider: provider,
          voice: activeVoiceId,
          speed: videoSpeed,
          narrationMode: videoNarrationMode,
          speakers: activeSpeakers,
          narrationPolicy: 'confirmed_only',
          narrationVersionMap,
        })
        if (!preflight.data?.can_export) throw new Error(preflight.data?.errors?.join('；') || '视频导出预检失败')
        if (provider === 'fish_audio') {
          await updateProject(projectId, {
            pronunciation_lexicon: videoPronunciationLexicon,
            narration_preferences: videoNarrationPreferences,
          })
        }
        await showExportSurface()
        addTask({ id, taskId: '', projectId, type: 'video', status: 'PROCESSING', progress: { total: slides.length, completed: 0, percent: 1, current_step: '正在截取页面帧' } })
        const sceneManifests = captureNativeSceneManifests(slides)
        const sceneManifestRefs = await createNativeSceneManifestRefs(sceneManifests, pageIds)
        const sceneBundles = await captureNativeMotionBundles(slides, sceneManifestRefs)
        const frames = await captureNativeDeckFrameSequences()
        await handoffVideoWorkspaceFrames(projectId, frames, pageIds)
        const created = await exportNativeVideo(
          projectId,
          frames,
          pageIds,
          nativeExportFilename(exportTitle, 'mp4'),
          directorConfig || NATIVE_VIDEO_PRESETS[videoPreset],
          {
            ttsProvider: provider,
            voice: activeVoiceId,
            rate: '+0%',
            speed: videoSpeed,
            language: 'zh',
            generateNarration: false,
            narrationMode: videoNarrationMode,
            speakers: activeSpeakers,
            autoEmotion: videoAutoEmotion,
            pronunciationLexicon: videoPronunciationLexicon,
            narrationPreferences: videoNarrationPreferences,
            narrationPolicy: 'confirmed_only',
            narrationVersionMap,
          },
          sceneManifests,
          sceneBundles,
        )
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
    if (exportFormat === '讲解视频') {
      setShowVideoSettings(true)
      return
    }
    try { await startExport() } catch (error) { setExportError(error instanceof Error ? error.message : String(error)) }
  }

  const retryExport = async (task: ExportTask) => {
    const format = task.type === 'native-pdf' ? 'PDF' : task.type === 'native-html' ? '离线 HTML' : task.type === 'video' ? '讲解视频' : 'PPTX'
    setExportFormat(format)
    setExportError('')
    if (format === '讲解视频') {
      setShowVideoSettings(true)
      return
    }
    try { await startExport(format) } catch (error) { setExportError(error instanceof Error ? error.message : String(error)) }
  }

  const pendingRestartTask = tasks.find((task) =>
    task.projectId === projectId && task.type.startsWith('native-') && task.status === 'PENDING',
  )

  const updateTaskPopoverPosition = useCallback(() => {
    const trigger = taskButtonRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const width = Math.min(380, Math.max(280, window.innerWidth - 32))
    const left = Math.min(Math.max(16, rect.right - width), Math.max(16, window.innerWidth - width - 16))
    setTaskPopoverStyle({ left, top: Math.min(rect.bottom + 8, Math.max(16, window.innerHeight - 420)) })
  }, [])

  useEffect(() => {
    if (!showTasks) return
    updateTaskPopoverPosition()
    window.addEventListener('resize', updateTaskPopoverPosition)
    window.addEventListener('scroll', updateTaskPopoverPosition, true)
    return () => {
      window.removeEventListener('resize', updateTaskPopoverPosition)
      window.removeEventListener('scroll', updateTaskPopoverPosition, true)
    }
  }, [showTasks, updateTaskPopoverPosition])

  useEffect(() => {
    if (!showVideoSettings) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowVideoSettings(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showVideoSettings])

  useEffect(() => {
    if (!showVideoSettings) return
    void getProjectNarrations(projectId)
      .then((response) => setVideoNarrationSummary(response.data))
      .catch(() => setVideoNarrationSummary(undefined))
  }, [projectId, showVideoSettings])

  useEffect(() => {
    setVideoPronunciationLexicon(currentProject?.pronunciation_lexicon || [])
    setVideoNarrationPreferences(currentProject?.narration_preferences || DEFAULT_NARRATION_PREFERENCES)
  }, [currentProject?.project_id])

  const preflightRequestSeq = useRef(0)
  useEffect(() => {
    if (!showVideoSettings) return
    const narrationVersionMap = Object.fromEntries(
      (videoNarrationSummary?.pages || [])
        .filter((page) => page.current_version_id)
        .map((page) => [page.page_id, page.current_version_id!]),
    )
    const activeVoice = videoNarrationMode === 'single' ? videoVoice : videoSpeakers[0]?.voice
    const { provider, id } = splitCanonicalVoice(activeVoice)
    const seq = ++preflightRequestSeq.current
    // 防抖：每次编辑触发预检估算，400ms 静默后才真正发起请求
    const timer = setTimeout(() => {
      void preflightExportVideo(projectId, {
        pageIds: slides.map((slide) => slide.pageId), generateNarration: false, includeNoImagePages: true,
        ttsProvider: provider, voice: id,
        speed: videoSpeed, narrationMode: videoNarrationMode,
        speakers: videoNarrationMode === 'dialogue' ? videoSpeakers.map((speaker) => ({ ...speaker, voice: splitCanonicalVoice(speaker.voice).id })) : undefined,
        narrationPolicy: 'confirmed_only', narrationVersionMap,
      }).then((response) => {
        if (seq === preflightRequestSeq.current) setVideoUsageEstimate(response.data?.estimate)
      }).catch(() => {
        if (seq === preflightRequestSeq.current) setVideoUsageEstimate(undefined)
      })
    }, 400)
    return () => { preflightRequestSeq.current += 1; clearTimeout(timer) }
  }, [projectId, showVideoSettings, slides, videoVoice, videoNarrationMode, videoNarrationSummary, videoSpeakers, videoSpeed])

  useEffect(() => {
    if (pendingRestartTask && !exporting && !dirtyPageIds.size && slides.length) {
      const format = pendingRestartTask.type === 'native-pdf' ? 'pdf' : pendingRestartTask.type === 'native-html' ? 'html' : 'pptx'
      void runExport(pendingRestartTask.id, pendingRestartTask.taskId, format)
    }
  }, [pendingRestartTask?.taskId, slides.length, dirtyPageIds.size, exporting])

  useEffect(() => {
    const handleBrowserFullscreenChange = () => {
      if (!document.fullscreenElement) setPresenting(false)
    }
    document.addEventListener('fullscreenchange', handleBrowserFullscreenChange)
    const unsubscribeDesktopFullscreen = window.electronAPI?.onFullscreenChange?.((enabled) => {
      if (!enabled) setPresenting(false)
    })
    return () => {
      document.removeEventListener('fullscreenchange', handleBrowserFullscreenChange)
      unsubscribeDesktopFullscreen?.()
    }
  }, [])

  // ── 讲解视频设置：声音方案派生状态与操作 ──
  const activeVoiceCanonical = videoNarrationMode === 'single' ? videoVoice : (videoSpeakers[0]?.voice || videoVoice)
  const activeProvider = splitCanonicalVoice(activeVoiceCanonical).provider
  const advancedCount = countAdvancedModifications(videoNarrationPreferences, videoPronunciationLexicon, videoAutoEmotion)
  const currentPageId = slides[selectedIndex]?.pageId
  const currentPageVersionId = videoNarrationSummary?.pages.find((page) => page.page_id === currentPageId)?.current_version_id
  const currentExpression = expressionFromDirector(videoNarrationPreferences.emotion_director)
  /** 多人模式主持人切到 Fish 引擎时，其他角色声音被置空导致导出被禁用——给出可见提示 */
  const missingGuestVoice = videoNarrationMode === 'dialogue' && videoSpeakers.some((speaker, index) => index > 0 && !speaker.voice)

  /** 多人模式主持人换声音：其他角色跟随切到同引擎默认，避免混用 Edge/Fish */
  const handleHostVoiceChange = (canonical: string) => {
    setVideoSpeakers((current) => {
      const { provider } = splitCanonicalVoice(canonical)
      return current.map((speaker, index) => {
        if (index === 0) return { ...speaker, voice: canonical }
        if (splitCanonicalVoice(speaker.voice).provider === provider) return speaker
        const defaults = provider === 'edge' ? EDGE_DEFAULT_VOICES : []
        return { ...speaker, voice: defaults[Math.min(index, defaults.length - 1)] || '' }
      })
    })
  }

  const addVideoSpeaker = () => {
    setVideoSpeakers((current) => {
      const { provider } = splitCanonicalVoice(current[0]?.voice || DEFAULT_VIDEO_VOICE)
      const defaults = provider === 'edge' ? EDGE_DEFAULT_VOICES : []
      // 从 3 开始向上探测第一个未被占用的序号，避免删除后再次添加撞 id
      let guestIndex = 3
      while (current.some((speaker) => speaker.id === `guest_${guestIndex}`)) guestIndex += 1
      return [...current, { id: `guest_${guestIndex}`, name: `嘉宾 ${guestIndex}`, voice: defaults[current.length % Math.max(defaults.length, 1)] || '', rate: '+0%' }]
    })
  }

  /** 角色行单声音试听（固定示例文案，与 VoicePicker 内试听一致） */
  const releasePreviewVoiceUrl = () => {
    if (previewVoiceUrlRef.current) {
      URL.revokeObjectURL(previewVoiceUrlRef.current)
      previewVoiceUrlRef.current = null
    }
  }
  const previewVoice = async (canonical: string) => {
    if (!canonical || videoVoicePreviewing) return
    setVideoVoicePreviewing(canonical)
    setVideoPreviewError('')
    try {
      const response = await apiClient.get(`/api/voices/${encodeURIComponent(canonical)}/preview`, { responseType: 'blob' })
      const url = URL.createObjectURL(response.data as Blob)
      previewVoiceUrlRef.current = url
      if (videoAudioRef.current) {
        videoAudioRef.current.pause()
        videoAudioRef.current.onended = null
        videoAudioRef.current.onerror = null
      }
      const audio = new Audio(url)
      videoAudioRef.current = audio
      audio.onended = releasePreviewVoiceUrl
      audio.onerror = releasePreviewVoiceUrl
      try {
        await audio.play()
      } catch {
        // 自动播放策略拦截时 onended 不会触发：立即释放 blob URL，避免泄漏
        releasePreviewVoiceUrl()
        setVideoPreviewError('试听失败，请稍后重试')
      }
    } catch {
      setVideoPreviewError('试听失败，请稍后重试')
    } finally {
      setVideoVoicePreviewing('')
    }
  }

  // 讲解视频设置面板关闭时兜底释放未结束试听的 blob URL
  useEffect(() => {
    if (showVideoSettings) return
    if (videoAudioRef.current) {
      videoAudioRef.current.pause()
      videoAudioRef.current.onended = null
      videoAudioRef.current.onerror = null
      videoAudioRef.current = null
    }
    releasePreviewVoiceUrl()
  }, [showVideoSettings])

  /** 试听当前页：用当前确认稿 + 当前声音配置合成整页音频 */
  const previewCurrentPage = async () => {
    if (!currentPageId || !currentPageVersionId) {
      setVideoPreviewError('当前页还没有确认稿，请先完成视频文案')
      return
    }
    setVideoPreviewPending(true)
    setVideoPreviewError('')
    try {
      const { provider, id } = splitCanonicalVoice(activeVoiceCanonical)
      const response = await previewPageNarration(projectId, currentPageId, {
        versionId: currentPageVersionId,
        ttsProvider: provider,
        voice: id,
        speakers: videoNarrationMode === 'dialogue'
          ? videoSpeakers.map((speaker) => ({ ...speaker, voice: splitCanonicalVoice(speaker.voice).id }))
          : undefined,
        autoEmotion: videoAutoEmotion,
      })
      setVideoPreview(response.data || null)
    } catch (cause) {
      setVideoPreviewError(cause instanceof Error ? cause.message : '试听失败，请稍后重试')
      setVideoPreview(null)
    } finally {
      setVideoPreviewPending(false)
    }
  }

  /** A/B 对比弹窗「采用」：单人应用主声音，多人应用到主持人并同步引擎 */
  const adoptComparisonVoice = (canonical: string) => {
    if (videoNarrationMode === 'single') setVideoVoice(canonical)
    else handleHostVoiceChange(canonical)
  }

  const applyExpression = (key: ExpressionKey) => {
    if (key === 'custom') return
    setVideoNarrationPreferences({
      ...videoNarrationPreferences,
      emotion_director: { ...videoNarrationPreferences.emotion_director, ...EXPRESSION_PRESETS[key] },
    })
  }


  const pageRail = (
    <NativeDeckPageRail slides={slides} selectedPageId={selectedPageId} onSelect={selectPage} onAdd={() => void createSlide()} onDuplicate={(pageId) => void createSlide(slides.find((slide) => slide.pageId === pageId))} onDelete={(pageId) => void removeSlide(pageId)} onMove={(pageId, direction) => void moveSlide(pageId, direction)} pageAction={pageGenerationAction} pageGenerationAction={singlePageGenerationAction || (media.pages.length > 0 ? { label: '生成本页', disabled: media.running, onClick: media.runPage } : undefined)} />
  );

  return (
    <WorkspaceShell
      softBorders
      presenting={presenting}
      toolbar={(
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="hidden min-w-0 flex-col leading-tight md:flex">
              <div className="flex min-w-0 items-center gap-2">
                <strong className="truncate text-lg">预览</strong>
                <span className="rounded-[var(--app-radius-control)] border border-[var(--app-accent-soft)] bg-[var(--app-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--app-accent)]">Step 3 · 视觉成稿</span>
              </div>
              <span className="truncate text-[11px] text-[var(--app-text-tertiary)]">生成内容、预览并导出交付</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" aria-label="撤销" title="撤销" disabled={!historyPast.current.length} onClick={undo} className="hidden h-10 w-9 items-center justify-center rounded-lg text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] disabled:opacity-30 md:inline-flex"><Undo2 size={17} aria-hidden="true" /></button>
            <button type="button" aria-label="重做" title="重做" disabled={!historyFuture.current.length} onClick={redo} className="hidden h-10 w-9 items-center justify-center rounded-lg text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] disabled:opacity-30 md:inline-flex"><Redo2 size={17} aria-hidden="true" /></button>
            <button type="button" aria-label="项目设置" title="配图设置" onClick={() => media.setSettingsOpen(true)} className="hidden h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] lg:inline-flex"><Settings2 size={17} />配图设置</button>
            {media.pages.length > 0 && (
              <button type="button" aria-label={media.running ? (media.paused ? '继续生成' : '暂停生成') : '批量生成'} title={media.remaining > 0 ? `批量生成 ${media.remaining} 个内容位` : '没有待生成内容'} disabled={!media.running && media.remaining === 0} onClick={media.running ? (media.paused ? media.resume : media.pause) : media.start} className="hidden h-10 items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-sm font-semibold text-[var(--app-accent)] hover:bg-[var(--app-surface-hover)] disabled:cursor-not-allowed disabled:opacity-45 lg:inline-flex"><Sparkles size={17} />{media.running ? (media.paused ? '继续生成' : '暂停生成') : '批量生成'}</button>
            )}
            <button type="button" onClick={() => window.location.reload()} className="hidden h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] md:inline-flex"><RefreshCw size={17} />刷新</button>
            <button type="button" aria-label={presenting ? '退出演示模式' : '演示模式'} title={presenting ? '退出演示模式' : '演示模式'} onClick={() => void (presenting ? stopPresentation() : startPresentation())} className="hidden h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] md:inline-flex"><MonitorPlay size={17} />{presenting ? '退出演示' : '演示'}</button>
            <button type="button" aria-label="视频文案" title="编辑视频文案" onClick={() => setShowNarrationWorkbench(true)} className="hidden h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] lg:inline-flex"><FileText size={17} />视频文案</button>
            <button type="button" aria-label="转换视频" title="从当前 PPT 生成视频候选" onClick={() => setShowPptToVideoWizard(true)} className="hidden h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] lg:inline-flex"><Film size={17} />转换视频</button>
            <div className="relative">
              <button ref={taskButtonRef} type="button" aria-label="导出任务" title="导出任务" onClick={() => setShowTasks((value) => !value)} className="relative flex h-10 items-center gap-1 rounded-[var(--app-radius-control)] px-2 text-sm font-semibold hover:bg-[var(--app-surface-hover)] active:scale-[0.98]">
                <ListTodo size={17} aria-hidden="true" />{tasks.filter((task) => task.projectId === projectId).length || 0}
              </button>
              {showTasks && <div data-testid="native-export-task-popover" className="fixed z-[120] w-[min(380px,calc(100vw-2rem))]" style={taskPopoverStyle}><ExportTasksPanel projectId={projectId} onRetry={(task) => void retryExport(task)} /></div>}
            </div>
            <div className="hidden items-center gap-1 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-1 md:flex">
              <button type="button" aria-label="缩小画布" title="缩小画布" disabled={zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} className="flex h-8 w-8 items-center justify-center rounded-[var(--app-radius-control)] hover:bg-[var(--app-surface-hover)] disabled:opacity-35"><ZoomOut size={15} /></button>
              <span className="w-12 text-center text-xs text-[var(--app-text-secondary)]">{Math.round(zoom * 100)}%</span>
              <button type="button" aria-label="放大画布" title="放大画布" disabled={zoom >= 2} onClick={() => setZoom((value) => Math.min(2, value + 0.1))} className="flex h-8 w-8 items-center justify-center rounded-[var(--app-radius-control)] hover:bg-[var(--app-surface-hover)] disabled:opacity-35"><ZoomIn size={15} /></button>
              <button type="button" aria-label="适应窗口" title="适应窗口" onClick={() => setZoom(1)} className="flex h-8 w-8 items-center justify-center rounded-[var(--app-radius-control)] hover:bg-[var(--app-surface-hover)]"><Maximize2 size={15} /></button>
            </div>
            <select aria-label="导出格式" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as typeof exportFormat)} className="hidden h-10 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-sm md:block">
              <option>PPTX</option><option>PDF</option><option>离线 HTML</option><option>讲解视频</option>
            </select>
          <button type="button" aria-label={`导出${exportFormat}`} title={dirtyPageIds.size ? '请等待页面保存完成' : `导出${exportFormat}`} disabled={exporting || Boolean(dirtyPageIds.size) || !slides.length} onClick={() => void exportSelectedFormat()} className="flex h-10 items-center gap-2 rounded-md bg-[var(--app-primary-action)] px-4 text-sm font-semibold text-[var(--app-surface)] transition-colors hover:bg-[var(--app-primary-action-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
              <Download size={18} aria-hidden="true" />{exporting ? '导出中' : '导出'}
            </button>
          </div>
        </div>
      )}
      statusBar={(
        <WorkspaceStatusBar className="gap-4">
          <span className="inline-flex items-center gap-2" role="status" aria-live="polite"><span className={`h-1.5 w-1.5 rounded-full ${dirtyPageIds.size || exportError || saveError ? 'bg-[var(--app-warning)]' : 'bg-[var(--app-success)]'}`} aria-hidden="true" />{saveStatus}</span>
          <span>{slides.length ? `第 ${selectedIndex + 1} / ${slides.length} 页` : '0 页'}</span>
          <span className="hidden sm:inline">{currentProject?.image_aspect_ratio || '16:9'}</span>
          <span className="ml-auto whitespace-nowrap">{Math.round(zoom * 100)}% · 原生可编辑模式</span>
        </WorkspaceStatusBar>
      )}
      sidebar={pageRail}
      inspector={<NativeDeckPropertyPanel slide={selectedSlide} contract={contract} contracts={layoutContracts} errors={errors} onChange={updateProps} onLayoutChange={changeLayout} onRegenerate={selectedSlide && singlePageGenerationAction ? () => singlePageGenerationAction.onClick(selectedSlide.pageId) : undefined} versions={pageVersions} onRestoreVersion={(versionId) => void restorePageVersion(versionId)} onApplyAnimation={applyAnimationToAll} mediaActions={media.mediaActions} pageNarrationOverrides={selectedPageId ? videoNarrationPreferences.page_overrides[selectedPageId] || {} : {}} onPageNarrationOverridesChange={(value) => setVideoNarrationPreferences((preferences) => {
        const pageOverrides = { ...preferences.page_overrides }
        if (selectedPageId) {
          if (Object.keys(value).length) pageOverrides[selectedPageId] = value as never
          else delete pageOverrides[selectedPageId]
        }
        return { ...preferences, page_overrides: pageOverrides }
      })} />}
    >
      <div className="relative flex h-full min-w-0 flex-col">
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
      {presenting && selectedSlide && <div role="dialog" aria-label="演示模式" className="fixed inset-0 z-[100] bg-[var(--app-canvas)]">
        <button type="button" aria-label="退出演示模式" title="退出演示" onClick={() => void stopPresentation()} className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center rounded-lg bg-[color:var(--app-surface)]/85 text-[var(--app-text)] hover:bg-[color:var(--app-surface)]/95"><X size={20} /></button>
        <NativeDeckCanvas slide={selectedSlide} pageIndex={selectedIndex} pageCount={slides.length} onPrevious={() => slides[selectedIndex - 1] && selectPage(slides[selectedIndex - 1].pageId)} onNext={() => slides[selectedIndex + 1] && selectPage(slides[selectedIndex + 1].pageId)} presenting mediaContract={contract} />
      </div>}
      <NativeImageSettingsDialog open={media.settingsOpen} settings={media.settings} pages={media.pages} saving={media.savingSettings} onClose={() => media.setSettingsOpen(false)} onSave={(settings) => void media.saveSettings(settings)} />
      <MaterialSelector projectId={projectId} isOpen={Boolean(media.selectedSlot)} multiple={false} maxSelection={1} onClose={media.closeSelector} onSelect={(materials) => { if (materials[0]) media.useSelectedMaterial(materials[0].url) }} mediaKindFilter={['image']} />
      {showVideoSettings && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[color:var(--app-surface)]/80 p-4" onMouseDown={() => setShowVideoSettings(false)}>
          <section role="dialog" aria-modal="true" aria-label="讲解视频设置" className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--app-radius-panel)] border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-[var(--app-shadow-elevated)]" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b border-[var(--app-border)] px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--app-text)]">讲解视频设置</h2>
                <p className="mt-1 text-sm text-[var(--app-text-secondary)]">选择成片节奏，原生元素会按页面动效分阶段呈现。</p>
              </div>
              <button type="button" aria-label="关闭讲解视频设置" onClick={() => setShowVideoSettings(false)} className="flex h-9 w-9 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-tertiary)] hover:bg-[var(--app-surface-hover)]"><X size={18} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="flex items-center justify-between gap-4 rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 py-2.5 text-sm">
              <div>
                <p className="font-medium text-[var(--app-text)]">视频文案</p>
                <p className="text-[var(--app-text-secondary)]">
                  {videoNarrationSummary
                    ? `已确认 ${videoNarrationSummary.confirmed_pages} / ${videoNarrationSummary.total_pages} 页${videoNarrationSummary.missing_pages ? `，缺少 ${videoNarrationSummary.missing_pages} 页` : ''}`
                    : '正在读取文案状态…'}
                </p>
              </div>
              <button type="button" onClick={() => { setShowVideoSettings(false); setShowNarrationWorkbench(true) }} className="h-9 shrink-0 rounded-[var(--app-radius-control)] px-3 text-sm font-semibold text-[var(--app-accent)] hover:bg-[var(--app-surface-hover)]">编辑文案</button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(NATIVE_VIDEO_PRESETS) as NativeVideoPreset[]).map((preset) => (
                <button key={preset} type="button" aria-pressed={videoPreset === preset} onClick={() => setVideoPreset(preset)} className={`h-10 rounded-[var(--app-radius-control)] border px-3 text-sm font-semibold transition-colors active:scale-[0.98] ${videoPreset === preset ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]' : 'border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]'}`}>
                  {NATIVE_VIDEO_PRESET_LABELS[preset]}
                </button>
              ))}
            </div>
            <div className="mt-5 space-y-4">
              <h3 className="text-sm font-semibold">声音方案</h3>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--app-text-secondary)]">旁白模式</span>
                <SegmentedControl
                  ariaLabel="旁白模式"
                  value={videoNarrationMode}
                  onChange={setVideoNarrationMode}
                  options={[
                    { value: 'single', label: '单人旁白' },
                    { value: 'dialogue', label: '多人对话' },
                  ]}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-[var(--app-text-secondary)]">角色与声音</p>
                {videoNarrationMode === 'single' ? (
                  <div className="grid grid-cols-[minmax(100px,0.8fr)_minmax(160px,1.4fr)_auto] items-center gap-2">
                    <span className="text-sm text-[var(--app-text-secondary)]">旁白</span>
                    <VoicePicker value={videoVoice} onChange={setVideoVoice} language="zh" allowUnset={false} />
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label="试听旁白声音" title="试听" disabled={!videoVoice || !!videoVoicePreviewing} onClick={() => void previewVoice(videoVoice)} className="flex h-9 w-9 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] disabled:opacity-40">
                        {videoVoicePreviewing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                      </button>
                      <button type="button" aria-label="更多设置" aria-expanded={videoMoreOpen} title="更多设置" onClick={() => setVideoMoreOpen((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]">
                        <ChevronDown size={14} className={`transition-transform ${videoMoreOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {videoSpeakers.map((speaker, index) => (
                      <div key={speaker.id} className="grid grid-cols-[minmax(100px,0.8fr)_minmax(160px,1.4fr)_auto] items-center gap-2">
                        <input aria-label={`角色 ${index + 1} 名称`} value={speaker.name} onChange={(event) => setVideoSpeakers((current) => current.map((item) => item.id === speaker.id ? { ...item, name: event.target.value } : item))} className="h-9 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm" />
                        <VoicePicker
                          value={speaker.voice}
                          onChange={(canonical) => index === 0
                            ? handleHostVoiceChange(canonical)
                            : setVideoSpeakers((current) => current.map((item) => item.id === speaker.id ? { ...item, voice: canonical } : item))}
                          language="zh"
                          allowUnset={false}
                          providerFilter={index === 0 ? undefined : activeProvider}
                        />
                        <div className="flex items-center gap-1">
                          <button type="button" aria-label={`试听 ${speaker.name} 声音`} title="试听" disabled={!speaker.voice || !!videoVoicePreviewing} onClick={() => void previewVoice(speaker.voice)} className="flex h-9 w-9 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] disabled:opacity-40">
                            {videoVoicePreviewing === speaker.voice ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                          </button>
                          {index === 0 && (
                            <button type="button" aria-label="更多设置" aria-expanded={videoMoreOpen} title="更多设置" onClick={() => setVideoMoreOpen((value) => !value)} className="flex h-9 w-9 items-center justify-center rounded-[var(--app-radius-control)] border border-[var(--app-border)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]">
                              <ChevronDown size={14} className={`transition-transform ${videoMoreOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                            </button>
                          )}
                          <button type="button" aria-label={`删除角色 ${index + 1}`} title="删除角色" disabled={videoSpeakers.length <= 2} onClick={() => setVideoSpeakers((current) => current.filter((item) => item.id !== speaker.id))} className="flex h-9 w-9 items-center justify-center rounded-[var(--app-radius-control)] text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)] disabled:opacity-30"><Trash2 size={15} /></button>
                        </div>
                      </div>
                    ))}
                    <button type="button" disabled={videoSpeakers.length >= 4} onClick={addVideoSpeaker} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--app-radius-control)] px-2 text-sm font-semibold text-[var(--app-accent)] hover:bg-[var(--app-surface-hover)] disabled:opacity-40"><Plus size={14} />添加角色</button>
                  </div>
                )}
                {videoMoreOpen && (
                  <div className="rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3">
                    <label className="grid gap-1.5 text-xs text-[var(--app-text-secondary)]">
                      <span>语速</span>
                      <select aria-label="语速" value={videoSpeed} onChange={(event) => setVideoSpeed(Number(event.target.value))} className="h-8 w-full rounded-[var(--app-radius-control)] border border-[var(--app-border)] bg-[var(--app-surface)] px-2 text-sm text-[var(--app-text)]">
                        <option value={0.85}>慢速 0.85</option>
                        <option value={1}>标准 1.0</option>
                        <option value={1.15}>稍快 1.15</option>
                        <option value={1.2}>快速 1.2</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--app-text-secondary)]">表达方式</p>
                <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-[var(--app-radius-control)] bg-[var(--app-surface-secondary)] p-1 sm:grid-cols-4">
                  {([['natural', '自然讲解'], ['professional', '专业演示'], ['story', '故事表达'], ['custom', '自定义']] as const).map(([key, label]) => (
                    <button key={key} type="button" aria-pressed={currentExpression === key} onClick={() => applyExpression(key)} className={`h-9 rounded-[var(--app-radius-control)] px-3 text-sm font-semibold ${currentExpression === key ? 'bg-[var(--app-surface)] text-[var(--app-text)] shadow-[var(--app-shadow-control)]' : 'text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {activeProvider === 'fish_audio' && (
                <label className="flex items-center justify-between gap-4 text-sm font-medium">
                  <span>场景自动匹配语气</span>
                  <input type="checkbox" aria-label="场景自动匹配语气" checked={videoAutoEmotion} onChange={(event) => setVideoAutoEmotion(event.target.checked)} className="h-4 w-4 accent-[var(--app-accent)]" />
                </label>
              )}
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--app-border)] pt-3">
                <Button type="button" size="sm" variant="secondary" icon={<Play size={14} aria-hidden="true" />} loading={videoPreviewPending} disabled={!currentPageVersionId} onClick={() => void previewCurrentPage()}>试听当前页</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setVideoComparisonOpen(true)}>比较声音</Button>
                {videoPreviewError && <p role="alert" className="w-full text-xs text-[var(--app-error)]">{videoPreviewError}</p>}
                {videoPreview?.audio_url && <audio controls src={videoPreview.audio_url} className="h-9 w-44" aria-label="当前页试听" />}
                {videoPreview && !videoPreviewError && (
                  <span className="text-xs text-[var(--app-text-tertiary)]">{videoPreview.cache_hit ? '已命中缓存' : '本次新生成'} · {videoPreview.timing_quality}</span>
                )}
              </div>
            </div>
            <div className="mt-5">
              <button type="button" aria-expanded={showVideoAdvanced} onClick={() => setShowVideoAdvanced((value) => !value)} className="flex h-10 w-full items-center justify-between gap-2 rounded-[var(--app-radius-control)] border border-[var(--app-border)] px-3 text-sm font-semibold text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]">
                <span>高级制作</span>
                <span className="flex items-center gap-2 text-xs font-normal text-[var(--app-text-tertiary)]">
                  {advancedCount > 0 && <span>{advancedCount} 项已修改</span>}
                  <ChevronDown size={15} className={`transition-transform ${showVideoAdvanced ? 'rotate-180' : ''}`} aria-hidden="true" />
                </span>
              </button>
              {showVideoAdvanced && (
                <div className="mt-3">
                  {activeProvider === 'fish_audio' ? (
                    <FishNarrationAdvancedPanel
                      autoEmotion={videoAutoEmotion}
                      pronunciationLexicon={videoPronunciationLexicon}
                      narrationPreferences={videoNarrationPreferences}
                      onVoiceChange={(voice) => {
                        const canonical = voice.startsWith('fish:') ? voice : `fish:${voice}`
                        if (videoNarrationMode === 'single') setVideoVoice(canonical)
                        else handleHostVoiceChange(canonical)
                      }}
                      onSpeedChange={setVideoSpeed}
                      onPronunciationLexiconChange={setVideoPronunciationLexicon}
                      onNarrationPreferencesChange={setVideoNarrationPreferences}
                    />
                  ) : (
                    <p className="text-xs leading-5 text-[var(--app-text-tertiary)]">当前使用 Edge 声音，高级制作选项在 Fish Audio 声音下生效。</p>
                  )}
                </div>
              )}
            </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--app-border)] px-5 py-3">
              <p className="min-w-0 text-xs text-[var(--app-text-tertiary)]" aria-live="polite">
                {videoUsageEstimate
                  ? `${videoUsageEstimate.characters} 字 · 约 ${videoUsageEstimate.estimated_seconds} 秒 · ${videoUsageEstimate.requests} 次请求 · ${videoUsageEstimate.roles} 个角色`
                  : '正在估算本次制作…'}
                {videoUsageEstimate?.free_model_notice && <span className="block truncate">{videoUsageEstimate.free_model_notice}</span>}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {missingGuestVoice && <p role="alert" className="text-xs text-[var(--app-error)]">请为其他角色选择克隆声音</p>}
                <button type="button" onClick={() => setShowVideoSettings(false)} className="h-10 rounded-[var(--app-radius-control)] px-4 text-sm font-semibold text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-hover)]">取消</button>
                <button type="button" disabled={videoNarrationMode === 'dialogue' && (videoSpeakers.length < 2 || videoSpeakers.some((speaker) => !speaker.name.trim() || !speaker.voice))} onClick={() => {
                  const config = NATIVE_VIDEO_PRESETS[videoPreset]
                  setShowVideoSettings(false)
                  void startExport('讲解视频', config).catch((error) => setExportError(error instanceof Error ? error.message : String(error)))
                }} className="h-10 rounded-[var(--app-radius-control)] bg-[var(--app-primary-action)] px-4 text-sm font-semibold text-[var(--app-surface)] hover:bg-[var(--app-primary-action-hover)] disabled:cursor-not-allowed disabled:opacity-45">开始导出视频</button>
              </div>
            </div>
          </section>
        </div>
      )}
      <VoiceComparisonDialog
        isOpen={videoComparisonOpen}
        voiceA={activeVoiceCanonical}
        onClose={() => setVideoComparisonOpen(false)}
        onAdopt={adoptComparisonVoice}
      />
      <NarrationWorkbench
        open={showNarrationWorkbench}
        projectId={projectId}
        initialPageId={selectedPageId || slides[0]?.pageId}
        pageIds={slides.map((slide) => slide.pageId)}
        onClose={() => setShowNarrationWorkbench(false)}
        onSummaryChange={setVideoNarrationSummary}
      />
      <PptToVideoWizard
        projectId={projectId}
        isOpen={showPptToVideoWizard}
        onClose={() => setShowPptToVideoWizard(false)}
      />
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
