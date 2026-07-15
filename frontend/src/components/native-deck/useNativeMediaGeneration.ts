import { useMemo, useRef, useState } from 'react'
import { generateMaterialImage, getTaskStatus, updateProject, uploadMaterial } from '@/api/endpoints'
import { useProjectStore } from '@/store/useProjectStore'
import { useNativeDeckStore } from '@/store/useNativeDeckStore'
import type { NativeImageSettings } from '@/types'
import type { NativeSlideSpec } from '@/native-deck/types'
import { buildNativeMediaPrompt, collectNativeMediaSlots, getNativeMediaValue, runNativeMediaQueue, setNativeMediaValue, type NativeMediaSlot } from '@/native-deck/nativeMedia'
import type { NativeLayoutContract } from './NativeDeckPropertyPanel'

const DEFAULT_SETTINGS: NativeImageSettings = { density: 'standard', style: 'theme', custom_prompt: '', custom_counts: {} }

export function useNativeMediaGeneration({ projectId, slides, contracts, onSlideUpdate }: {
  projectId: string
  slides: NativeSlideSpec[]
  contracts: readonly NativeLayoutContract[]
  onSlideUpdate: (slide: NativeSlideSpec) => void
}) {
  const { currentProject } = useProjectStore()
  const settings = currentProject?.native_image_settings || DEFAULT_SETTINGS
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [busy, setBusy] = useState<Record<string, string>>({})
  const [selectedSlot, setSelectedSlot] = useState<NativeMediaSlot>()
  const pausedRef = useRef(false)
  const remaining = useMemo(() => collectNativeMediaSlots(slides, contracts, settings), [contracts, settings, slides])
  const pages = useMemo(() => slides.map((slide, index) => {
    const contract = contracts.find((item) => item.layout === slide.layout)
    const maxImages = Math.max(0, ...((contract?.mediaSlots || []).map((slot) => Number(slot.max ?? slot.maxCount ?? 1))))
    return { pageId: slide.pageId, title: String(slide.props.title || `第 ${index + 1} 页`), maxImages }
  }).filter((page) => page.maxImages > 0), [contracts, slides])

  const apply = (slot: NativeMediaSlot, value: string, prompt = '', overwrite = true) => {
    const current = useNativeDeckStore.getState().slides.find((item) => item.pageId === slot.pageId)
    if (!current || (!overwrite && getNativeMediaValue(current.props, slot.key, slot.index))) return
    const path = slot.index == null ? slot.key : `${slot.key}[${slot.index}]`
    const prompts = current.props.__media_prompts && typeof current.props.__media_prompts === 'object' ? current.props.__media_prompts as Record<string, string> : {}
    onSlideUpdate({ ...current, props: { ...setNativeMediaValue(current.props, slot.key, slot.index, value), __media_prompts: { ...prompts, [path]: prompt } } })
  }

  const generate = async (slot: NativeMediaSlot, prompt = '', overwrite = false, generationSettings = settings) => {
    const current = useNativeDeckStore.getState().slides.find((slide) => slide.pageId === slot.pageId)
    if (!current || (!overwrite && getNativeMediaValue(current.props, slot.key, slot.index))) return
    setBusy((state) => ({ ...state, [slot.id]: '生成中...' }))
    try {
      const created = await generateMaterialImage(projectId, buildNativeMediaPrompt(current, generationSettings, prompt), null, undefined, currentProject?.image_aspect_ratio)
      const taskId = created.data?.task_id
      if (!taskId) throw new Error('未返回图片任务 ID')
      const imageUrl = await waitForImage(projectId, taskId)
      apply(slot, imageUrl, prompt, overwrite)
      setBusy((state) => ({ ...state, [slot.id]: '' }))
    } catch (error) {
      setBusy((state) => ({ ...state, [slot.id]: error instanceof Error ? error.message : '生成失败，可重试' }))
    }
  }

  const run = async (nextSettings = settings) => {
    pausedRef.current = false
    setPaused(false)
    setRunning(true)
    const jobs = collectNativeMediaSlots(useNativeDeckStore.getState().slides, contracts, nextSettings)
    await runNativeMediaQueue(jobs, (slot) => generate(slot, '', false, nextSettings), { concurrency: 4, isPaused: () => pausedRef.current })
    setRunning(false)
  }

  const runPage = async (pageId: string, nextSettings = settings) => {
    pausedRef.current = false
    setPaused(false)
    setRunning(true)
    const jobs = collectNativeMediaSlots(useNativeDeckStore.getState().slides, contracts, nextSettings).filter((slot) => slot.pageId === pageId)
    await runNativeMediaQueue(jobs, (slot) => generate(slot, '', false, nextSettings), { concurrency: 1, isPaused: () => pausedRef.current })
    setRunning(false)
  }

  const saveSettings = async (next: NativeImageSettings) => {
    setSavingSettings(true)
    try {
      const response = await updateProject(projectId, { native_image_settings: next })
      if (response.data) useProjectStore.setState({ currentProject: response.data })
      setSettingsOpen(false)
    } finally {
      setSavingSettings(false)
    }
  }

  const upload = async (key: string, index: number | undefined, file: File) => {
    const slot = makeSlot(useNativeDeckStore.getState().selectedPageId || '', key, index)
    setBusy((state) => ({ ...state, [slot.id]: '上传中...' }))
    try {
      const response = await uploadMaterial(file, projectId)
      if (response.data?.url) apply(slot, response.data.url)
      setBusy((state) => ({ ...state, [slot.id]: '' }))
    } catch (error) {
      setBusy((state) => ({ ...state, [slot.id]: error instanceof Error ? error.message : '上传失败' }))
    }
  }

  const mediaActions = {
    busy,
    onGenerate: (key: string, index: number | undefined, prompt: string, edit: boolean) => void generate(makeSlot(useNativeDeckStore.getState().selectedPageId || '', key, index), prompt, edit),
    onUpload: (key: string, index: number | undefined, file: File) => void upload(key, index, file),
    onSelect: (key: string, index: number | undefined) => setSelectedSlot(makeSlot(useNativeDeckStore.getState().selectedPageId || '', key, index)),
  }

  return {
    settings, settingsOpen, setSettingsOpen, savingSettings, pages, remaining: remaining.length,
    running, paused, busy, mediaActions, selectedSlot, closeSelector: () => setSelectedSlot(undefined),
    runPage: (pageId: string) => void runPage(pageId),
    useSelectedMaterial: (url: string) => { if (selectedSlot) apply(selectedSlot, url); setSelectedSlot(undefined) },
    saveSettings, start: () => void run(), pause: () => { pausedRef.current = true; setPaused(true) }, resume: () => void run(),
  }
}

function makeSlot(pageId: string, key: string, index?: number): NativeMediaSlot {
  const path = index == null ? key : `${key}[${index}]`
  return { id: `${pageId}:${path}`, pageId, key, index }
}

async function waitForImage(projectId: string, taskId: string) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const task = (await getTaskStatus(projectId, taskId)).data
    if (task?.status === 'COMPLETED' && task.progress?.image_url) return String(task.progress.image_url)
    if (task?.status === 'FAILED') throw new Error(task.error_message || '图片生成失败')
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('图片生成超时，可单张重试')
}
